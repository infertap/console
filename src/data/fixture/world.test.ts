// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { bandsFor, figuresFor, instanceDuplicationFor } from './responses';
import {
  AGE_SCRIPT,
  HOLDERS,
  POPULATIONS,
  SEAMS,
  TODAY,
  TREND_DAYS,
  advanced,
  dayDate,
  frontierIndex,
  invariants,
  trendFor,
} from './world';

/**
 * The corpus's arithmetic, asserted rather than logged.
 *
 * The mock computed these invariants and printed them at the bottom of `data-v2.js`. A printed
 * invariant is one somebody has to look at; this file is the same claims made in a place that
 * fails a build. If one of them breaks, the corpus is lying somewhere, and a platform engineer
 * cross-checks arithmetic instinctively.
 */

describe('the world is internally consistent', () => {
  for (const invariant of invariants()) {
    it(invariant.name, () => {
      expect(invariant.holds).toBe(true);
    });
  }
});

describe('the three populations stay three different numbers', () => {
  it('orders instances below holders below runs', () => {
    // Using one where another belongs is the quiet-wrong class, so the corpus makes them
    // visibly different rather than coincidentally equal.
    expect(POPULATIONS.instances).toBeLessThan(POPULATIONS.holdersSeen);
    expect(POPULATIONS.holdersSeen).toBeLessThan(POPULATIONS.runs);
  });

  it('lists the holder no pass covered rather than omitting it', () => {
    expect(POPULATIONS.holdersListable + POPULATIONS.holdersUnexamined).toBe(
      POPULATIONS.holdersSeen,
    );
    expect(HOLDERS).toHaveLength(POPULATIONS.holdersListable);
  });
});

describe('the trend fills without ever rendering a zero', () => {
  it('examines nothing at t0 and t1', () => {
    for (const age of [AGE_SCRIPT.t0, AGE_SCRIPT.t1]) {
      expect(trendFor(age).every((p) => !p.examined)).toBe(true);
    }
  });

  it('examines part of one window at t2 and most of the trend at t3', () => {
    const t2 = trendFor(AGE_SCRIPT.t2).filter((p) => p.examined);
    const t3 = trendFor(AGE_SCRIPT.t3).filter((p) => p.examined);
    expect(t2).toHaveLength(AGE_SCRIPT.t2.examinedDays);
    expect(t3).toHaveLength(AGE_SCRIPT.t3.examinedDays);
    expect(t2.length).toBeLessThan(t3.length);
  });

  it('never produces a zero value, at any age', () => {
    // Unexamined regions hatch. They are not zeroes, and nothing downstream may turn them into
    // one by reading a value that was never measured.
    for (const age of Object.values(AGE_SCRIPT)) {
      expect(trendFor(age).every((p) => p.value > 0)).toBe(true);
    }
  });
});

describe('the frontier day is examined once a pass has run', () => {
  it('the examined days end at the frontier at every age with a pass, and after every advance', () => {
    // A pass walks every dirty day its window covers and emits each one, so the frontier
    // day's cells exist the moment one pass has run. t2 used to leave its frontier day
    // unexamined while the stamp named it, which no analyzer produces.
    for (const age of [
      AGE_SCRIPT.t2,
      AGE_SCRIPT.t3,
      advanced(AGE_SCRIPT.t2),
      advanced(AGE_SCRIPT.t2, 5),
    ]) {
      const examined = trendFor(age)
        .filter((p) => p.examined)
        .map((p) => p.day);
      expect(examined).toHaveLength(age.examinedDays);
      expect(examined[examined.length - 1]).toBe(frontierIndex(age));
      expect(examined[0]).toBe(frontierIndex(age) - age.examinedDays + 1);
    }
  });

  it('at t2 the figures, the ranks and the duplication all answer one node over the 3 h and 48 h stops', () => {
    // The three reads the instance page makes over the same window. A node with no stores has
    // no rank ratio and no duplication either, so the reads must agree: all three non-empty.
    const t2 = AGE_SCRIPT.t2;
    for (const [window, grain] of [
      ['3h', 'minute'],
      ['48h', 'hour'],
    ] as const) {
      const figures = figuresFor(t2, { window, grain, dims: ['class'], instance: 'i-001' });
      const mass = figures.segments
        .flatMap((s) => s.figures ?? [])
        .reduce((a, b) => a + b.tokens.value, 0);
      expect(mass).toBeGreaterThan(0);
      const ranks = bandsFor(t2, { window, grain: 'hour', instance: 'i-001', dims: 'holder' });
      expect(ranks.rows.length).toBeGreaterThan(0);
      const duplication = instanceDuplicationFor(t2, 'i-001', { window });
      expect(duplication.rows.length).toBeGreaterThan(0);
    }
  });
});

describe('the seams', () => {
  it('derives every date from its day index, so the two cannot disagree', () => {
    for (const seam of SEAMS) {
      expect(seam.at).toBe(dayDate(seam.day));
      expect(seam.at <= TODAY).toBe(true);
    }
  });

  it('carries both a breaking and a non-breaking seam inside the trend', () => {
    // A seam that changes the number's meaning breaks the series; a deploy marks it and does
    // not. The corpus must exercise both or the distinction never gets rendered.
    const inTrend = SEAMS.filter((s) => s.day < TREND_DAYS);
    expect(inTrend.some((s) => s.breaks)).toBe(true);
    expect(inTrend.some((s) => !s.breaks)).toBe(true);
  });
});
