// SPDX-License-Identifier: AGPL-3.0-only
/** Per-instance rate cells from the peers read (`dims=instance,class`, unscoped). */
import type { FiguresData } from '../../../domain/contract';
import { RECOMPUTE_CLASSES } from '../../../domain/trend';

export function peerCells(data: FiguresData): {
  windowByInstance: Map<string, { recompute: number; total: number }>;
  medianByBucket: Map<string, number>;
} {
  const windowByInstance = new Map<string, { recompute: number; total: number }>();
  const perBucket = new Map<string, Map<string, { recompute: number; total: number }>>();
  for (const segment of data.segments) {
    for (const bucket of segment.figures ?? []) {
      const inst = bucket.dims.find((d) => d.dim === 'instance')?.value;
      if (inst === undefined) continue;
      const cls = bucket.dims.find((d) => d.dim === 'class')?.value;
      const isRecompute = cls !== undefined && RECOMPUTE_CLASSES.includes(cls);
      const win = windowByInstance.get(inst) ?? { recompute: 0, total: 0 };
      win.total += bucket.tokens.value;
      if (isRecompute) win.recompute += bucket.tokens.value;
      windowByInstance.set(inst, win);
      let cells = perBucket.get(bucket.bucket);
      if (!cells) {
        cells = new Map();
        perBucket.set(bucket.bucket, cells);
      }
      const cell = cells.get(inst) ?? { recompute: 0, total: 0 };
      cell.total += bucket.tokens.value;
      if (isRecompute) cell.recompute += bucket.tokens.value;
      cells.set(inst, cell);
    }
  }
  const medianByBucket = new Map<string, number>();
  for (const [key, cells] of perBucket) {
    const rates = [...cells.values()]
      .filter((c) => c.total > 0)
      .map((c) => c.recompute / c.total)
      .sort((a, b) => a - b);
    const mid = rates[Math.floor((rates.length - 1) / 2)];
    if (mid !== undefined) medianByBucket.set(key, mid);
  }
  return { windowByInstance, medianByBucket };
}
