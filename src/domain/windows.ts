// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The window vocabulary: ONE stop list, one served-window descriptor, one grain spelling.
 *
 * Every panel that offers a window offers these stops, in this order, with these labels, and
 * every panel opens at the same default. The stop names a SPAN; it never names a grain. The
 * grain is whatever the server served, read off the response's own `bucket_ms` and stated on
 * the glass beside the range (`docs/proposal-grain-ladder.md` §4.1, landing 1). A control
 * label that named a grain was how two panels on one page came to draw "3 h" at two widths.
 *
 * **Every axis label is a raw UTC instant, never a relative offset.** A reader should read a
 * clock, not do arithmetic against "now".
 *
 * Nothing here reads a wall clock, and nothing here derives a grain. The edge and the grain
 * arrive in the response; this module dresses what was served.
 */

export const MIN_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/**
 * The grains a response can serve. `5min` is the copies read's own word until the grain
 * vocabulary is unified on the wire (landing 2); it is dressed from `bucket_ms` like the rest.
 */
export type WindowGrain = 'day' | 'hour' | 'minute' | '5min';

/** The stops, in control order. A span each, never a grain. */
export const WINDOW_STOPS = [
  { key: '14d', label: '14 d' },
  { key: '48h', label: '48 h' },
  { key: '3h', label: '3 h' },
  { key: 'custom', label: 'custom' },
] as const;

export type WindowKey = (typeof WINDOW_STOPS)[number]['key'];
export interface WindowStop {
  readonly key: WindowKey;
  readonly label: string;
}

/** Every panel opens here. The fleet's resting state is two weeks at day grain. */
export const DEFAULT_WINDOW: WindowKey = '14d';

/**
 * The stops an entity page offers: the three panel stops, no custom range. Every entity scope
 * has a minute table now. A workload is a key column on the fleet minute cells; an instance or
 * a holder scope, and the instance cut, serve from the rank-grain minute cells (analyzer
 * landing 7 of `proposal-grain-ladder.md`, pin `52cda7f` and later). What has no minute table
 * is the holder cut: the rank cells keep the instance and the rank and roll the cache group up,
 * so a page that groups by holder asks that one read at hour and says so on its head.
 */
export const ENTITY_STOPS: readonly WindowStop[] = WINDOW_STOPS.filter(
  (s) => s.key !== 'custom',
);

/** Parse a query value as one of the offered stops, or the default. */
export function windowKey(
  raw: string | null,
  offered: readonly WindowStop[] = WINDOW_STOPS,
): WindowKey {
  return offered.find((s) => s.key === raw)?.key ?? DEFAULT_WINDOW;
}

/** The stop's own label, for a head that names the span before any response arrives. */
export function stopLabel(key: WindowKey): string {
  return WINDOW_STOPS.find((s) => s.key === key)?.label ?? key;
}

/** The tier each stop asks for explicitly. A stop fixes its grain; a custom range asks `auto`. */
export function stopGrain(key: '14d' | '48h' | '3h'): 'day' | 'hour' | 'minute' {
  return key === '14d' ? 'day' : key === '48h' ? 'hour' : 'minute';
}

export interface WindowDesc {
  readonly key: WindowKey;
  /** The control's label for this stop. */
  readonly label: string;
  readonly grain: WindowGrain;
  /** The grain as the glass spells it: `day`, `hour`, `minute`, `5 min`. */
  readonly grainLabel: string;
  /** Bucket count. */
  readonly n: number;
  readonly startMs: number;
  readonly spanMs: number;
  readonly bucketMs: number;
  /** Label every Nth bucket, so the axis stays legible at every width. */
  readonly tickEvery: number;
  /** The bucket noun, for units like "tokens/day". */
  readonly unitName: string;
  /** The head's window statement: a range, as raw UTC instants, or the stop's label. */
  readonly rangeLabel: string;
  /** Custom only: how the grain was chosen, stamped beside the range inputs. */
  readonly derived?: string;
}

const hhmm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

const mdOf = (ms: number): string => new Date(ms).toISOString().slice(5, 10);

/** Hour-grain tick: midnights carry the date, other hours the clock. */
const hourTick = (ms: number): string => {
  const d = new Date(ms);
  return d.getUTCHours() === 0 ? mdOf(ms) : `${String(d.getUTCHours()).padStart(2, '0')}:00`;
};

/** The range as raw UTC instants: one date with a clock span, or a date pair. */
export function rangeLabelOf(startMs: number, endMs: number): string {
  return mdOf(startMs) === mdOf(endMs)
    ? `${mdOf(startMs)} ${hhmm(startMs)}→${hhmm(endMs)}`
    : `${mdOf(startMs)}→${mdOf(endMs)}`;
}

/** The label of bucket `i`, as the raw UTC instant it opens. */
export function bucketLabel(desc: WindowDesc, i: number): string {
  const at = desc.startMs + i * desc.bucketMs;
  if (desc.grain === 'day') return mdOf(at);
  if (desc.grain === 'hour') return hourTick(at);
  return hhmm(at);
}

/** Parse `YYYY-MM-DDTHH:MM` (a datetime-local value) as a UTC instant. */
export function parseRangeInput(value: string): number {
  const v = value.length === 10 ? `${value}T00:00` : value;
  return Date.parse(`${v}:00Z`);
}

/** An epoch instant as a datetime-local value, the range row's vocabulary. */
export function msToRangeInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

/**
 * The grain a served bucket width IS. The response's grain word is not consulted: the copies
 * read says `5min` where the bands read says `minute`, and the width is what the chart draws.
 */
export function grainOfBucket(bucketMs: number): WindowGrain {
  if (bucketMs >= DAY_MS) return 'day';
  if (bucketMs >= HOUR_MS) return 'hour';
  return bucketMs >= 5 * MIN_MS ? '5min' : 'minute';
}

/** The grain as the glass spells it. */
export function grainLabelOf(grain: WindowGrain): string {
  return grain === '5min' ? '5 min' : grain;
}

/** The bucket noun the axis unit takes: `tokens/day`, `tokens/h`, `tokens/min`. */
function unitNameOf(grain: WindowGrain): string {
  return grain === 'day' ? 'day' : grain === 'hour' ? 'h' : grain === 'minute' ? 'min' : '5 min';
}

/**
 * A window as the SERVER served it: bucket width and bounds turned into the descriptor the
 * charts consume. This is the "render what you got" half of the grammar: the client never
 * re-derives the tier, it dresses the served one. `rangeLabel` is the stop's own label where
 * the client knows which stop it asked for, else the served range as UTC instants.
 */
export function servedWindow(
  served: {
    readonly bucket_ms: number;
    readonly start_ms: number;
    readonly end_ms: number;
    readonly derived?: string | null;
  },
  rangeLabel?: string,
): WindowDesc {
  const grain = grainOfBucket(served.bucket_ms);
  const n = Math.max(1, Math.round((served.end_ms - served.start_ms) / served.bucket_ms));
  return {
    key: 'custom',
    label: 'custom',
    grain,
    grainLabel: grainLabelOf(grain),
    n,
    startMs: served.start_ms,
    spanMs: n * served.bucket_ms,
    bucketMs: served.bucket_ms,
    tickEvery: Math.max(grain === 'day' || grain === 'hour' ? 1 : 3, Math.ceil(n / 8)),
    unitName: unitNameOf(grain),
    rangeLabel: rangeLabel ?? rangeLabelOf(served.start_ms, served.end_ms),
    ...(served.derived == null ? {} : { derived: served.derived }),
  };
}

/**
 * The range inputs a custom stop opens with: the window the panel was showing, so the first
 * custom request is that window restated in the absolute form. A custom stop with no bounds
 * yet asked for `0,0` once; a request is never sent without both bounds now, and the seed is
 * what makes "custom" a complete ask on its first render.
 */
export function customSeed(desc: WindowDesc): { readonly from: string; readonly to: string } {
  return { from: msToRangeInput(desc.startMs), to: msToRangeInput(desc.startMs + desc.spanMs) };
}

/**
 * A token-time mass as a daily rate over the window it was measured in, in token-hours per
 * day. ONE derivation for every "per day" figure on the glass: the anchor, the panel and the
 * breakdown used to divide three different ways. A span shorter than a minute is floored so a
 * degenerate window cannot produce an infinite rate.
 */
export function perDay(tokenMs: number, spanMs: number): number {
  return tokenMs / HOUR_MS / (Math.max(spanMs, MIN_MS) / DAY_MS);
}

// ── Markers on the window ────────────────────────────────────────────────────────────────────

export interface MarkerMark {
  readonly id: string;
  /** Horizontal position, as a fraction of the window. */
  readonly frac: number;
}

/** Where an instant falls in the window, or null when outside it. */
export function markerFrac(atMs: number, desc: WindowDesc): number | null {
  const f = (atMs - desc.startMs) / desc.spanMs;
  return f >= 0 && f <= 1 ? f : null;
}

export interface SpanFracs {
  /** Before-span start, marker instant, after-span end, as window fractions. */
  readonly b0: number;
  readonly m: number;
  readonly a1: number;
}

/**
 * The selected marker's equal spans, shaded on the panel's own series.
 *
 * One hour either side, clamped to the window. Absent where the marker is outside the window,
 * where it breaks the series (a breaking marker refuses its comparison), or where the buckets
 * are coarser than an hour — a shaded span narrower than one bar would claim precision the
 * chart cannot draw.
 */
export function spanFracs(
  marker: { readonly at_ms: number; readonly breaks: boolean } | undefined,
  desc: WindowDesc,
): SpanFracs | null {
  if (!marker || marker.breaks || desc.bucketMs > HOUR_MS) return null;
  const m = markerFrac(marker.at_ms, desc);
  if (m === null) return null;
  const f = (t: number): number => (t - desc.startMs) / desc.spanMs;
  return {
    b0: Math.max(0, f(marker.at_ms - 60 * MIN_MS)),
    m,
    a1: Math.min(1, f(marker.at_ms + 60 * MIN_MS)),
  };
}
