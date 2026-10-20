// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, MIN_MS, bucketLabel, parseRangeInput } from '../../domain/windows';
import { atGrain, customWindow, presetWindow } from './windows';

/** The fixture corpus's edge: one tap seal behind 2026-08-03 15:00Z, exactly the mock's. */
const EDGE = Date.parse('2026-08-03T15:00:00Z');
const NOW = EDGE;

describe('the corpus resolves the preset stops as the endpoint would', () => {
  it('14 d covers whole days and includes the edge day as a full bucket', () => {
    const w = presetWindow('14d', EDGE);
    expect(w.n).toBe(14);
    expect(new Date(w.startMs).toISOString()).toBe('2026-07-21T00:00:00.000Z');
    expect(w.spanMs).toBe(14 * DAY_MS);
    expect(bucketLabel(w, 0)).toBe('07-21');
    expect(bucketLabel(w, 13)).toBe('08-03');
  });

  it('48 h ends at the edge, hour buckets', () => {
    const w = presetWindow('48h', EDGE);
    expect(w.n).toBe(48);
    expect(w.startMs).toBe(EDGE - 48 * HOUR_MS);
    expect(w.bucketMs).toBe(HOUR_MS);
  });

  it('3 h is 180 minute buckets ending at the edge, in the one grain vocabulary', () => {
    const w = presetWindow('3h', EDGE);
    expect(w.n).toBe(180);
    expect(w.bucketMs).toBe(MIN_MS);
    expect(w.grain).toBe('minute');
    expect(bucketLabel(w, 0)).toBe('12:00');
    expect(bucketLabel(w, 179)).toBe('14:59');
  });

  it('an explicit grain re-buckets a stop verbatim, as the server honors an explicit ask', () => {
    const w = atGrain(presetWindow('3h', EDGE), 'hour');
    expect(w.grain).toBe('hour');
    expect(w.n).toBe(3);
    expect(w.spanMs).toBe(3 * HOUR_MS);
  });
});

describe('the corpus derives a custom range\'s grain from range × reach, with the server\'s budgets', () => {
  const at = (s: string): number => parseRangeInput(s);

  it('a three-hour recent span answers at minute buckets', () => {
    const w = customWindow(at('2026-08-03T11:00'), at('2026-08-03T14:00'), NOW);
    expect(w.grain).toBe('minute');
    expect(w.n).toBe(180);
    expect(w.derived).toBe('range × retention');
    expect(w.rangeLabel).toBe('08-03 11:00→14:00');
  });

  it('a five-hour span is past the minute point budget and answers hourly', () => {
    const w = customWindow(at('2026-08-03T09:00'), at('2026-08-03T14:00'), NOW);
    expect(w.grain).toBe('hour');
    expect(w.n).toBe(5);
  });

  it('a short span past the minute reach says which reach it exceeded', () => {
    const w = customWindow(at('2026-07-20T09:00'), at('2026-07-20T12:00'), NOW);
    expect(w.grain).toBe('hour');
    expect(w.derived).toBe('minute reach exceeded');
  });

  it('a three-day span answers hourly', () => {
    const w = customWindow(at('2026-07-30T00:00'), at('2026-08-02T00:00'), NOW);
    expect(w.grain).toBe('hour');
    expect(w.n).toBe(72);
  });

  it('a month answers daily', () => {
    const w = customWindow(at('2026-07-01T00:00'), at('2026-08-01T00:00'), NOW);
    expect(w.grain).toBe('day');
    expect(w.n).toBe(31);
    expect(w.rangeLabel).toBe('07-01→08-01');
  });

  it('a span older than the hourly retention says so', () => {
    const w = customWindow(at('2025-06-01T00:00'), at('2025-06-04T00:00'), NOW);
    expect(w.grain).toBe('day');
    expect(w.derived).toBe('hourly retention exceeded');
  });

  it('reversed bounds swap; a dot of a range widens to ten minutes', () => {
    const w = customWindow(at('2026-08-03T14:00'), at('2026-08-03T09:00'), NOW);
    expect(w.startMs).toBe(at('2026-08-03T09:00'));
    const dot = customWindow(at('2026-08-03T14:00'), at('2026-08-03T14:00'), NOW);
    expect(dot.spanMs).toBeGreaterThanOrEqual(10 * MIN_MS);
  });
});
