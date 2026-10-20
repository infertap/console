// SPDX-License-Identifier: AGPL-3.0-only
/** What every response builder shares: the stamp, the figure, the day masses and buckets, pagination, the scope slice. */
import * as w from '../world';
import type {
  ApiErrorBody,
  Bucket,
  Cause,
  Figure,
  Page,
  ReachJson,
  Refusal,
  Stamp,
  WindowJson,
} from '../../../domain/contract';
import { ApiError } from '../../../domain/refusal';
import { THRASH_EDGE_MS, holderMember } from '../thrash';

const TOKEN_WEIGHTED = 'token-weighted';
/** The coverage basis that asks whether telemetry was present at all. */
export const INSTANCE_TIME = 'instance-time';
const LOWER_BOUND = '>=';

/** A covered figure as the wire states it: a lower bound with its coverage and basis. */
export function figure(value: number, coverage: number, kind = TOKEN_WEIGHTED): Figure {
  return { value, register: LOWER_BOUND, coverage, coverage_kind: kind };
}

/** The window object a response carries, from two day strings. */
export function windowJson(startDay: string, endDay: string): WindowJson {
  return {
    start_day: startDay,
    end_day: endDay,
    start_ms: w.dayStartMs(startDay),
    // `end_day` is the last day COVERED, not the exclusive bound.
    end_ms: w.dayStartMs(endDay) + 86_400_000,
  };
}

/**
 * The stamp every 200 carries.
 *
 * Identical across responses at steady state, which is what makes the canonical-stamp-once
 * rendering possible: the document declares its stamp under the title, and a section that
 * deviates is visible by contrast rather than by volume.
 *
 * Before the first pass there is still a stamp, because `/v1/stamp` answers at t0 and the page
 * needs a window to state. Both `pass` fields are NULL there rather than zero or an empty
 * string: no day has been classified, and inventing one would be the live edge lying on day one.
 */
export function stampFor(age: w.AgeScript): Stamp {
  const window = w.stampedWindow(age);
  return {
    fleet_id: w.FLEET_ID,
    semantics_version: w.SEMANTICS_CURRENT,
    discriminator: w.DISCRIMINATOR_CURRENT,
    window: windowJson(window.start, window.end),
    tick: {
      at_ms: age.passes === 0 ? null : age.atMs,
      classified_day: age.passes === 0 ? null : w.frontierDay(age),
      // Noon of the classified day: the edges sit inside it, as a live tick's do.
      classified_to_ms: age.passes === 0 ? null : w.dayStartMs(w.frontierDay(age)) + 43_200_000,
      emitted_to_ms: age.passes === 0 ? null : w.dayStartMs(w.frontierDay(age)) + 43_200_000,
      covered_to_ms: age.passes === 0 ? null : w.dayStartMs(w.frontierDay(age)) + 43_200_000,
      // Every sample agreed, so the audit edge is the classified edge.
      audited_to_ms: age.passes === 0 ? null : w.dayStartMs(w.frontierDay(age)) + 43_200_000,
      settled_through_day: age.passes === 0 ? null : w.auditedThroughDay(age),
    },
    raw_horizon: {
      // Measured, never declared: the oldest instant raw actually holds. `declared_days` sits
      // beside it as the configured horizon, two labelled numbers with no inference between them.
      from_ms: w.dayStartMs(window.start),
      from_day: window.start,
      declared_days: w.RAW_HORIZON_DAYS,
    },
    analyzer_version: w.ANALYZER_VERSION,
  };
}

/**
 * Build a 4xx/5xx error body.
 *
 * No cast. `Error.bound` and `Error.requested` carry `additionalProperties: true` as of
 * 2026-08-05, so a generated client can read a bound and construct one. This helper used to
 * exist only to launder a `Record<string, never>`; it now exists because three call sites want
 * the same three fields.
 */
export function errorBody(
  cause: Cause,
  message: string,
  bound?: Record<string, unknown>,
): ApiErrorBody {
  return { cause, message, ...(bound === undefined ? {} : { bound }) };
}

/**
 * Pass-clock endpoints before the first pass.
 *
 * Never a zero. The pass having never run is a 503 with `no_pass_yet`, and
 * the console renders that as the t0 page state rather than as a failure the operator caused.
 */
export function requirePass(age: w.AgeScript): void {
  // The server answers 200 with a stamp whose `pass.frontier_day` is null; the live data
  // layer turns that into `ApiError.notYetPassed()` on every pass-derived read, and this is
  // the corpus doing the same at the same seam. The builders that call this ARE the list of
  // pass-derived reads, mirrored in `data/live/source.ts`.
  if (age.passes === 0) throw ApiError.notYetPassed();
}

const CLASS_SPLIT: readonly (readonly [string, number])[] = [
  ['cold', 0.94],
  ['RE', 0.03],
  ['re_admit', 0.02],
  ['indeterminate', 0.01],
];

/** One day of the corpus's classified mass, by class, with its coverage and event count. */
export interface DayMass {
  readonly date: string;
  readonly dayIdx: number;
  readonly stored: number;
  readonly etr: number;
  readonly postClear: number;
  readonly coverage: number;
  readonly examined: boolean;
}

/**
 * Per-day masses whose last 14 days sum EXACTLY to the ledger.
 *
 * The de-duplication rule puts the current fraction at the live edge of the trend and the
 * register and denominator in the sums footer. Those are two renders of one arithmetic, so the
 * trend's window is normalised onto the ledger's totals rather than generated beside them. The
 * shape survives the normalisation: scaling mass and denominator over the same days preserves
 * every ratio between them.
 */
export function dayMasses(age: w.AgeScript): readonly DayMass[] {
  const points = w.trendFor(age);
  const shape = points.map((_p, i) => 1 + 0.18 * Math.sin(i * 0.7) + 0.06 * ((i * 37) % 11) / 11);

  const windowFrom = w.TREND_DAYS - w.WINDOW_14D.days;
  const shapeSum = shape.slice(windowFrom).reduce((a, b) => a + b, 0);
  const wasteWeights = points
    .slice(windowFrom)
    .map((p, i) => p.value * (shape[windowFrom + i] ?? 1));
  const wasteSum = wasteWeights.reduce((a, b) => a + b, 0);

  const etrShare = w.classFull('ETR') / w.WASTE_FULL;

  let storedAcc = 0;
  let etrAcc = 0;
  let postAcc = 0;

  return points.map((p, i) => {
    const inWindow = i >= windowFrom;
    let stored: number;
    let waste: number;

    if (inWindow) {
      const last = i === w.TREND_DAYS - 1;
      stored = last
        ? w.STORED_FULL - storedAcc
        : Math.round((w.STORED_FULL * (shape[i] ?? 1)) / shapeSum);
      const wasteRaw = last
        ? w.WASTE_FULL - etrAcc - postAcc
        : Math.round((w.WASTE_FULL * (wasteWeights[i - windowFrom] ?? 0)) / wasteSum);
      waste = wasteRaw;
      storedAcc += stored;
    } else {
      stored = Math.round((w.STORED_FULL / w.WINDOW_14D.days) * (shape[i] ?? 1));
      waste = Math.round(stored * p.value);
    }

    const etr = i === w.TREND_DAYS - 1 && inWindow
      ? w.classFull('ETR') - etrAcc
      : Math.round(waste * etrShare);
    const postClear = i === w.TREND_DAYS - 1 && inWindow ? w.classFull('post_clear') - postAcc : waste - etr;
    if (inWindow) {
      etrAcc += etr;
      postAcc += postClear;
    }

    return {
      date: p.date,
      dayIdx: p.day,
      stored,
      etr,
      postClear,
      coverage: p.coverage,
      examined: p.examined,
    };
  });
}

/**
 * A day's mass, spread across its 24 hours.
 *
 * Hour grain is the honest form of zooming in: it does not scale the same points up, it shows
 * more of them. The shape is diurnal and seeded off the day, so the corpus is the same bytes on
 * every machine and an hourly view is worth photographing.
 *
 * **Recompute and stored take DIFFERENT shapes, and that is the whole point.** Splitting both by
 * one curve makes the fraction constant within a day, so an hourly view would show a flat step
 * per day and reveal nothing the daily view did not. Repeat compute concentrates harder into the
 * peak than total stores do, because cache pressure is what produces re-stores, so recompute
 * gets the more peaked curve. The intra-day variation in the ratio is what the reader came for.
 */
export function hoursOf(day: DayMass): DayMass[] {
  const seed = w.dayStartMs(day.date) / 3_600_000;
  const shape = (h: number): number => {
    // Two humps, because a serving fleet has a morning and an afternoon.
    const diurnal =
      1 + 0.45 * Math.sin(((h - 4) / 24) * Math.PI * 2) + 0.2 * Math.sin(((h - 2) / 12) * Math.PI * 2);
    const jitter = 0.94 + (((seed + h * 37) % 13) / 13) * 0.12;
    return Math.max(0.15, diurnal * jitter);
  };
  const storedWeights = Array.from({ length: 24 }, (_, h) => shape(h));
  // Peaked harder, and jittered on a different stride so the two curves are not one curve.
  const wasteWeights = Array.from({ length: 24 }, (_, h) => {
    const jitter = 0.92 + (((seed + h * 53) % 17) / 17) * 0.16;
    return Math.pow(shape(h), 1.7) * jitter;
  });
  const storedTotal = storedWeights.reduce((a, b) => a + b, 0);
  const wasteTotal = wasteWeights.reduce((a, b) => a + b, 0);

  let storedAcc = 0;
  let etrAcc = 0;
  let postAcc = 0;
  return storedWeights.map((_weight, h) => {
    const last = h === 23;
    const wasteShare = (wasteWeights[h] ?? 0) / wasteTotal;
    const stored = last
      ? day.stored - storedAcc
      : Math.round((day.stored * (storedWeights[h] ?? 0)) / storedTotal);
    const etr = last ? day.etr - etrAcc : Math.round(day.etr * wasteShare);
    const postClear = last ? day.postClear - postAcc : Math.round(day.postClear * wasteShare);
    storedAcc += stored;
    etrAcc += etr;
    postAcc += postClear;
    return {
      // The bucket key the API uses at hour grain.
      date: `${day.date}T${String(h).padStart(2, '0')}:00:00Z`,
      dayIdx: day.dayIdx,
      stored,
      etr,
      postClear,
      coverage: day.coverage,
      examined: day.examined,
    };
  });
}

/**
 * One hour's masses split into sixty minute masses, exact by construction: the last minute
 * takes the remainder, the way `hoursOf` closes its day. Light jitter on the same stride
 * discipline so a minute curve breathes without inventing a second diurnal shape.
 */
export function minutesOf(hour: DayMass): DayMass[] {
  const seed = Date.parse(hour.date) / 60_000;
  const weights = Array.from({ length: 60 }, (_, m) => 0.9 + (((seed + m * 29) % 11) / 11) * 0.2);
  const total = weights.reduce((a, b) => a + b, 0);
  let storedAcc = 0;
  let etrAcc = 0;
  let postAcc = 0;
  return weights.map((weight, m) => {
    const last = m === 59;
    const share = weight / total;
    const stored = last ? hour.stored - storedAcc : Math.round(hour.stored * share);
    const etr = last ? hour.etr - etrAcc : Math.round(hour.etr * share);
    const postClear = last ? hour.postClear - postAcc : Math.round(hour.postClear * share);
    storedAcc += stored;
    etrAcc += etr;
    postAcc += postClear;
    return {
      // The bucket key the API uses at minute grain: the hour's key with the minute set.
      date: `${hour.date.slice(0, 14)}${String(m).padStart(2, '0')}:00Z`,
      dayIdx: hour.dayIdx,
      stored,
      etr,
      postClear,
      coverage: hour.coverage,
      examined: hour.examined,
    };
  });
}

/**
 * The instants a sub-day window covers, for the minute path: `<N>h` ends at the corpus's
 * edge, an absolute pair is itself, and a day form covers its whole days. Minute buckets
 * are enumerated only inside it, the way the served window bounds the server's rows.
 */
export function minuteBounds(raw: string | undefined): { readonly startMs: number; readonly endMs: number } | null {
  if (!raw) return null;
  const hours = /^(\d+)h$/.exec(raw);
  if (hours?.[1]) {
    const endMs = Math.ceil(THRASH_EDGE_MS / 60_000) * 60_000;
    return { startMs: endMs - Number(hours[1]) * 3_600_000, endMs };
  }
  const abs = /^(\d+),(\d+)$/.exec(raw);
  if (abs?.[1] && abs[2]) return { startMs: Number(abs[1]), endMs: Number(abs[2]) };
  return null;
}

/** One day's buckets, one per class and per dim value asked for. */
export function bucketsFor(day: DayMass, dims: readonly string[]): Bucket[] {
  const byClass: (readonly [string, number])[] = [
    ['ETR', day.etr],
    ['post_clear', day.postClear],
    ...CLASS_SPLIT.map(
      ([name, share]) => [name, Math.round((day.stored - day.etr - day.postClear) * share)] as const,
    ),
  ];
  const events = (tokens: number) => Math.round(tokens / 73);

  if (!dims.includes('class')) {
    const total = byClass.reduce((a, [, v]) => a + v, 0);
    return [
      {
        bucket: day.date,
        dims: [],
        events: events(total),
        tokens: figure(total, day.coverage),
      },
    ];
  }

  return byClass.map(([cls, tokens]) => ({
    bucket: day.date,
    dims: [{ dim: 'class', value: cls }],
    events: events(tokens),
    tokens: figure(tokens, day.coverage),
  }));
}

/** Parse `<N>d`. Absolute `start_ms,end_ms` is accepted and clamped to the corpus. */
export function windowDays(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const rel = /^(\d+)d$/.exec(raw);
  if (rel?.[1]) return Math.min(Number(rel[1]), w.TREND_DAYS);
  // The one grammar's hour form (`48h`, `3h`): the day-enumerating builders round it up to
  // whole days, the way a day-grain read covers every day the span touches.
  const hours = /^(\d+)h$/.exec(raw);
  if (hours?.[1]) return Math.min(Math.max(1, Math.ceil(Number(hours[1]) / 24)), w.TREND_DAYS);
  return fallback;
}

/**
 * The window's span in days, fractional, for reads that scale by span rather than enumerate
 * buckets. Accepts both contract forms: `<N>d` relative and `start_ms,end_ms` absolute.
 */
export function windowSpanDays(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const rel = /^(\d+)d$/.exec(raw);
  if (rel?.[1]) return Math.min(Number(rel[1]), w.TREND_DAYS);
  const hours = /^(\d+)h$/.exec(raw);
  if (hours?.[1]) return Math.min(Number(hours[1]) / 24, w.TREND_DAYS);
  const abs = /^(\d+),(\d+)$/.exec(raw);
  if (abs?.[1] && abs[2]) {
    const span = (Number(abs[2]) - Number(abs[1])) / 86_400_000;
    return Math.min(Math.max(span, 0), w.TREND_DAYS);
  }
  return fallback;
}

const LIMIT_CAP = 200;

/**
 * What a cursor is bound to.
 *
 * A page is a claim about one pass, so the cursor carries the pass it was minted under. The
 * corpus advances its age when a scripted pass fires, which is what makes a stale cursor
 * reachable here rather than theoretical.
 */
function stampKey(age: w.AgeScript): string {
  return `${w.DISCRIMINATOR_CURRENT}|${w.SEMANTICS_CURRENT}|${age.key}`;
}

function encodeCursor(offset: number, age: w.AgeScript): string {
  return btoa(JSON.stringify({ o: offset, s: stampKey(age) }));
}

/**
 * A stale cursor is a RESULT, not an error.
 *
 * It returns 200 with the whole envelope intact: the stamp, the heading and the page block all
 * survive, and only the rows are replaced. The remedy has always been to restart at page one;
 * what this shape settles is the render, which keeps the frame rather than blanking the panel a
 * reader was in the middle of using.
 */
function decodeCursor(
  raw: string | undefined,
  age: w.AgeScript,
): { ok: true; offset: number } | { ok: false; refusal: Refusal } {
  if (raw === undefined || raw === '') return { ok: true, offset: 0 };

  const stale = (detail: string) => ({
    ok: false as const,
    refusal: {
      cause: 'cursor_stale' as const,
      message: detail,
      // The bound says what MOVED, which is what lets the console name the change rather than
      // just report a failure.
      bound: {
        current_tick_at_ms: age.passes === 0 ? null : age.atMs,
        current_classified_day: age.passes === 0 ? null : w.TODAY,
        current_discriminator: w.DISCRIMINATOR_CURRENT,
      },
    },
  });

  let parsed: { o?: unknown; s?: unknown };
  try {
    parsed = JSON.parse(atob(raw)) as { o?: unknown; s?: unknown };
  } catch {
    // A cursor this build cannot read is a cursor another build minted, which is a staleness
    // claim rather than a parse failure worth its own vocabulary.
    return stale('this cursor was not minted by the pass now in force');
  }
  if (parsed.s !== stampKey(age)) {
    return stale('this cursor was minted under a previous pass, and the rows have moved since');
  }
  return { ok: true, offset: typeof parsed.o === 'number' ? parsed.o : 0 };
}

/**
 * A page, or the refusal that replaced its rows.
 *
 * **The payload is null exactly when the refusal is present, and a refusal never coexists with
 * an empty array.** An empty array means "looked and found nothing"; null means "the read was
 * refused, see `refused`". Collapsing the two is how a console renders an outage as a quiet
 * zero, which is the failure this whole product is built against.
 */
type Paged<T> =
  | { readonly refused: false; readonly rows: T[]; readonly page: Page }
  | { readonly refused: true; readonly refusal: Refusal; readonly page: Page };

interface PageOptions {
  /**
   * Whether the surface can count its rows cheaply.
   *
   * False on the two event-grain drills, which page by keyset: the keyset read already answers
   * "is there more" from the same statement, and a count would be a second scan for a number
   * nobody reads.
   */
  readonly countable?: boolean;
  /** A ranking rather than a page. Issues no cursor by design, because "worst N" is the question. */
  readonly ranking?: boolean;
}

/** A page of `all` under the stamp's cursor rules: limit capped, cursor bound to the tick. */
export function paginate<T>(
  all: readonly T[],
  age: w.AgeScript,
  query: { limit?: number; cursor?: string },
  options: PageOptions = {},
): Paged<T> {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), LIMIT_CAP);
  const cursor = decodeCursor(query.cursor, age);

  if (!cursor.ok) {
    return {
      refused: true,
      refusal: cursor.refusal,
      // The page block describes the REQUEST, so the frame survives the refusal.
      page: { limit, returned: 0, total_rows: null, next_cursor: null },
    };
  }

  const rows = all.slice(cursor.offset, cursor.offset + limit);
  const exhausted = options.ranking === true || cursor.offset + limit >= all.length;
  return {
    refused: false,
    rows,
    page: {
      limit,
      returned: rows.length,
      // Null on the last page and only there.
      next_cursor: exhausted ? null : encodeCursor(cursor.offset + limit, age),
      total_rows: options.countable === false ? null : all.length,
    },
  };
}

/**
 * The scope params, resolved to a fleet share.
 *
 * Holder wins over instance, being the narrower claim, and a malformed holder spelling is a
 * 404 with `unknown_holder`, as the wire parses it. A well-formed scope the corpus never saw
 * resolves to share zero, which downstream renders as looked-and-found-nothing: the dao
 * filters by verbatim equality, and an unmatched value matches no rows rather than refusing.
 * The absent workload bucket is selected by `undeclared` — the emitted vocabulary — whatever
 * the parameter description currently claims (reported, not modeled).
 */
interface ScopeSlice {
  readonly kind: 'fleet' | 'workload' | 'instance' | 'holder';
  readonly value: string | null;
  /** The slice's share of the fleet's RECOMPUTE mass, from the holders corpus. */
  readonly share: number;
  /** The slice's share of the fleet's STORED mass. A different shape on purpose: recompute
   * concentrates where placement went wrong, cache work spreads with traffic, and per-node
   * recompute rates exist exactly because these two are not proportional. */
  readonly storedShare: number;
}

/** One instance's share of stored mass, zero where the corpus never saw the slot. */
export function storedShareOf(instance: string): number {
  return w.STORED_SHARES.get(instance) ?? 0;
}

/** The slice a scoped read answers about: holder beats instance, a malformed holder is a 404. */
export function resolveScope(query: {
  workload?: string;
  instance?: string;
  holder?: string;
}): ScopeSlice {
  if (query.holder !== undefined) {
    const parts = query.holder.split('/');
    if (parts.length !== 3 || parts.some((x) => x === '') || !/^\d+$/.test(parts[1] ?? '') || !/^\d+$/.test(parts[2] ?? '')) {
      throw new ApiError(
        404,
        errorBody('unknown_holder', `${JSON.stringify(query.holder)} is not \`instance/dp_rank/group_idx\``),
        'unknown holder',
      );
    }
    const member = holderMember(query.holder);
    const instance = parts[0] ?? '';
    const ranks = w.HOLDERS.filter((h) => h.instance === instance).length;
    return {
      kind: 'holder',
      value: query.holder,
      share: member?.share ?? 0,
      storedShare: member === null || ranks === 0 ? 0 : storedShareOf(instance) / ranks,
    };
  }
  if (query.instance !== undefined) {
    const holders = w.HOLDERS.filter((h) => h.instance === query.instance);
    return {
      kind: 'instance',
      value: query.instance,
      share: holders.reduce((a, h) => a + h.tokens, 0) / w.WASTE_FULL,
      storedShare: storedShareOf(query.instance),
    };
  }
  if (query.workload !== undefined) {
    // From the holders corpus, not the cut scaffolding: the fill authored the two into
    // agreement, and the corpus is the authority.
    const holders = w.HOLDERS.filter((h) => h.workload === query.workload);
    const instances = new Set(holders.map((h) => h.instance));
    return {
      kind: 'workload',
      value: query.workload,
      share: holders.reduce((a, h) => a + h.tokens, 0) / w.WASTE_FULL,
      storedShare: [...instances].reduce((a, i) => a + storedShareOf(i), 0),
    };
  }
  return { kind: 'fleet', value: null, share: 1, storedShare: 1 };
}

/**
 * One day's masses, sliced two ways: the recompute classes scale by the slice's recompute
 * share, the remainder of stored mass by its stored share. The quotient is the slice's own
 * recompute rate, which is the figure the entity pages exist to serve.
 */
export function sliceDay(d: DayMass, recomputeShare: number, storedShare: number): DayMass {
  const etr = Math.round(d.etr * recomputeShare);
  const postClear = Math.round(d.postClear * recomputeShare);
  const rest = Math.round((d.stored - d.etr - d.postClear) * storedShare);
  return { ...d, etr, postClear, stored: etr + postClear + rest };
}

/**
 * The raw horizon, as the reach a drill either falls inside or does not.
 *
 * Measured back from the FRONTIER rather than from a fixed date: raw retention is a rolling
 * window, so a day that is drillable today falls out of reach once the frontier has moved past
 * it by the declared horizon. Anchoring this to a constant would make the horizon a decoration.
 */
export function reachFor(age: w.AgeScript, day: string): { reach: ReachJson; withinRaw: boolean } {
  const from = w.frontierIndex(age) - w.RAW_HORIZON_DAYS + 1;
  const withinRaw = w.dayIndex(day) >= from;
  return {
    withinRaw,
    reach: {
      covers: withinRaw,
      declared_days: w.RAW_HORIZON_DAYS,
      raw_from_day: w.dayDate(from),
      raw_from_ms: w.dayStartMs(w.dayDate(from)),
      // Which of the two readings this is: older than the oldest record, or no records at all.
      reason: withinRaw ? null : 'older than the oldest record this fleet holds',
    },
  };
}

/** Where a drill's rows come from: a holder's ring, or a block re-derived from the log. */
export function readFromFor(subject: 'holder' | 'block'): string {
  return subject === 'holder' ? 'ring' : 'log';
}

/** `/v1/stamp`'s data body: whether a tick has run. */
export function stampDataFor(age: w.AgeScript): { ready: boolean } {
  return { ready: age.passes > 0 };
}
