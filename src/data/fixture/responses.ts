// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ApiErrorBody,
  BlockHoldersData,
  BlocksData,
  TagsData,
  Bucket,
  Cause,
  AnalyzeData,
  CoverageData,
  DeliveryData,
  DayData,
  EvidenceData,
  Figure,
  FiguresData,
  HealthData,
  HolderId,
  HolderRow,
  HoldersData,
  MarkerData,
  MarkerJson,
  MarkersData,
  Page,
  ReachJson,
  Refusal,
  RosterData,
  RunRow,
  Segment,
  Stamp,
  TimelineData,
  AnnotationBody,
  AnnotationData,
  BandsData,
  InstanceDuplicationData,
  ReplicationData,
  WhalesData,
  WindowJson,
} from '../../domain/contract';
import type {
  AttributionCard,
  AttributionQuery,
  ConcentrationData,
  ConcentrationQuery,
  CutKey,
  CutMember,
} from '../../domain/lens';
import { GAP_BANDS } from '../../domain/lens';
import { ApiError } from '../../domain/refusal';
import type { WindowDesc } from '../../domain/windows';
import { attributionFor } from './ledger';
import {
  CACHED_TH_DAY,
  DUP_TH_DAY,
  WHALES,
  WHALE_CUT,
  WHALE_IDENTITY_DAYS,
  instanceDuplicationResponse,
  replicationResponse,
} from './replication';
import {
  CUTS,
  GAP_UNOBSERVED_SHARE,
  INSTANCE_CUT_POPULATION,
  THRASH_EDGE_MS,
  TOKENS_PER_EVENT,
  holderMember,
  incidentOverlap,
  incidentStrength,
  nodeMembers,
  postClearShare,
  rankMembers,
  thrashSeriesFor,
} from './thrash';
import * as w from './world';

/**
 * The world, rendered as the bytes the API would send.
 *
 * **Contract-shaped, not mock-shaped.** Every response here is validated against
 * `contract/openapi.json`'s schemas by `test/fixture-parity.test.ts`, which is the compensating
 * mechanism `read-api.md` §2.2.1 named: assert the spec's schemas validate the fixture bytes. It
 * was vacuous before per-path schemas existed. It is not vacuous now.
 *
 * Where the contract and the mock disagree the contract wins, and the disagreement is recorded
 * rather than smoothed over. The clearest case is the 90-day trend: the mock draws one series
 * across a `semantics_version` seam with a labelled break, and the API cannot do that. A segment
 * under superseded semantics serializes `figures: null` with its refusal, so a third of the
 * trend is unstatable rather than merely annotated. Rendering it any other way would be the
 * console inventing a number the meter refuses to state.
 */

// ── Primitives ───────────────────────────────────────────────────────────────────────────────

const TOKEN_WEIGHTED = 'token-weighted';
const INSTANCE_TIME = 'instance-time';
const LOWER_BOUND = '>=';

export function figure(value: number, coverage: number, kind = TOKEN_WEIGHTED): Figure {
  return { value, register: LOWER_BOUND, coverage, coverage_kind: kind };
}

function windowJson(startDay: string, endDay: string): WindowJson {
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
function errorBody(
  cause: Cause,
  message: string,
  bound?: Record<string, unknown>,
): ApiErrorBody {
  return { cause, message, ...(bound === undefined ? {} : { bound }) };
}

/**
 * Pass-clock endpoints before the first pass.
 *
 * Never a zero. `read-api.md` §7.2: the pass having never run is a 503 with `no_pass_yet`, and
 * the console renders that as the t0 page state rather than as a failure the operator caused.
 */
function requirePass(age: w.AgeScript): void {
  // The server answers 200 with a stamp whose `pass.frontier_day` is null; the live data
  // layer turns that into `ApiError.notYetPassed()` on every pass-derived read, and this is
  // the corpus doing the same at the same seam. The builders that call this ARE the list of
  // pass-derived reads, mirrored in `data/live/source.ts`.
  if (age.passes === 0) throw ApiError.notYetPassed();
}

// ── The trend, and the arithmetic that keeps two pages from disagreeing ──────────────────────

const CLASS_SPLIT: readonly (readonly [string, number])[] = [
  ['cold', 0.94],
  ['RE', 0.03],
  ['re_admit', 0.02],
  ['indeterminate', 0.01],
];

interface DayMass {
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
function dayMasses(age: w.AgeScript): readonly DayMass[] {
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
function hoursOf(day: DayMass): DayMass[] {
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
function minutesOf(hour: DayMass): DayMass[] {
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
function minuteBounds(raw: string | undefined): { readonly startMs: number; readonly endMs: number } | null {
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

function bucketsFor(day: DayMass, dims: readonly string[]): Bucket[] {
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
function windowDays(raw: string | undefined, fallback: number): number {
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
function windowSpanDays(raw: string | undefined, fallback: number): number {
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

// ── Paging ───────────────────────────────────────────────────────────────────────────────────

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

function paginate<T>(
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

// ── Scope: which slice to answer about, beside dims, which says how to group ─────────────────

/**
 * The scope params, resolved to a fleet share (pin `eb511e6`).
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
function storedShareOf(instance: string): number {
  return w.STORED_SHARES.get(instance) ?? 0;
}

function resolveScope(query: {
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
function sliceDay(d: DayMass, recomputeShare: number, storedShare: number): DayMass {
  const etr = Math.round(d.etr * recomputeShare);
  const postClear = Math.round(d.postClear * recomputeShare);
  const rest = Math.round((d.stored - d.etr - d.postClear) * storedShare);
  return { ...d, etr, postClear, stored: etr + postClear + rest };
}

// ── /v1/figures ──────────────────────────────────────────────────────────────────────────────

export function figuresFor(
  age: w.AgeScript,
  query: {
    window?: string;
    grain?: 'minute' | 'hour' | 'day';
    dims?: readonly string[];
    workload?: string;
    instance?: string;
    holder?: string;
  } = {},
): FiguresData {
  requirePass(age);
  const scope = resolveScope(query);
  const days = windowDays(query.window, w.WINDOW_14D.days);
  const from = w.frontierIndex(age) - days + 1;
  // A scoped read answers about one slice: recompute mass by the slice's recompute share,
  // the rest of stored mass by its stored share, so the slice carries its own rate.
  const rawMasses = dayMasses(age).filter((d) => d.dayIdx >= from && d.examined);
  const masses = rawMasses.map((d) =>
    scope.kind === 'fleet' ? d : sliceDay(d, scope.share, scope.storedShare),
  );
  const rawByIdx = new Map(rawMasses.map((d) => [d.dayIdx, d]));
  const dims = query.dims ?? [];
  const hourly = query.grain === 'hour';
  // The minute tier: the hour path one step finer, bounded to the window's own instants
  // rather than to whole days, so a `3h` ask answers 180 buckets and not a day of them.
  const minute = query.grain === 'minute';
  const bounds = minute ? minuteBounds(query.window) : null;
  const bucketsOf = (d: DayMass): DayMass[] => {
    if (minute) {
      return hoursOf(d)
        .flatMap(minutesOf)
        .filter((m) => {
          if (bounds === null) return true;
          const at = Date.parse(m.date);
          return at >= bounds.startMs && at < bounds.endMs;
        });
    }
    return hourly ? hoursOf(d) : [d];
  };
  // The entity dims: one bucket set per member, each sliced from the FLEET day with the
  // member's own two shares. A workload scope's nodes partition its slice by construction,
  // since a node carries one workload; scoped to one entity the dim enumerates just it. The
  // workload dim slices the same way one facet over.
  const sliceDim = dims.includes('instance')
    ? ('instance' as const)
    : dims.includes('workload')
      ? ('workload' as const)
      : null;
  const sliceKeys =
    sliceDim === null
      ? null
      : sliceDim === 'instance'
        ? scope.kind === 'instance'
          ? [scope.value ?? '']
          : scope.kind === 'workload'
            ? [...new Set(w.HOLDERS.filter((h) => h.workload === scope.value).map((h) => h.instance))]
            : [...new Set(w.HOLDERS.map((h) => h.instance))].sort()
        : scope.kind === 'workload'
          ? [scope.value ?? '']
          : [...new Set(w.HOLDERS.map((h) => h.workload))].sort();
  const sliceShares = (key: string): readonly [number, number] => {
    if (sliceDim === 'workload') {
      const holders = w.HOLDERS.filter((h) => h.workload === key);
      const instances = new Set(holders.map((h) => h.instance));
      return [
        holders.reduce((a, h) => a + h.tokens, 0) / w.WASTE_FULL,
        [...instances].reduce((a, i) => a + storedShareOf(i), 0),
      ];
    }
    return [
      w.HOLDERS.filter((h) => h.instance === key).reduce((a, h) => a + h.tokens, 0) /
        w.WASTE_FULL,
      storedShareOf(key),
    ];
  };
  // The scripted incident reaches the figures too: the same window, the same surge shape the
  // bands carry, so the rate chart spikes where the composition darkens. Recompute grows and
  // stored grows by exactly that delta, because recompute IS part of stored.
  const scopeStrength =
    scope.kind === 'instance' || scope.kind === 'holder'
      ? incidentStrength(scope.value ?? '')
      : 0;
  const surge = (b: DayMass, strength: number): DayMass => {
    if (strength === 0) return b;
    const bucketMs = minute ? 60_000 : hourly ? 3_600_000 : 86_400_000;
    const startMs = Date.parse(b.date.length > 10 ? b.date : `${b.date}T00:00:00Z`);
    const k = 1 + 2.4 * incidentOverlap(startMs, bucketMs) * strength;
    if (k === 1) return b;
    const etr = Math.round(b.etr * k);
    const postClear = Math.round(b.postClear * k);
    return { ...b, etr, postClear, stored: b.stored + (etr - b.etr) + (postClear - b.postClear) };
  };

  // One segment per meaning generation in the window. Never a blended series, and deliberately
  // no total spanning them: never-sum expressed as an absence.
  const segments: Segment[] = [];
  let run: DayMass[] = [];
  let key = '';

  const flush = () => {
    if (run.length === 0) return;
    const first = run[0] as DayMass;
    const last = run[run.length - 1] as DayMass;
    const meaning = w.meaningAt(first.dayIdx);
    const superseded = meaning.semantics_version !== w.SEMANTICS_CURRENT;
    segments.push({
      discriminator: meaning.discriminator,
      semantics_version: meaning.semantics_version,
      window: windowJson(first.date, last.date),
      // `None`, never an empty array, which would read as "looked and found nothing".
      figures: superseded
        ? null
        : run.flatMap((d) => {
            if (sliceKeys === null || sliceDim === null) {
              return bucketsOf(d)
                .map((b) => surge(b, scopeStrength))
                .flatMap((b) => bucketsFor(b, dims));
            }
            const raw = rawByIdx.get(d.dayIdx) ?? d;
            return sliceKeys.flatMap((key) => {
              const [rec, sto] = sliceShares(key);
              const sliced = sliceDay(raw, rec, sto);
              return bucketsOf(sliced)
                .map((b) =>
                  surge(b, sliceDim === 'instance' ? incidentStrength(key) : 0),
                )
                .flatMap((b) => bucketsFor(b, dims))
                .map((bucket) => ({
                  ...bucket,
                  dims: [...bucket.dims, { dim: sliceDim, value: key }],
                }));
            });
          }),
      ...(superseded
        ? {
            refused: {
              cause: 'superseded_semantics',
              message: `figures under ${meaning.semantics_version} are not re-derivable by this process, which runs ${w.SEMANTICS_CURRENT}`,
            },
          }
        : {}),
    });
    run = [];
  };

  for (const d of masses) {
    const m = w.meaningAt(d.dayIdx);
    const k = `${m.semantics_version}|${m.discriminator}`;
    if (k !== key) {
      flush();
      key = k;
    }
    run.push(d);
  }
  flush();

  return {
    register: 'recompute',
    never_summed_with: 'capacity',
    // The grain the response was SERVED at (server-chosen granularity, 2026-08-29): the tier
    // the ask named, since an explicit tier is honored verbatim or refused, never downgraded.
    grain: minute ? 'minute' : hourly ? 'hour' : 'day',
    segments,
  };
}

// ── /v1/holders ──────────────────────────────────────────────────────────────────────────────

export function holdersFor(
  age: w.AgeScript,
  query: {
    limit?: number;
    cursor?: string;
    class?: string;
    workload?: string;
    window?: string;
  } = {},
): HoldersData {
  requirePass(age);
  // Window continuity: the page reads the same window the dashboard emits, and the masses scale
  // with the span the way the daily rollup would sum. Fractional-day windows scale linearly,
  // which is scaffolding; the live read answers at its own grain or refuses.
  const scale = windowSpanDays(query.window, w.WINDOW_14D.days) / w.WINDOW_14D.days;
  const pool = w.HOLDERS.filter((h) => (query.workload ? h.workload === query.workload : true));
  const paged = paginate(pool, age, query);
  if (paged.refused) {
    // The heading and the page block survive; only the rows are replaced. `fleet_total` goes
    // with them, because a denominator from a pass we can no longer page is not a denominator
    // for rows we did not read.
    return { register: 'recompute', page: paged.page, refused: paged.refusal };
  }
  const rows: HolderRow[] = paged.rows.map((h) => ({
    holder: { instance: h.instance, dp_rank: h.dp_rank, group_idx: h.group_idx },
    tokens: figure(Math.round(h.tokens * scale), h.coverage),
    events: Math.round(h.events * scale),
    // The share's denominator comes from the same read as the rows, so a concurrent pass cannot
    // put a numerator and a denominator from two different passes in one row.
    share_of_fleet_total: figure(h.tokens / w.WASTE_FULL, h.coverage),
    model: h.model,
    workload: h.workload,
    // The server's read-time judgment: paint from `state` alone, reason present exactly
    // when inactive.
    state: h.status,
    ...(h.statusReason === null ? {} : { reason: h.statusReason }),
  }));
  return {
    register: 'recompute',
    fleet_total: figure(Math.round(w.WASTE_FULL * scale), w.COVERAGE_FULL),
    page: paged.page,
    rows,
  };
}

// ── /v1/roster ───────────────────────────────────────────────────────────────────────────────

/**
 * Run states and their counts, shared by the roster and by health.
 *
 * Two surfaces state the same population, so they read it from one place. Staleness is judged
 * per run, which is why these total to the RUN count and never to the holder count.
 */
/**
 * The roster's inactive slots, by name, sized to the scripted run counts (5 silent, 6
 * stopped, 1 ungraded) and overlapping the holders corpus's own story where the two can
 * agree: i-001..i-003 carry the silent holders, i-041 the clean stop, i-023 an undeclared
 * rank. The remainder are fillers, deterministic. The two families were scripted separately
 * and their counts do not reconcile exactly (six ungraded HOLDERS, one ungraded run); the
 * roster is the run authority and the looseness is recorded here rather than smoothed.
 */
const SILENT_INSTANCES = ['i-001', 'i-002', 'i-003', 'i-058', 'i-096'];
const STOPPED_INSTANCES = ['i-041', 'i-014', 'i-047', 'i-072', 'i-089', 'i-104'];
const UNGRADED_INSTANCES = ['i-023'];

function runPopulation(age: w.AgeScript): { counts: Record<string, number>; rows: RunRow[] } {
  const scale = age.key === 't3' ? 1 : age.key === 't2' ? 0.92 : age.key === 't1' ? 0.6 : 0;
  const counts: Record<string, number> = {};
  for (const g of w.RUNS) counts[g.state] = Math.round(g.count * scale);
  // The platform threshold: heartbeats arrive at least every five minutes, and the declared
  // bound widens that to a thirty-minute minimum before silence is called.
  const THRESHOLD_MS = 1_800_000;
  // One observed run per slot: every heartbeating tap has a run, so a live roster covers the
  // fleet and an instance page's identity block is never blank on a slot that reported.
  // `state_counts` still totals the RUN count (incarnations over the window, restarts
  // included); the rows are the slots' current runs.
  const instances = [...new Set(w.HOLDERS.map((h) => h.instance))].sort();
  const listed = instances.slice(0, Math.round(instances.length * scale));
  const all: RunRow[] = listed.map((instance, i) => {
    const silentAt = SILENT_INSTANCES.indexOf(instance);
    const reason: 'silent' | 'stopped' | 'ungraded' | null =
      silentAt >= 0
        ? 'silent'
        : STOPPED_INSTANCES.includes(instance)
          ? 'stopped'
          : UNGRADED_INSTANCES.includes(instance)
            ? 'ungraded'
            : null;
    // Silent runs went quiet at staggered depths, so the investigation table has a worst.
    const silentFor = THRESHOLD_MS + (silentAt + 1) * 2_400_000;
    return {
      incarnation: `${1_785_000_000_000 + i * 1000}-${4000 + i}`,
      instance,
      // The slot's current occupant: `instance` is a name the operator typed, the pod is who
      // fills it now. Null where the deployment relayed no pod identity, which reads as
      // unobserved rather than as a claim.
      pod: reason === 'ungraded' ? null : `vllm-${instance.slice(2)}-${(7 + i * 13) % 97}f${i % 10}`,
      state: reason === null ? 'active' : 'inactive',
      ...(reason === null ? {} : { reason }),
      ...(reason === 'silent' ? { silent_for_ms: silentFor } : {}),
      threshold_ms: reason === 'ungraded' ? null : THRESHOLD_MS,
      first_seen_ms: age.atMs - 86_400_000,
      last_seen_ms:
        age.atMs -
        (reason === null ? 20_000 + (i % 13) * 9_000 : reason === 'silent' ? silentFor : 900_000),
      stop_observed: reason === 'stopped',
      model: reason === 'ungraded' ? null : 'meta-llama/Llama-3.1-70B-Instruct',
      engine_version: 'vllm 0.9.1',
    };
  });
  return { counts, rows: all };
}

export function rosterFor(
  age: w.AgeScript,
  query: { limit?: number; cursor?: string } = {},
): RosterData {
  const { counts, rows: all } = runPopulation(age);
  const paged = paginate(all, age, query);
  if (paged.refused) {
    // `state_counts` and `producer_runs` go too: they are summaries OF the rows, and a summary
    // that outlives the read it summarises is the altitude lie the summary law forbids.
    return {
      page: paged.page,
      refused: paged.refusal,
      scope: {
        kind: 'lifecycle',
        margin_ms: 300_000,
        note: 'a run is an incarnation, so a rolling deploy reads as a departure and an arrival',
      },
      cannot_tell_you:
        'the roster is observed. A holder that never reported leaves no trace here, so this is not an inventory of what exists',
    };
  }
  return {
    producer_runs: Object.values(counts).reduce((a, b) => a + b, 0),
    // Totals to the RUN count, never the holder count.
    state_counts: counts,
    rows: paged.rows,
    page: paged.page,
    scope: {
      kind: 'lifecycle',
      margin_ms: 300_000,
      note: 'a run is an incarnation, so a rolling deploy reads as a departure and an arrival',
    },
    cannot_tell_you:
      'the roster is observed. A holder that never reported leaves no trace here, so this is not an inventory of what exists',
  };
}

// ── /v1/coverage ─────────────────────────────────────────────────────────────────────────────

export function coverageFor(
  age: w.AgeScript,
  query: { window?: string; by?: 'fleet' | 'instance' } = {},
): CoverageData {
  requirePass(age);
  const days = windowDays(query.window, w.WINDOW_14D.days);
  const windowMs = days * 86_400_000;
  if (query.by === 'instance') {
    return {
      // Both bases per row since pin `2d0db9e`, with the sums that make the token-weighted one
      // mergeable: merge days by Σwsum / Σtokens, never by averaging fractions. The corpus
      // scripts one engine with no classified mass, so the absent-fields state is reachable:
      // absence is "no mass to weight", never a zero.
      rows: w.COVERAGE_BY_SOURCE.map((s, i) => {
        const tokenMass = i === w.COVERAGE_BY_SOURCE.length - 1 ? null : 900_000 + i * 35_000;
        return {
          day: w.TODAY,
          instance: s.source,
          instances: 1,
          fraction: s.windowTime,
          covered_ms: Math.round(windowMs * s.windowTime),
          window_ms: windowMs,
          coverage_kind: INSTANCE_TIME,
          ...(tokenMass === null
            ? { token_weighted_fraction: null, token_wsum: null, token_mass: null }
            : {
                token_weighted_fraction: s.tokenWeighted,
                token_wsum: s.tokenWeighted * tokenMass,
                token_mass: tokenMass,
              }),
        };
      }),
    };
  }
  const masses = dayMasses(age).slice(w.TREND_DAYS - days);
  return {
    rows: masses.map((d) => ({
      day: d.date,
      instance: null,
      instances: w.POPULATIONS.instances,
      fraction: d.coverage,
      covered_ms: Math.round(86_400_000 * d.coverage),
      window_ms: 86_400_000,
      coverage_kind: INSTANCE_TIME,
    })),
  };
}

// ── /v1/delivery ─────────────────────────────────────────────────────────────────────────────

/**
 * The delivery ledger. **Ingest-fresh: it answers at every age**, including before the first
 * pass — a t0 install states an empty ledger with its fraction ABSENT, never 100%.
 *
 * The rows sum exactly to the fleet totals, because the wire computes totals from the rows and
 * a fixture whose totals float free would model a response the server cannot produce. Captured
 * anchors to the age's segment odometer so the strip and this ledger cannot disagree.
 */
export function deliveryFor(age: w.AgeScript): DeliveryData {
  const cannot =
    "segments past each tap's last word (arrived or declared) have left no trace yet; this ledger claims nothing about them";
  const zero = {
    segments_expected: 0,
    segments_captured: 0,
    segments_declared_dropped: 0,
    segments_missing_unexplained: 0,
    records_seen: 0,
    records_dropped_at_source: 0,
    records_oversized: 0,
  };
  if (age.segments === 0) {
    return {
      fleet: { ...zero, fraction: null, as_of_ms: null },
      rows: [],
      orphan_batches: 0,
      cannot_tell_you: cannot,
    };
  }

  // Ten narrated runs. Two carry the degraded states a reader must recognise: one tap that
  // confessed a drop range, one with a gap nobody declared. Steady state only — a young
  // ledger is clean because nothing has had time to go missing.
  const runs = 10;
  const degraded = age.key === 't3';
  const declared = degraded ? 9 : 0;
  const missing = degraded ? 5 : 0;
  const base = Math.floor(age.segments / runs);
  const rows = Array.from({ length: runs }, (_, i) => {
    const captured = base + (i === 0 ? age.segments - base * runs : 0);
    const decl = i === 3 ? declared : 0;
    const miss = i === 7 ? missing : 0;
    const seen = Math.floor(age.events / runs);
    return {
      incarnation: `${1_785_000_000_000 + i * 1000}-${4000 + i}`,
      instances: [`i-${String(((i * 7) % w.POPULATIONS.instances) + 1).padStart(3, '0')}`],
      first_seen_ms: age.atMs - 86_400_000,
      last_seen_ms: age.atMs - 20_000,
      segments_expected: captured + decl + miss,
      segments_captured: captured,
      segments_declared_dropped: decl,
      segments_missing_unexplained: miss,
      records_seen: seen,
      records_dropped_at_source: degraded && i === 3 ? 214 : 0,
      records_oversized: 0,
    };
  });
  const fleet = rows.reduce(
    (a, r) => ({
      segments_expected: a.segments_expected + r.segments_expected,
      segments_captured: a.segments_captured + r.segments_captured,
      segments_declared_dropped: a.segments_declared_dropped + r.segments_declared_dropped,
      segments_missing_unexplained:
        a.segments_missing_unexplained + r.segments_missing_unexplained,
      records_seen: a.records_seen + r.records_seen,
      records_dropped_at_source: a.records_dropped_at_source + r.records_dropped_at_source,
      records_oversized: a.records_oversized + r.records_oversized,
    }),
    zero,
  );
  return {
    fleet: {
      ...fleet,
      fraction: fleet.segments_captured / fleet.segments_expected,
      as_of_ms: age.atMs - 20_000,
    },
    rows,
    orphan_batches: 0,
    cannot_tell_you: cannot,
  };
}

// ── /v1/analyze ──────────────────────────────────────────────────────────────────────────────

/** The kick, accepted: the fixture models the deployment form, where a loop is attached. */
export function analyzeNowFor(): AnalyzeData {
  return {
    accepted: true,
    note: 'the loop will start an incremental analysis within a second; figures advance when it completes, through the same offer every completed pass makes',
  };
}

// ── /v1/markers ──────────────────────────────────────────────────────────────────────────────

function markerJson(seam: w.Seam): MarkerJson {
  return {
    id: seam.id,
    at_ms: w.dayStartMs(seam.at),
    breaks: seam.breaks,
    kind: seam.kind,
    label: seam.label,
    origin: false,
    provenance: seam.provenance,
    source: seam.provenance === 'observed' ? 'record stream' : 'annotations',
    from_value: seam.from,
    to_value: seam.to,
  };
}

export function markersFor(age: w.AgeScript, query: { window?: string } = {}): MarkersData {
  const days = windowDays(query.window, w.TREND_DAYS);
  const from = w.frontierIndex(age) - days + 1;
  // Declared deployments ride the same read as the seams: one marker vocabulary, two
  // provenances. A deploy carries its minute-precision instant and never breaks the series.
  const deploys: MarkerJson[] = w.DEPLOYS.filter(
    (d) => w.dayIndex(new Date(d.atMs).toISOString().slice(0, 10)) >= from,
  ).map((d) => ({
    id: d.id,
    at_ms: d.atMs,
    breaks: false,
    kind: 'deploy',
    label: d.label,
    origin: false,
    provenance: 'recorded',
    source: 'annotations',
    from_value: d.from,
    to_value: d.to,
  }));
  return { markers: [...w.SEAMS.filter((s) => s.day >= from).map(markerJson), ...deploys] };
}

// ── Pre-contract lens reads ──────────────────────────────────────────────────────────────────

/** The scoped attribution card, age-gated exactly as the contract reads are. */
export function attributionResponseFor(
  age: w.AgeScript,
  query: AttributionQuery,
): AttributionCard {
  requirePass(age);
  return attributionFor(query);
}

// ── Identity concentration (pre-contract lens read) ──────────────────────────────────────────

/**
 * Was it one block coming back over and over, or many different ones: the question the
 * clicked bucket asks, answered as the server would answer it — over the WHOLE slice and
 * window, never a page of it. The corpus scripts the story: the incident rank's thrash hours
 * are one hot identity churning (the same shared prefix paid for again and again), and quiet
 * spans are breadth, a shallow power law over many identities. Deterministic per slice.
 */
export function identityConcentrationFor(
  age: w.AgeScript,
  query: ConcentrationQuery,
): ConcentrationData {
  requirePass(age);
  const subject = query.holder ?? query.instance ?? '';
  const abs = /^(\d+),(\d+)$/.exec(query.window);
  const a = abs?.[1] ? Number(abs[1]) : w.dayStartMs(w.WINDOW_14D.start);
  const b = abs?.[2] ? Math.max(Number(abs[2]), a + 60_000) : a + 86_400_000;
  const limit = Math.min(Math.max(query.limit ?? 10, 1), 50);

  let seed = 41;
  for (const c of `${subject}|${a}`) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const r = rngFor(seed);

  // The slice's recompute over the window, from the same shares every scoped read speaks.
  const scope = resolveScope(query.holder !== undefined ? { holder: query.holder } : { instance: subject });
  const spanDays = (b - a) / 86_400_000;
  const overlap = incidentOverlap(a, b - a);
  const strength = incidentStrength(query.holder ?? subject);
  const surge = 1 + 2.4 * overlap * strength;
  const scopeTotal = Math.round((w.WASTE_FULL / 14) * spanDays * scope.share * surge);

  // Churn concentrates, breadth spreads: the top identity's share follows the incident.
  const hot = overlap * strength;
  const topShare = Math.min(0.85, 0.08 + 0.55 * hot + r() * 0.05);
  const distinct = Math.max(3, Math.round((30 + r() * 40) * spanDays * 24 * (1 - 0.7 * hot)));
  const rows = [];
  let acc = 0;
  for (let i = 0; i < Math.min(limit, distinct); i++) {
    const share = i === 0 ? topShare : (1 - topShare) * Math.pow(i + 1, -1.4) * (0.8 + r() * 0.4) * 0.55;
    const tokens = Math.round(scopeTotal * share);
    if (tokens < 1) break;
    acc += tokens;
    rows.push({
      block_id: `b${(0x4a1 + ((seed + i * 37) % 0x300)).toString(16)}`,
      tokens: { value: tokens, coverage: 0.97 },
      events: Math.max(1, Math.round(tokens / (45 + (i % 30)))),
      holders_stored: i === 0 && hot > 0.3 ? 7 : 1 + ((seed + i) % 5),
    });
  }
  return {
    register: 'recompute',
    start_ms: a,
    end_ms: b,
    distinct_blocks: distinct,
    total_events: Math.max(rows.reduce((x, row) => x + row.events, 0), Math.round(scopeTotal / 60)),
    scope_total: Math.max(scopeTotal, acc),
    rows,
  };
}

const rngFor = (seed: number): (() => number) => {
  let st = seed >>> 0;
  return () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
};

// ── /v1/residual/replication ─────────────────────────────────────────────────────────────────

export function replicationFor(
  age: w.AgeScript,
  query: { window?: string; grain?: string; workload?: string } = {},
): ReplicationData {
  requirePass(age);
  return replicationResponse(query);
}

// ── /v1/instances/{instance}/duplication ─────────────────────────────────────────────────────

/** One node's internal duplication, age-gated exactly as the contract reads are. */
export function instanceDuplicationFor(
  age: w.AgeScript,
  instance: string,
  query: { window?: string; grain?: string } = {},
): InstanceDuplicationData {
  requirePass(age);
  return instanceDuplicationResponse(instance, query);
}

// ── /v1/figures/bands ────────────────────────────────────────────────────────────────────────

/** The wire's dim for each of the lens's cuts. */
const BAND_DIM_CUTS: Readonly<Record<string, CutKey>> = {
  workload: 'workload',
  holder: 'instance',
  model: 'model',
};

/**
 * The thrash lens's bytes: the five observed bands in rows with the cut riding `dims`, and the
 * gap-unobserved mass as its own figure beside them, never a sixth band.
 *
 * Minute grain serves since the banded-minute ruling (analyzer `27c491f`), and the panel
 * stops `14d`/`48h`/`3h` resolve against the emission frontier through the same authority as
 * the copies read (pin `eb511e6`). The corpus models the standing bounds: the holder cut at
 * minute grain refuses by name (the minute cells are kept per rank with cache groups rolled
 * up, so a holder cut has no minute table, while an instance or holder scope and the instance
 * cut serve from those rank cells, landing 7), and a window outside the minute tier's 48-hour
 * reach refuses with its bound rather than downgrading. Everything else matches the wire:
 * buckets, band strings, dims vocabulary.
 */
export function bandsFor(
  age: w.AgeScript,
  query: {
    window?: string;
    grain?: string;
    dims?: string;
    limit?: number;
    workload?: string;
    instance?: string;
    holder?: string;
  } = {},
  scenario: 'win' | 'reg' = 'win',
): BandsData {
  requirePass(age);
  // The holder cut's top-N bound, refused outside its range as the handler refuses it: the
  // handler's cap is 100 (WHALES_MAX), whatever the declared maximum currently claims.
  const limit = query.limit ?? 8;
  if (limit < 1 || limit > 100) {
    throw new ApiError(
      400,
      errorBody('limit_invalid', `limit ${limit} is outside 1..=100`),
      `limit ${limit} is outside 1..=100`,
    );
  }
  const scope = resolveScope(query);
  const dim = (query.dims ?? '').split(',')[0] || null;
  const desc = bandsDesc(query.window ?? '14d', query.grain ?? 'auto');
  const grainWord =
    desc.bucketMs >= 86_400_000 ? 'day' : desc.bucketMs >= 3_600_000 ? 'hour' : 'minute';
  // The standing rule, modeled (landing 7): the minute cells are kept per rank with cache
  // groups and tiers rolled up. An instance or holder scope and the instance cut serve from
  // them; a holder cut has no minute table and refuses by name, in the route's own words.
  if (grainWord === 'minute' && dim === 'holder') {
    throw new ApiError(
      400,
      errorBody(
        'grain_unavailable',
        'the minute grain keeps its banded cells per rank with cache groups and tiers rolled up; a holder or tier cut has no minute table — scope to the instance or the holder, or ask at `hour`',
      ),
      'a holder cut has no minute table',
    );
  }
  // The minute tier's measured reach: a window past it refuses with the bound stated, and
  // never downgrades.
  if (grainWord === 'minute' && desc.spanMs > 48 * 3_600_000) {
    throw new ApiError(
      400,
      errorBody(
        'grain_unavailable',
        'the minute tier reaches 48 hours; ask a narrower window or the hour tier',
        { reach_ms: 48 * 3_600_000 },
      ),
      'the minute tier reaches 48 hours',
    );
  }

  // Which members answer: scope says which slice, dims says how to group inside it. The
  // holder dim keeps its stated top-N bound; partitions are whole by construction; a scope
  // the corpus never matched yields no members, which downstream is looked-and-found-nothing.
  let members: readonly CutMember[];
  let holderPool: number = INSTANCE_CUT_POPULATION;
  // A scoped whole is the SUM of its parts, exactly: the corpus jitters each member's series
  // independently, so a scoped read synthesized as its own member would disagree with the
  // same page's member cut, which is the one disagreement a page must never have with
  // itself. `sumOf` names the parts; the rows are their per-bucket, per-band sums.
  // The class dim is a SPLIT of the base slice, not a member family of its own, so it takes
  // the scope's member selection exactly as the uncut read does.
  const baseDim = dim === 'class' ? null : dim;
  let sumOf: readonly CutMember[] | null = null;
  if (baseDim === null) {
    if (scope.kind === 'workload') {
      sumOf = nodeMembers(scope.value);
      members = [];
    } else if (scope.kind === 'instance') {
      sumOf = rankMembers(scope.value ?? '');
      members = [];
    } else if (scope.kind === 'holder') {
      members = [holderMember(scope.value ?? '')].filter((m): m is CutMember => m !== null);
    } else {
      members = CUTS.fleet;
    }
  } else if (baseDim === 'holder') {
    const pool =
      scope.kind === 'instance'
        ? rankMembers(scope.value ?? '')
        : scope.kind === 'holder'
          ? [holderMember(scope.value ?? '')].filter((m): m is CutMember => m !== null)
          : CUTS.instance;
    holderPool = scope.kind === 'fleet' ? INSTANCE_CUT_POPULATION : pool.length;
    members = pool.slice(0, limit);
  } else if (baseDim === 'instance') {
    members =
      scope.kind === 'workload'
        ? nodeMembers(scope.value)
        : scope.kind === 'instance'
          ? nodeMembers(null).filter((m) => m.key === scope.value)
          : nodeMembers(null);
  } else if (baseDim === 'workload') {
    members =
      scope.kind === 'workload'
        ? CUTS.workload.filter((m) => m.key === scope.value)
        : CUTS.workload;
  } else {
    members = CUTS[BAND_DIM_CUTS[baseDim] ?? 'fleet'];
  }
  const bucketKey = (i: number): string => {
    const at = desc.startMs + i * desc.bucketMs;
    return grainWord === 'day'
      ? new Date(at).toISOString().slice(0, 10)
      : `${new Date(at).toISOString().slice(0, 16)}:00Z`;
  };
  // Tokens per event vary by band: the short bands carry the whales, so the event basis and
  // the token basis genuinely disagree, as they do in life. No floor: a floor of one event
  // per row drowns small cells and flattens the event mix to uniformity, which is how the
  // instance-hour composition once showed five equal bands whatever the data said.
  const eventsOf = (value: number, band: number): number =>
    Math.max(0, Math.round(value / (TOKENS_PER_EVENT[band] ?? 16)));
  /**
   * The class split of one band's mass: recompute is exactly [ETR, post_clear], and the
   * class IS the close reason. ETR is the steady state (capacity evicted it, traffic asked
   * again); post_clear exists only downstream of an ANNOUNCED cache flush, so its share is
   * near zero in quiet buckets and surges after the scripted clears, decaying as the working
   * set re-warms. The split partitions each value exactly, so the class cut sums to the
   * uncut read to the token.
   */
  const classSplit = (
    value: number,
    band: number,
    bucketIndex: number,
  ): readonly (readonly [string, number])[] => {
    const post = Math.round(
      value * postClearShare(band, desc.startMs + bucketIndex * desc.bucketMs, desc.bucketMs),
    );
    return [
      ['ETR', value - post],
      ['post_clear', post],
    ];
  };
  const rows =
    sumOf !== null
      ? (() => {
          // A scope the corpus never matched has no parts: looked, and found nothing.
          if (sumOf.length === 0) return [];
          const parts = sumOf.map((m) => thrashSeriesFor(m, desc, scenario));
          const mass = sumOf.reduce((a, m) => a + m.share, 0);
          const cov =
            mass > 0 ? sumOf.reduce((a, m) => a + m.cov * m.share, 0) / mass : w.COVERAGE_FULL;
          return Array.from({ length: desc.n }, (_, i) =>
            GAP_BANDS.flatMap((band, b) => {
              // Each part rounds before the sum, exactly as the member cut serves it, so the
              // whole and its parts agree to the token.
              const value = parts.reduce((a, series) => a + Math.round(series[i]?.[b] ?? 0), 0);
              if (dim !== 'class') {
                return [
                  {
                    bucket: bucketKey(i),
                    band: band.key,
                    dims: [] as { dim: string; value: string }[],
                    events: eventsOf(value, b),
                    tokens: figure(value, cov),
                  },
                ];
              }
              return classSplit(value, b, i).map(([cls, clsValue]) => ({
                bucket: bucketKey(i),
                band: band.key,
                dims: [{ dim: 'class', value: cls }],
                events: eventsOf(clsValue, b),
                tokens: figure(clsValue, cov),
              }));
            }),
          ).flat();
        })()
      : members.flatMap((member) => {
          const series = thrashSeriesFor(member, desc, scenario);
          return series.flatMap((bands, i) =>
            bands.flatMap((raw, b) => {
              const value = Math.round(raw);
              if (dim !== 'class') {
                return [
                  {
                    bucket: bucketKey(i),
                    band: GAP_BANDS[b]?.key ?? '10-60m',
                    dims: dim === null ? [] : [{ dim, value: member.key }],
                    events: eventsOf(value, b),
                    tokens: figure(value, member.cov),
                  },
                ];
              }
              return classSplit(value, b, i).map(([cls, clsValue]) => ({
                bucket: bucketKey(i),
                band: GAP_BANDS[b]?.key ?? '10-60m',
                dims: [{ dim: 'class', value: cls }],
                events: eventsOf(clsValue, b),
                tokens: figure(clsValue, member.cov),
              }));
            }),
          );
        });
  const total = rows.reduce((a, row) => a + row.tokens.value, 0);
  const unobserved = Math.round(total * GAP_UNOBSERVED_SHARE);
  return {
    register: 'recompute',
    never_summed_with: 'capacity',
    grain: grainWord,
    // The window echo, exactly as the wire states it: the served bucket WIDTH, the bounds, and
    // for a custom range why this grain. The client renders the buckets it got.
    bucket_ms: desc.bucketMs,
    start_ms: desc.startMs,
    end_ms: desc.startMs + desc.spanMs,
    ...(desc.key === 'custom' ? { derived: 'range × retention' } : {}),
    // The holder cut is a stated top-N: worst first by window mass, a holder whole or absent,
    // and the population names what the rows were cut from.
    ...(dim === 'holder'
      ? { population: holderPool, holders_returned: members.length }
      : {}),
    reach: reachFor(age, w.frontierDay(age)).reach,
    rows,
    gap_unobserved: figure(unobserved, w.COVERAGE_FULL),
    gap_unobserved_events: Math.max(1, Math.round(unobserved / 58)),
  };
}

/** The stops and the ladder, as the endpoint fixes them, over the corpus's edge. */
function bandsDesc(
  windowSpec: string,
  grain: string,
): Pick<WindowDesc, 'n' | 'startMs' | 'bucketMs' | 'unitName' | 'key' | 'spanMs'> {
  // The panel stops, resolved against the emission frontier exactly as the copies read
  // resolves them: one window authority for the page's two zoom charts.
  if (windowSpec === '48h' || windowSpec === '3h') {
    const spanMs = windowSpec === '48h' ? 48 * 3_600_000 : 3 * 3_600_000;
    const minute = grain === 'minute' || (grain === 'auto' && spanMs <= 4 * 3_600_000);
    const bucketMs = minute ? 60_000 : grain === 'day' ? 86_400_000 : 3_600_000;
    const n = Math.max(1, Math.round(spanMs / bucketMs));
    return {
      key: windowSpec,
      n,
      startMs: THRASH_EDGE_MS - spanMs,
      bucketMs,
      spanMs,
      unitName: minute ? 'min' : bucketMs === 3_600_000 ? 'h' : 'day',
    };
  }
  const abs = /^(\d+),(\d+)$/.exec(windowSpec);
  if (abs?.[1] && abs[2]) {
    const a = Number(abs[1]);
    const b = Math.max(Number(abs[2]), a + 600_000);
    // An explicit tier is honored verbatim; auto ladders by span, minute within its reach.
    if (grain === 'minute' || (grain === 'auto' && b - a <= 4 * 3_600_000)) {
      const n = Math.max(2, Math.round((b - a) / 60_000));
      return { key: 'custom', n, startMs: a, bucketMs: 60_000, spanMs: n * 60_000, unitName: 'min' };
    }
    if (grain === 'hour' || (grain === 'auto' && b - a <= 6 * 86_400_000)) {
      const n = Math.max(1, Math.round((b - a) / 3_600_000));
      return { key: 'custom', n, startMs: a, bucketMs: 3_600_000, spanMs: n * 3_600_000, unitName: 'h' };
    }
    const n = Math.max(1, Math.round((b - a) / 86_400_000));
    return { key: 'custom', n, startMs: a, bucketMs: 86_400_000, spanMs: n * 86_400_000, unitName: 'day' };
  }
  const days = windowDays(windowSpec, 14);
  if (grain === 'minute') {
    // Honored verbatim, so the caller's reach check refuses a span past the tier rather than
    // this ladder quietly downgrading it.
    const n = days * 1440;
    return {
      key: 'custom',
      n,
      startMs: THRASH_EDGE_MS - n * 60_000,
      bucketMs: 60_000,
      spanMs: n * 60_000,
      unitName: 'min',
    };
  }
  if (grain === 'hour') {
    const n = days * 24;
    return {
      key: '48h',
      n,
      startMs: THRASH_EDGE_MS - n * 3_600_000,
      bucketMs: 3_600_000,
      spanMs: n * 3_600_000,
      unitName: 'h',
    };
  }
  const start = Math.floor(THRASH_EDGE_MS / 86_400_000) * 86_400_000 - (days - 1) * 86_400_000;
  return {
    key: '14d',
    n: days,
    startMs: start,
    bucketMs: 86_400_000,
    spanMs: days * 86_400_000,
    unitName: 'day',
  };
}

// ── /v1/residual/whales ──────────────────────────────────────────────────────────────────────

/**
 * The whale panel: the heaviest duplicated identities, in the wire's own shape.
 *
 * The window totals agree with the placement anchor's daily rates by construction: one corpus,
 * never authored twice. No coverage figure, by statement rather than omission: `emitted_to_ms`
 * is the honest uncertainty, and it sits one tap seal behind the corpus's wall clock.
 */
export function whalesFor(age: w.AgeScript, query: { window?: string; limit?: number } = {}): WhalesData {
  requirePass(age);
  const days = windowSpanDays(query.window, w.WINDOW_14D.days);
  const scale = days / w.WINDOW_14D.days;
  const limit = Math.max(1, Math.min(query.limit ?? WHALES.length, WHALES.length));
  const HOUR_MS = 3_600_000;
  return {
    register: 'whales',
    never_summed_with: ['capacity', 'recompute'],
    unit: 'token_ms',
    source: 'replication_whale_day',
    // A day is stated once it settles: today is not among them.
    days_stated: days - 1,
    cut: WHALE_CUT,
    duplicated_identity_days: Math.round(WHALE_IDENTITY_DAYS * scale),
    window_dup_token_ms: DUP_TH_DAY * days * HOUR_MS,
    window_held_token_ms: CACHED_TH_DAY * days * HOUR_MS,
    rows: WHALES.slice(0, limit).map((whale) => ({
      ...whale,
      dup_token_ms: whale.dup_token_ms * scale,
      dup_token_ms_bound: whale.dup_token_ms_bound * scale,
      held_token_ms: whale.held_token_ms * scale,
      days_in_cut: Math.min(whale.days_in_cut, days - 1),
    })),
  };
}

// ── /v1/annotations ──────────────────────────────────────────────────────────────────────────

/**
 * A declared deployment, acknowledged. The fixture records row-only and says so: `durable` is
 * the honesty field, and a corpus with no bucket attached must not pretend its markers survive
 * a rebuild. An empty label refuses with its own cause, because a marker with no words marks
 * nothing.
 */
export function recordAnnotationFor(age: w.AgeScript, body: AnnotationBody): AnnotationData {
  requirePass(age);
  if (body.label.trim().length === 0) {
    throw new ApiError(
      400,
      errorBody('annotation_invalid', 'the label is empty after trimming'),
      'the label is empty after trimming',
    );
  }
  return {
    recorded: true,
    durable: false,
    note: 'recorded row-only: no bucket is attached, so this marker will not survive a rebuild',
  };
}


// ── /v1/health ───────────────────────────────────────────────────────────────────────────────

/**
 * The strip's hydration, and it answers at every age including t0.
 *
 * SSE carries deltas only, so a console loading before the first event has nothing to render the
 * dark band from. That is the t0 case this block exists for, and a delta-only design fails it
 * silently.
 */
export function healthFor(age: w.AgeScript): HealthData {
  const hasIngest = age.segments > 0;
  return {
    ingest: {
      batches_total: age.segments,
      events_since_install: age.events,
      last_segment: hasIngest ? `segment-${String(400 + age.segments).padStart(4, '0')}.jsonl` : null,
      last_segment_at_ms: hasIngest ? age.atMs - 240_000 : null,
      last_segment_records: hasIngest ? 186_224 : null,
      last_segment_span: hasIngest
        ? { domain: 'cache', start_ms: age.atMs - 480_000, end_ms: age.atMs - 300_000 }
        : null,
      // Absent rather than faked when the loop has published nothing.
      next_tick_at_ms: age.passes > 0 ? age.atMs + 240_000 : null,
      lag_ms: age.lagMs,
      unknown_kinds_total: 0,
      backlog_files: hasIngest ? 2 : 0,
      backlog_bytes: hasIngest ? 4_194_304 : 0,
      refusing: false,
    },
    // This deployment installs no public module; the core registers' standing is the stamp's.
    modules: [],
    coverage_by_instance:
      age.passes === 0
        ? []
        : w.COVERAGE_BY_SOURCE.map((s) => ({
            day: w.TODAY,
            instance: s.source,
            instances: 1,
            fraction: s.windowTime,
            covered_ms: Math.round(86_400_000 * s.windowTime),
            window_ms: 86_400_000,
            coverage_kind: INSTANCE_TIME,
          })),
    degradations:
      age.passes === 0
        ? []
        : [
            {
              class: 'coverage',
              degraded: 'two instances reported below half the window',
              scope: 'i-025 and i-080, over 8 days of the window',
              unaffected: 'every other instance, and every figure not keyed on those two',
              remedy: 'check the tap on both hosts; a disk-cap drop is declared in its own record',
              register: '>=',
              incidents: 2,
            },
          ],
    models: { observed: age.passes === 0 ? 0 : w.MODELS.observed, undeclared: age.passes === 0 ? w.POPULATIONS.instances : w.MODELS.unobserved },
    producer_runs: Object.values(runPopulation(age).counts).reduce((a, b) => a + b, 0),
    run_states: runPopulation(age).counts,
    agent_versions: ['infertap 0.2.0'],
  };
}

// ── /v1/days/{day} ───────────────────────────────────────────────────────────────────────────

export function dayFor(
  age: w.AgeScript,
  day: string,
  query: { limit?: number; cursor?: string } = {},
): DayData {
  requirePass(age);
  const masses = dayMasses(age);
  const mass = masses.find((m) => m.date === day);
  if (!mass) {
    throw new ApiError(
      404,
      errorBody(
        'window_invalid',
        `${day} lies outside the days this fleet has banked; the corpus runs ${w.dayDate(0)} to ${w.TODAY}`,
        { first_day: w.dayDate(0), last_day: w.TODAY },
      ),
      'day outside the banked range',
    );
  }
  const { reach, withinRaw } = reachFor(age, day);

  // **One section refuses, not the response.** `by_class`, `coverage` and the evidence bound are
  // unpaged and stay valid, so a stale holders cursor must not blank the day panel around them.
  const paged = paginate(w.HOLDERS, age, {
    ...(query.limit === undefined ? { limit: 10 } : { limit: query.limit }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  });

  const holderSection = paged.refused
    ? { holders_page: paged.page, holders_refused: paged.refusal }
    : {
        holders_page: paged.page,
        holders: paged.rows.map((h) => ({
          holder: { instance: h.instance, dp_rank: h.dp_rank, group_idx: h.group_idx },
          tokens: figure(Math.round(h.tokens / w.WINDOW_14D.days), h.coverage),
          share_of_fleet_total: figure(h.tokens / w.WASTE_FULL, h.coverage),
        })),
      };

  return {
    day,
    by_class: [
      { class: 'ETR', tokens: figure(mass.etr, mass.coverage) },
      { class: 'post_clear', tokens: figure(mass.postClear, mass.coverage) },
    ],
    coverage: figure(mass.coverage, mass.coverage),
    ...holderSection,
    // Carried rather than inferred from an empty drill: a retention bound is not an absence of
    // activity.
    evidence_available: withinRaw,
    evidence_bound: reach,
  };
}

// ── /v1/evidence ─────────────────────────────────────────────────────────────────────────────

/**
 * The raw horizon, as the reach a drill either falls inside or does not.
 *
 * Measured back from the FRONTIER rather than from a fixed date: raw retention is a rolling
 * window, so a day that is drillable today falls out of reach once the frontier has moved past
 * it by the declared horizon. Anchoring this to a constant would make the horizon a decoration.
 */
function reachFor(age: w.AgeScript, day: string): { reach: ReachJson; withinRaw: boolean } {
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
function readFromFor(subject: 'holder' | 'block'): string {
  return subject === 'holder' ? 'ring' : 'log';
}

export function evidenceFor(
  age: w.AgeScript,
  query: {
    block?: string;
    holder?: string;
    window?: string;
    limit?: number;
    cursor?: string;
  } = {},
): EvidenceData {
  requirePass(age);
  const subject = query.holder !== undefined ? 'holder' : 'block';
  // An absolute window turns event grain into an index lookup: the records for one subject
  // in one clicked bucket, exactly as the wire's window grammar serves it. The day form
  // stays the day drill's shape.
  const abs = /^(\d+),(\d+)$/.exec(query.window ?? '');
  if (abs?.[1] && abs[2]) {
    const a = Number(abs[1]);
    const b = Math.max(Number(abs[2]), a + 60_000);
    const anchorDay = new Date(a).toISOString().slice(0, 10);
    const { reach: windowReach, withinRaw: windowWithinRaw } = reachFor(age, anchorDay);
    if (!windowWithinRaw) {
      return {
        reach: windowReach,
        read_from: readFromFor(subject),
        records: [],
        truncated: false,
        page: { limit: query.limit ?? 24, returned: 0, next_cursor: null, total_rows: 0 },
        refused: {
          cause: 'outside_raw_horizon',
          message: `event grain is retained about ${w.RAW_HORIZON_DAYS} days; the asked window starts past the oldest record this fleet holds`,
          bound: {
            raw_from_day: w.WINDOW_14D.start,
            declared_days: w.RAW_HORIZON_DAYS,
          },
        },
      };
    }
    const read_from = readFromFor(subject);
    let seed = 97;
    for (const c of `${query.holder ?? query.block ?? ''}`) {
      seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    }
    // Deterministic per subject and instant: roughly one store every few seconds, exactly
    // the density that makes a raw scroll useless and an index lookup the honest form.
    const stepMs = 4_000 + (seed % 5_000);
    const n = Math.min(600, Math.floor((b - a) / stepMs));
    const windowRows = Array.from({ length: n }, (_, i) => ({
      at_ms: a + i * stepMs + ((seed + i * 53) % 3_000),
      block_id: `b${(0x4a1 + ((seed + i * 37) % 0x300)).toString(16)}`,
      class: (seed + i) % 3 === 0 ? 'post_clear' : 'ETR',
      n_tokens: Math.round(900 + ((seed + i * 97) % 7200)),
      coverage: 0.97,
    }));
    const windowPaged = paginate(windowRows, age, {
      ...(query.limit === undefined ? { limit: 24 } : { limit: query.limit }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
    if (windowPaged.refused) {
      return {
        reach: windowReach,
        read_from: readFromFor(subject),
        truncated: false,
        page: windowPaged.page,
        refused: windowPaged.refusal,
      };
    }
    return {
      reach: windowReach,
      read_from,
      records: windowPaged.rows,
      truncated: windowPaged.page.next_cursor !== null,
      page: windowPaged.page,
    };
  }
  const day = w.frontierDay(age);
  const { reach, withinRaw } = reachFor(age, day);

  if (!withinRaw) {
    // A refusal is a result. The drill renders this in place, with its bound, rather than
    // showing an empty table that reads as "nothing happened that day".
    return {
      reach,
      read_from: readFromFor(subject),
      records: [],
      truncated: false,
      page: { limit: query.limit ?? 8, returned: 0, next_cursor: null, total_rows: 0 },
      refused: {
        cause: 'outside_raw_horizon',
        message: `event grain is retained about ${w.RAW_HORIZON_DAYS} days; ${day} is older than the oldest record this fleet holds`,
        bound: {
          raw_from_day: w.WINDOW_14D.start,
          declared_days: w.RAW_HORIZON_DAYS,
          requested_day: day,
        },
      },
    };
  }

  const seed = w.dayStartMs(day) / 86_400_000;
  const all = Array.from({ length: 24 }, (_, i) => ({
    at_ms: w.dayStartMs(day) + 32_400_000 + i * 417_000,
    block_id: `b${(0x9f2 + i * 53).toString(16)}`,
    class: i % 3 === 0 ? 'post_clear' : 'ETR',
    n_tokens: Math.round(900 + ((seed + i * 53) % 7200)),
    coverage: 0.97,
  }));
  const paged = paginate(all, age, {
    ...(query.limit === undefined ? { limit: 8 } : { limit: query.limit }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  });
  if (paged.refused) {
    return { reach, read_from: readFromFor(subject), truncated: false, page: paged.page, refused: paged.refusal };
  }
  return {
    reach,
    read_from: readFromFor(subject),
    records: paged.rows,
    truncated: paged.page.next_cursor !== null,
    page: paged.page,
  };
}

// ── /v1/blocks and the block drill ───────────────────────────────────────────────────────────

/**
 * Each day's blocks by stored mass, from a summary of bounded memory: every figure a bound,
 * with its error stated. **A ranking, not a page**: it issues no cursor.
 */
export function blocksFor(
  age: w.AgeScript,
  query: { window?: string; limit?: number } = {},
): BlocksData {
  requirePass(age);
  const capacity = 4096;
  const limit = query.limit ?? 50;
  const days = [w.frontierDay(age)].map((day) => {
    const blocks = w.HOLDERS.slice(0, Math.min(40, limit)).map((h, i) => {
      const upper = Math.round(h.tokens / 6);
      return {
        block_id: `b${(0x4a1 + i * 37).toString(16)}`,
        tokens_at_least: upper,
        tokens_at_most: upper,
        certain: i < 10,
        // Holders that STORED it, never holders it was resident on at once: a lower bound.
        holders_at_least: 2 + (i % 9),
      };
    });
    const tokens = blocks.reduce((sum, b) => sum + b.tokens_at_most, 0);
    return {
      day,
      tokens: figure(tokens, 0.97),
      capacity,
      cut: 50,
      error_bound: tokens / capacity,
      blocks,
    };
  });
  return { register: 'stored', days };
}

/**
 * The declared tags over the window. This fleet declares none, so the read states its coverage
 * and an empty grouping rather than a zero.
 */
export function tagsFor(age: w.AgeScript): TagsData {
  requirePass(age);
  const window = w.stampedWindow(age);
  const days = w.dayIndex(window.end) - w.dayIndex(window.start) + 1;
  return {
    through_ms: w.dayStartMs(w.frontierDay(age)) + 43_200_000,
    coverage: {
      covered_ms: 0.97 * days * 86_400_000,
      window_ms: days * 86_400_000,
      fraction: 0.97,
    },
    tags: [],
  };
}

export function blockHoldersFor(
  age: w.AgeScript,
  blockId: string,
  query: { window?: string; limit?: number; cursor?: string } = {},
): BlockHoldersData {
  requirePass(age);
  const all = w.HOLDERS.slice(0, 9).map((h, i) => ({
    holder: { instance: h.instance, dp_rank: h.dp_rank, group_idx: h.group_idx },
    at_ms: w.dayStartMs(w.TODAY) + 28_800_000 + i * 611_000,
    class: i % 4 === 0 ? 'post_clear' : 'ETR',
    // Event grain, so a row carries the mass the analysis stated rather than an aggregate this layer
    // derived. That is why `n_tokens` is a column here and a figure on the blocks table.
    n_tokens: 1800 + i * 940,
  }));
  // Keyset paging: the read answers "is there more" from the same statement, so `total_rows`
  // stays null rather than costing a second scan for a number nobody reads.
  const paged = paginate(all, age, query, { countable: false });
  if (paged.refused) {
    return {
      block_id: blockId,
      bound: reachFor(age, w.frontierDay(age)).reach,
      read_from: readFromFor('block'),
      page: paged.page,
      refused: paged.refusal,
    };
  }
  return {
    block_id: blockId,
    bound: reachFor(age, w.frontierDay(age)).reach,
    read_from: readFromFor('block'),
    rows: paged.rows,
    page: paged.page,
  };
}

export function timelineFor(
  age: w.AgeScript,
  holder: HolderId,
  query: { window?: string; limit?: number; cursor?: string } = {},
): TimelineData {
  requirePass(age);
  // An absolute window is honored, not ignored: the rank page's pulse asks newest, and the
  // chart-to-evidence jump asks one bucket's span. Deterministic per holder either way.
  let seed = 11;
  for (const c of `${holder.instance}/${holder.dp_rank}/${holder.group_idx}`) {
    seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  }
  const abs = /^(\d+),(\d+)$/.exec(query.window ?? '');
  const all = abs?.[1] && abs[2]
    ? (() => {
        const a = Number(abs[1]);
        const b = Math.max(Number(abs[2]), a + 60_000);
        const stepMs = 5_000 + (seed % 4_000);
        const n = Math.min(600, Math.floor((b - a) / stepMs));
        return Array.from({ length: n }, (_, i) => ({
          at_ms: a + i * stepMs + ((seed + i * 41) % 2_500),
          block_id: `b${(0x4a1 + ((seed + i * 37) % 0x300)).toString(16)}`,
          class: (seed + i) % 3 === 0 ? 'post_clear' : 'ETR',
          n_tokens: 1800 + ((seed + i * 1097) % 9200),
        }));
      })()
    : Array.from({ length: 14 }, (_, i) => ({
        at_ms: w.dayStartMs(w.TODAY) - (13 - i) * 3_600_000,
        block_id: `b${(0x4a1 + ((seed + i * 37) % 0x300)).toString(16)}`,
        class: (seed + i) % 3 === 0 ? 'post_clear' : 'ETR',
        n_tokens: 1800 + ((seed + i * 1097) % 9200),
      }));
  const paged = paginate(all, age, query, { countable: false });
  const bound = reachFor(age, w.frontierDay(age)).reach;
  if (paged.refused) {
    return { holder, bound, read_from: readFromFor('holder'), page: paged.page, refused: paged.refusal };
  }
  return {
    holder,
    bound,
    read_from: readFromFor('holder'),
    rows: paged.rows,
    page: paged.page,
  };
}

// ── /v1/markers/{id} ─────────────────────────────────────────────────────────────────────────

export function markerFor(id: string): MarkerData {
  const seam = w.SEAMS.find((s) => s.id === id);
  if (!seam) {
    throw new ApiError(
      404,
      errorBody('unknown_marker', `no marker ${id} in this fleet's annotation stream`, {
        known_markers: w.SEAMS.map((s2) => s2.id),
      }),
      'unknown marker',
    );
  }
  return { marker: markerJson(seam) };
}


// ── /v1/stamp and /v1/findings ───────────────────────────────────────────────────────────────

export function stampDataFor(age: w.AgeScript): { ready: boolean } {
  return { ready: age.passes > 0 };
}
