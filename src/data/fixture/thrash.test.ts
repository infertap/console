// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { GAP_BANDS } from '../../domain/lens';
import { bandsView } from '../../domain/bands';
import { ledgerInvariants } from './ledger';
import { bandsFor } from './responses';
import { AGE_SCRIPT } from './world';
import { CUTS, THRASH_EDGE_MS, thrashInvariants } from './thrash';

const T3 = AGE_SCRIPT.t3;

describe('the thrash corpus holds its invariants', () => {
  for (const invariant of thrashInvariants()) {
    it(invariant.name, () => {
      expect(invariant.holds).toBe(true);
    });
  }
});

describe('the attribution ledger holds its invariants', () => {
  for (const invariant of ledgerInvariants()) {
    it(invariant.name, () => {
      expect(invariant.holds).toBe(true);
    });
  }
});

describe('the bands read', () => {
  it('serves the four observed bands and keeps the unobserved beside them, never a fifth', () => {
    const data = bandsFor(T3, { window: '14d', grain: 'day' });
    const bands = new Set(data.rows.map((r) => r.band));
    expect([...bands].sort()).toEqual(GAP_BANDS.map((b) => b.key).sort());
    expect(data.gap_unobserved.value).toBeGreaterThan(0);
    expect(data.gap_unobserved_events).toBeGreaterThan(0);
  });

  it('is deterministic: the same ask renders the same bytes', () => {
    const a = bandsFor(T3, { window: '14d', grain: 'day' });
    const b = bandsFor(T3, { window: '14d', grain: 'day' });
    expect(a.rows).toEqual(b.rows);
  });

  it('rides the cut in dims, and the fleet read carries none', () => {
    const fleet = bandsFor(T3, { window: '14d', grain: 'day' });
    expect(fleet.rows.every((r) => r.dims.length === 0)).toBe(true);
    const byWorkload = bandsFor(T3, { window: '14d', grain: 'day', dims: 'workload' });
    const members = new Set(
      byWorkload.rows.map((r) => r.dims.find((d) => d.dim === 'workload')?.value),
    );
    expect([...members].sort()).toEqual(CUTS.workload.map((m) => m.key).sort());
  });

  it('states the grain it served, and an explicit tier is honored verbatim', () => {
    expect(bandsFor(T3, { window: '14d', grain: 'day' }).grain).toBe('day');
    expect(bandsFor(T3, { window: '2d', grain: 'hour' }).grain).toBe('hour');
    const threeHours = `${THRASH_EDGE_MS - 3 * 3_600_000},${THRASH_EDGE_MS}`;
    const minute = bandsFor(T3, { window: threeHours, grain: 'minute' });
    expect(minute.grain).toBe('minute');
    expect(minute.bucket_ms).toBe(60_000);
    expect(minute.rows.length / GAP_BANDS.length).toBe(180);
  });

  it('resolves the panel stops against the emission frontier, one authority with the copies read', () => {
    const three = bandsFor(T3, { window: '3h', grain: 'minute' });
    expect(three.grain).toBe('minute');
    expect(three.end_ms).toBe(THRASH_EDGE_MS);
    expect(three.rows.length / GAP_BANDS.length).toBe(180);
    expect(three.derived).toBeUndefined();
    const fortyEight = bandsFor(T3, { window: '48h', grain: 'hour' });
    expect(fortyEight.end_ms).toBe(THRASH_EDGE_MS);
    expect((fortyEight.end_ms - fortyEight.start_ms) / fortyEight.bucket_ms).toBe(48);
  });

  it('refuses a minute ask past the tier\'s 48-hour reach, with the bound stated', () => {
    expect(() => bandsFor(T3, { window: '14d', grain: 'minute' })).toThrow(/48 hours/);
  });

  it('refuses the holder cut at minute grain by name', () => {
    const threeHours = `${THRASH_EDGE_MS - 3 * 3_600_000},${THRASH_EDGE_MS}`;
    expect(() => bandsFor(T3, { window: threeHours, grain: 'minute', dims: 'holder' })).toThrow(
      /minute/,
    );
  });

  it('the view model grids the rows and the scenarios pull the short bands apart', () => {
    const threeHours = `${THRASH_EDGE_MS - 3 * 3_600_000},${THRASH_EDGE_MS}`;
    const view = (scenario: 'win' | 'reg') =>
      bandsView(bandsFor(T3, { window: threeHours, grain: 'minute', dims: 'workload' }, scenario), 'workload');
    const short = (v: ReturnType<typeof view>): number => {
      const rag = v.members.find((m) => m.key === 'rag-batch');
      const last = rag?.rows[rag.rows.length - 1];
      return (last?.[0] ?? 0) + (last?.[1] ?? 0);
    };
    expect(short(view('win'))).toBeLessThan(short(view('reg')));
  });

  it('token-weighted member coverage survives the grouping', () => {
    const view = bandsView(bandsFor(T3, { window: '14d', grain: 'day', dims: 'workload' }), 'workload');
    const rag = view.members.find((m) => m.key === 'rag-batch');
    expect(rag?.coverage).toBeCloseTo(0.991, 3);
  });
});
