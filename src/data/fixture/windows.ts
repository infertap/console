// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The corpus's own window resolution: what the SERVER does with a stop or an absolute range,
 * faked here so the fixture can answer as the endpoint would. Ported from `mockups/v3`.
 *
 * This is fixture code, not vocabulary. A panel never derives a grain; it renders the one the
 * response served (`domain/windows.ts`). These two functions are the fixture's stand-in for the
 * analyzer's resolver, and they live beside the fixture for that reason.
 */

import {
  DAY_MS,
  HOUR_MS,
  MIN_MS,
  rangeLabelOf,
  type WindowDesc,
} from '../../domain/windows';

/**
 * The reach ladder the corpus's grain derivation walks, mirroring the server's: the minute
 * tables reach 48 hours today, the hourly ones a year. The point budgets are the server's
 * too (`AUTO_GRAIN_MINUTE_POINT_BUDGET` 240, `AUTO_GRAIN_HOUR_POINT_BUDGET` 200).
 */
export const MINUTE_RETENTION_DAYS = 2;
export const HOURLY_RETENTION_DAYS = 365;
const MINUTE_POINT_BUDGET = 240;
const HOUR_POINT_BUDGET = 200;

/**
 * A descriptor re-bucketed at an explicit grain, as the server honors an explicit ask
 * verbatim. The span and the start are the caller's; only the bucket width and its labels
 * move.
 */
export function atGrain(desc: WindowDesc, grain: 'minute' | 'hour' | 'day'): WindowDesc {
  const bucketMs = grain === 'minute' ? MIN_MS : grain === 'hour' ? HOUR_MS : DAY_MS;
  const n = Math.max(1, Math.round(desc.spanMs / bucketMs));
  return {
    ...desc,
    grain,
    grainLabel: grain,
    n,
    bucketMs,
    spanMs: n * bucketMs,
    tickEvery: Math.max(grain === 'minute' ? 3 : 1, Math.ceil(n / 8)),
    unitName: grain === 'day' ? 'day' : grain === 'hour' ? 'h' : 'min',
  };
}

/**
 * The three preset stops, anchored to the series edge.
 *
 * The 14 d stop covers whole days and includes the edge's day as a full-day bucket; the 48 h and
 * 3 h stops end at the edge itself. The edge is the newest instant the data reaches, one tap
 * seal behind the wall clock.
 */
export function presetWindow(key: '14d' | '48h' | '3h', edgeMs: number): WindowDesc {
  if (key === '14d') {
    const dayStart = Math.floor(edgeMs / DAY_MS) * DAY_MS;
    return {
      key,
      label: '14 d',
      grain: 'day',
      grainLabel: 'day',
      n: 14,
      startMs: dayStart - 13 * DAY_MS,
      spanMs: 14 * DAY_MS,
      bucketMs: DAY_MS,
      tickEvery: 2,
      unitName: 'day',
      rangeLabel: '14 d',
    };
  }
  if (key === '48h') {
    return {
      key,
      label: '48 h',
      grain: 'hour',
      grainLabel: 'hour',
      n: 48,
      startMs: edgeMs - 48 * HOUR_MS,
      spanMs: 48 * HOUR_MS,
      bucketMs: HOUR_MS,
      tickEvery: 6,
      unitName: 'h',
      rangeLabel: '48 h',
    };
  }
  // The 3 h stop serves at minute grain: 180 whole minutes through the current one, never `5min`.
  return {
    key,
    label: '3 h',
    grain: 'minute',
    grainLabel: 'minute',
    n: 180,
    startMs: edgeMs - 3 * HOUR_MS,
    spanMs: 3 * HOUR_MS,
    bucketMs: MIN_MS,
    tickEvery: 23,
    unitName: 'min',
    rangeLabel: '3 h',
  };
}

/**
 * A custom range as the copies endpoint resolves it: date and time in, grain OUT, stamped.
 *
 * `nowMs` anchors the retention arithmetic: how old the range start is decides which grains
 * can still answer.
 */
export function customWindow(fromMs: number, toMs: number, nowMs: number): WindowDesc {
  let a = fromMs;
  let b = toMs;
  if (a > b) [a, b] = [b, a];
  if (b - a < 10 * MIN_MS) b = a + 10 * MIN_MS;
  const spanMin = (b - a) / MIN_MS;
  const spanDays = (b - a) / DAY_MS;
  const ageDays = (nowMs - a) / DAY_MS;
  const rangeLabel = rangeLabelOf(a, b);

  if (spanMin <= MINUTE_POINT_BUDGET && ageDays <= MINUTE_RETENTION_DAYS) {
    const n = Math.max(2, Math.ceil(spanMin));
    return {
      key: 'custom',
      label: 'custom',
      grain: 'minute',
      grainLabel: 'minute',
      n,
      startMs: a,
      spanMs: n * MIN_MS,
      bucketMs: MIN_MS,
      tickEvery: Math.max(3, Math.round(spanMin / 8)),
      unitName: 'min',
      rangeLabel,
      derived: 'range × retention',
    };
  }
  if (spanMin / 60 <= HOUR_POINT_BUDGET && ageDays <= HOURLY_RETENTION_DAYS) {
    const n = Math.max(1, Math.ceil(spanMin / 60));
    return {
      key: 'custom',
      label: 'custom',
      grain: 'hour',
      grainLabel: 'hour',
      n,
      startMs: a,
      spanMs: n * HOUR_MS,
      bucketMs: HOUR_MS,
      tickEvery: spanDays > 2 ? 12 : 6,
      unitName: 'h',
      rangeLabel,
      derived: spanMin <= MINUTE_POINT_BUDGET ? 'minute reach exceeded' : 'range × retention',
    };
  }
  const n = Math.max(1, Math.ceil((b - a) / DAY_MS));
  return {
    key: 'custom',
    label: 'custom',
    grain: 'day',
    grainLabel: 'day',
    n,
    startMs: a,
    spanMs: n * DAY_MS,
    bucketMs: DAY_MS,
    tickEvery: Math.max(1, Math.ceil(n / 10)),
    unitName: 'day',
    rangeLabel,
    derived: ageDays > HOURLY_RETENTION_DAYS ? 'hourly retention exceeded' : 'range × retention',
  };
}
