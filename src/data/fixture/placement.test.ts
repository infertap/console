// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { AGE_SCRIPT, TODAY } from './world';
import {
  PLACEMENT_DAYS,
  placementFor,
  placementInvariants,
} from './placement';

/**
 * The placement corpus, asserted rather than trusted.
 *
 * Same discipline as `world.test.ts`: a printed invariant is one somebody has to look at, and
 * these are the same claims made where they fail a build.
 *
 * The cardinality assertions are the ones with history. A single-bucket corpus cannot expose a
 * per-bucket blowup by construction, which is how a panel reached a screenshot while drawing one
 * curve per row against an API that groups by bucket AND class. Two days here, checked, so the
 * next panel meets the shape it will be served.
 */

describe('the placement corpus is internally consistent', () => {
  for (const invariant of placementInvariants()) {
    it(invariant.name, () => {
      expect(invariant.holds).toBe(true);
    });
  }
});

describe('cardinality parity with a real response', () => {
  it('carries more than one analyzed day, which the rest of the world does not', () => {
    const days = [...new Set(placementFor(AGE_SCRIPT.t3).rows.map((r) => r.day))];
    expect(days).toHaveLength(2);
    expect(days).toContain(TODAY);
  });

  it('repeats every pair across both days, so a per-day render is distinguishable', () => {
    const rows = placementFor(AGE_SCRIPT.t3).rows;
    const first = rows.filter((r) => r.day === PLACEMENT_DAYS[0]);
    const second = rows.filter((r) => r.day === PLACEMENT_DAYS[1]);
    expect(first.length).toBe(second.length);
    expect(first.length).toBeGreaterThan(0);
  });

  it('states that day rows sum to the window, because sums merge where quantiles do not', () => {
    expect(placementFor(AGE_SCRIPT.t3).day_rows_sum_to_window).toBe(true);
  });
});

describe('before a pass, nothing is invented', () => {
  it('returns no rows at t0 rather than zeroes', () => {
    const d = placementFor(AGE_SCRIPT.t0);
    expect(d.rows).toHaveLength(0);
    expect(d.within_engine).toHaveLength(0);
  });

  it('still declares its register and its bound at t0', () => {
    const d = placementFor(AGE_SCRIPT.t0);
    expect(d.register).toBe('placement');
    expect(d.bound.source).toBe('replication_pairs_day');
  });
});

describe('every cell can be rendered by the design system', () => {
  it('carries value, coverage, coverage_kind and register on every figure', () => {
    for (const row of placementFor(AGE_SCRIPT.t3).rows) {
      expect(row.token_ms).toMatchObject({
        value: expect.any(Number),
        coverage: expect.any(Number),
        coverage_kind: expect.any(String),
        register: 'placement',
      });
    }
  });

  it('names the instance-grain basis, because a per-rank gap is invisible to it', () => {
    const [first] = placementFor(AGE_SCRIPT.t3).rows;
    expect(first?.token_ms.coverage_kind).toContain('instance');
  });
});
