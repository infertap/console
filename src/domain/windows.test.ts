// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  DEFAULT_WINDOW,
  ENTITY_STOPS,
  HOUR_MS,
  MIN_MS,
  WINDOW_STOPS,
  bucketLabel,
  customSeed,
  grainOfBucket,
  markerFrac,
  msToRangeInput,
  parseRangeInput,
  perDay,
  rangeLabelOf,
  servedWindow,
  spanFracs,
  stopGrain,
  stopLabel,
  windowKey,
} from './windows';

/** The fixture corpus's edge: one tap seal behind 2026-08-03 15:00Z. */
const EDGE = Date.parse('2026-08-03T15:00:00Z');

describe('the one stop list', () => {
  it('names spans, never grains, and every panel opens at the same stop', () => {
    expect(WINDOW_STOPS.map((s) => s.label)).toEqual(['14 d', '48 h', '3 h', 'custom']);
    for (const s of WINDOW_STOPS) expect(s.label).not.toMatch(/·|min|hour|day/);
    expect(DEFAULT_WINDOW).toBe('14d');
  });

  it('parses a query value against what the panel offers, else the default', () => {
    expect(windowKey('3h')).toBe('3h');
    expect(windowKey('nonsense')).toBe(DEFAULT_WINDOW);
    expect(windowKey(null)).toBe(DEFAULT_WINDOW);
    // An entity page offers the three panel stops and no custom range, so it parses those.
    expect(ENTITY_STOPS.map((s) => s.key)).toEqual(['14d', '48h', '3h']);
    expect(windowKey('3h', ENTITY_STOPS)).toBe('3h');
    expect(windowKey('48h', ENTITY_STOPS)).toBe('48h');
    expect(windowKey('custom', ENTITY_STOPS)).toBe(DEFAULT_WINDOW);
  });

  it('each stop fixes its tier, and the label is the stop, not the tier', () => {
    expect(stopGrain('14d')).toBe('day');
    expect(stopGrain('48h')).toBe('hour');
    expect(stopGrain('3h')).toBe('minute');
    expect(stopLabel('48h')).toBe('48 h');
  });

});

describe('a served window is dressed from its bucket width', () => {
  const served = (bucket_ms: number, spanMs: number) => ({
    bucket_ms,
    start_ms: EDGE - spanMs,
    end_ms: EDGE,
  });

  it('60-second buckets are minute grain, whatever the response calls them', () => {
    const w = servedWindow(served(MIN_MS, 3 * HOUR_MS), '3 h');
    expect(w.grain).toBe('minute');
    expect(w.grainLabel).toBe('minute');
    expect(w.unitName).toBe('min');
    expect(w.n).toBe(180);
    expect(w.rangeLabel).toBe('3 h');
  });

  it('five-minute buckets are their own grain and say so', () => {
    const w = servedWindow(served(5 * MIN_MS, 3 * HOUR_MS), '3 h');
    expect(w.grain).toBe('5min');
    expect(w.grainLabel).toBe('5 min');
    expect(w.unitName).toBe('5 min');
    expect(w.n).toBe(36);
  });

  it('hour and day buckets', () => {
    expect(servedWindow(served(HOUR_MS, 48 * HOUR_MS)).grainLabel).toBe('hour');
    expect(servedWindow(served(DAY_MS, 14 * DAY_MS)).grainLabel).toBe('day');
    expect(grainOfBucket(DAY_MS)).toBe('day');
    expect(grainOfBucket(HOUR_MS)).toBe('hour');
  });

  it('a custom range labels itself as UTC instants and carries the server\'s derivation', () => {
    const w = servedWindow({
      bucket_ms: HOUR_MS,
      start_ms: parseRangeInput('2026-08-03T09:00'),
      end_ms: parseRangeInput('2026-08-03T14:00'),
      derived: 'range × retention',
    });
    expect(w.rangeLabel).toBe('08-03 09:00→14:00');
    expect(w.derived).toBe('range × retention');
    expect(w.n).toBe(5);
  });

  it('labels buckets as the instants they open', () => {
    // The 14 d stop is served day-aligned: whole UTC days through the edge's day.
    const day = servedWindow({
      bucket_ms: DAY_MS,
      start_ms: Date.parse('2026-07-21T00:00:00Z'),
      end_ms: Date.parse('2026-08-04T00:00:00Z'),
    });
    expect(bucketLabel(day, 0)).toBe('07-21');
    expect(bucketLabel(day, 13)).toBe('08-03');
    const hour = servedWindow(served(HOUR_MS, 48 * HOUR_MS));
    expect(bucketLabel(hour, 0)).toBe('15:00');
    // 09 hours after 15:00 is midnight: the tick carries the date, not 00:00.
    expect(bucketLabel(hour, 9)).toBe('08-02');
  });
});

describe('a custom stop is a complete ask', () => {
  it('round-trips the datetime-local form as a UTC instant', () => {
    const at = Date.UTC(2026, 0, 2, 13, 7);
    expect(parseRangeInput('2026-01-02T13:07')).toBe(at);
    expect(parseRangeInput('2026-01-02')).toBe(Date.UTC(2026, 0, 2));
    expect(msToRangeInput(at)).toBe('2026-01-02T13:07');
  });

  it('writes a same-day range as one date with a clock span, a longer one as a date pair', () => {
    const t0 = Date.UTC(2026, 2, 10);
    expect(rangeLabelOf(t0 + 13 * HOUR_MS, t0 + 16 * HOUR_MS)).toBe('03-10 13:00→16:00');
    expect(rangeLabelOf(t0, t0 + 48 * HOUR_MS)).toBe('03-10→03-12');
  });

  it('seeds both bounds from the window the panel was showing', () => {
    const w = servedWindow({ bucket_ms: HOUR_MS, start_ms: EDGE - 48 * HOUR_MS, end_ms: EDGE });
    expect(customSeed(w)).toEqual({ from: '2026-08-01T15:00', to: '2026-08-03T15:00' });
  });
});

describe('one daily-rate derivation', () => {
  it('states token-hours per day over the span the mass was measured in', () => {
    // 48 token-hours over two days is 24 a day; a 3 h span extrapolates, and says so by unit.
    expect(perDay(48 * HOUR_MS, 2 * DAY_MS)).toBeCloseTo(24);
    expect(perDay(3 * HOUR_MS, 3 * HOUR_MS)).toBeCloseTo(24);
    // A degenerate span is floored, never divided to infinity.
    expect(Number.isFinite(perDay(HOUR_MS, 0))).toBe(true);
  });
});

describe('markers on the window', () => {
  const w = servedWindow({ bucket_ms: 5 * MIN_MS, start_ms: EDGE - 3 * HOUR_MS, end_ms: EDGE });
  const inside = Date.parse('2026-08-03T14:20:00Z');

  it('places an in-window instant as a fraction and refuses one outside', () => {
    expect(markerFrac(inside, w)).toBeCloseTo((inside - w.startMs) / w.spanMs);
    expect(markerFrac(w.startMs - MIN_MS, w)).toBeNull();
  });

  it('shades exactly one hour either side where the window allows it', () => {
    const t0 = Date.UTC(2026, 2, 10);
    const hourly = servedWindow({ bucket_ms: HOUR_MS, start_ms: t0, end_ms: t0 + 4 * HOUR_MS });
    expect(spanFracs({ at_ms: t0 + 2 * HOUR_MS, breaks: false }, hourly)).toEqual({
      b0: 0.25,
      m: 0.5,
      a1: 0.75,
    });
    expect(spanFracs(undefined, hourly)).toBeNull();
  });

  it('shades equal spans around a non-breaking marker, clamped to the window', () => {
    const s = spanFracs({ at_ms: inside, breaks: false }, w);
    expect(s).not.toBeNull();
    expect(s?.m).toBeCloseTo(markerFrac(inside, w) ?? -1);
    // 14:20 + 60 min runs past the 15:00 edge, so the after span clamps to 1.
    expect(s?.a1).toBe(1);
  });

  it('a breaking marker refuses its spans', () => {
    expect(spanFracs({ at_ms: inside, breaks: true }, w)).toBeNull();
  });

  it('day buckets are coarser than the spans, so no shading', () => {
    const day = servedWindow({ bucket_ms: DAY_MS, start_ms: EDGE - 14 * DAY_MS, end_ms: EDGE });
    expect(spanFracs({ at_ms: inside, breaks: false }, day)).toBeNull();
  });
});
