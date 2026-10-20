// SPDX-License-Identifier: AGPL-3.0-only
import type { FiguresData } from '../../domain/contract';
import { RECOMPUTE_CLASSES } from '../../domain/trend';
import { percent } from '../../design-system/format/numbers';

/**
 * The entity pages' shared rate arithmetic: recompute over all cache work, from a
 * class-dimensioned figures read. Segments are never blended — a bucket belongs to exactly
 * one segment, so accumulating by bucket key never sums across a seam, and refused segments
 * stay unstatable.
 */

/** A rate, at the precision its size needs to be legible. */
export const rate = (v: number): string => percent(v, v < 0.02 ? 2 : 1);

/** One bucket of a rate series: recompute, total and the coverage-weighted recompute. */
export interface RatePoint {
  readonly key: string;
  readonly recompute: number;
  readonly total: number;
  readonly weighted: number;
}

/** Per-bucket rate cells from a class-dimensioned figures read, oldest first. */
export function ratePoints(data: FiguresData): RatePoint[] {
  const byBucket = new Map<string, { recompute: number; total: number; weighted: number }>();
  for (const segment of data.segments) {
    for (const bucket of segment.figures ?? []) {
      const cls = bucket.dims.find((d) => d.dim === 'class')?.value;
      const cell = byBucket.get(bucket.bucket) ?? { recompute: 0, total: 0, weighted: 0 };
      cell.total += bucket.tokens.value;
      if (cls !== undefined && RECOMPUTE_CLASSES.includes(cls)) {
        cell.recompute += bucket.tokens.value;
        cell.weighted += bucket.tokens.coverage * bucket.tokens.value;
      }
      byBucket.set(bucket.bucket, cell);
    }
  }
  return [...byBucket.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, c]) => ({ key, ...c }));
}

/** One cut member's recompute and total over the window. */
export interface MemberCell {
  recompute: number;
  total: number;
  weighted: number;
}

/** Per-member window cells from a figures read carrying one entity dim plus class. */
export function memberRates(data: FiguresData, dim: string): Map<string, MemberCell> {
  const out = new Map<string, MemberCell>();
  for (const segment of data.segments) {
    for (const bucket of segment.figures ?? []) {
      const member = bucket.dims.find((d) => d.dim === dim)?.value;
      if (member === undefined) continue;
      const cls = bucket.dims.find((d) => d.dim === 'class')?.value;
      const cell = out.get(member) ?? { recompute: 0, total: 0, weighted: 0 };
      cell.total += bucket.tokens.value;
      if (cls !== undefined && RECOMPUTE_CLASSES.includes(cls)) {
        cell.recompute += bucket.tokens.value;
        cell.weighted += bucket.tokens.coverage * bucket.tokens.value;
      }
      out.set(member, cell);
    }
  }
  return out;
}

/** The lower median. */
export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)] ?? 0;
}
