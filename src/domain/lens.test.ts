// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { FiguresData } from './contract';
import { duplicationSpans, recomputeSpans } from './lens';

/**
 * The v0 attribution arithmetic, against hand-built figures.
 *
 * This is the one computation the fixture cannot exercise: the live path exists exactly where
 * the lens does not, so the corpus never reaches it and the arithmetic is checked here instead.
 */

const RECOMPUTE = ['ETR', 'post_clear'];

function figuresAt(
  grain: string,
  buckets: readonly (readonly [string, string, number])[],
): FiguresData {
  return {
    register: 'recompute',
    never_summed_with: 'capacity',
    grain,
    segments: [
      {
        semantics_version: 'js-6',
        discriminator: 'd',
        window: { start_day: '2026-08-03', end_day: '2026-08-03', start_ms: 0, end_ms: 0 },
        figures: buckets.map(([bucket, cls, value]) => ({
          bucket,
          dims: [{ dim: 'class', value: cls }],
          events: 1,
          tokens: { value, coverage: 0.99, coverage_kind: 'token-weighted', register: '>=' },
        })),
      },
    ],
  };
}

const AT = Date.parse('2026-08-03T14:20:00Z');

describe('recomputeSpans', () => {
  it('means equal spans either side, at the grain the response states', () => {
    const spans = recomputeSpans(
      figuresAt('minute', [
        ['2026-08-03T14:18:00Z', 'ETR', 120],
        ['2026-08-03T14:18:00Z', 'post_clear', 30],
        ['2026-08-03T14:19:00Z', 'ETR', 150],
        ['2026-08-03T14:21:00Z', 'ETR', 90],
        ['2026-08-03T14:22:00Z', 'ETR', 110],
      ]),
      RECOMPUTE,
      AT,
    );
    expect(spans).not.toBeNull();
    // Before: (120 + 30 + 150) over two minute buckets. After: (90 + 110) over two.
    expect(spans?.rcBefore).toBeCloseTo(150);
    expect(spans?.rcAfter).toBeCloseTo(100);
    expect(spans?.afterMinutes).toBe(2);
  });

  it('excludes classes outside the register, because the card is the recompute register', () => {
    const spans = recomputeSpans(
      figuresAt('minute', [
        ['2026-08-03T14:19:00Z', 'ETR', 100],
        ['2026-08-03T14:19:00Z', 'cold', 900],
        ['2026-08-03T14:21:00Z', 'ETR', 100],
      ]),
      RECOMPUTE,
      AT,
    );
    expect(spans?.rcBefore).toBeCloseTo(100);
  });

  it('computes hour-wide means when the server answered at hour grain', () => {
    const spans = recomputeSpans(
      figuresAt('hour', [
        ['2026-08-03T13:00:00Z', 'ETR', 6000],
        ['2026-08-03T14:00:00Z', 'ETR', 3000],
      ]),
      RECOMPUTE,
      Date.parse('2026-08-03T13:30:00Z'),
    );
    // 6000 tokens over one hour bucket is 100 tok/min, never 6000.
    expect(spans?.rcBefore).toBeCloseTo(100);
    expect(spans?.afterMinutes).toBe(60);
  });

  it('returns null with no before span, because a card with no baseline has no comparison', () => {
    const spans = recomputeSpans(
      figuresAt('minute', [['2026-08-03T14:21:00Z', 'ETR', 90]]),
      RECOMPUTE,
      AT,
    );
    expect(spans).toBeNull();
  });

  it('scopes to one workload when the read carried the dim', () => {
    const figures = figuresAt('minute', []);
    const withDims: FiguresData = {
      ...figures,
      segments: [
        {
          ...figures.segments[0]!,
          figures: [
            {
              bucket: '2026-08-03T14:19:00Z',
              dims: [
                { dim: 'class', value: 'ETR' },
                { dim: 'workload', value: 'rag-batch' },
              ],
              events: 1,
              tokens: { value: 100, coverage: 0.99, coverage_kind: 'token-weighted', register: '>=' },
            },
            {
              bucket: '2026-08-03T14:19:00Z',
              dims: [
                { dim: 'class', value: 'ETR' },
                { dim: 'workload', value: 'chat-prod' },
              ],
              events: 1,
              tokens: { value: 900, coverage: 0.99, coverage_kind: 'token-weighted', register: '>=' },
            },
          ],
        },
      ],
    };
    const spans = recomputeSpans(withDims, RECOMPUTE, AT, 'rag-batch');
    expect(spans?.rcBefore).toBeCloseTo(100);
  });
});

describe('duplicationSpans', () => {
  it('sums the bands per bucket and rates them at the served bucket width', () => {
    const spans = duplicationSpans(
      {
        register: 'capacity',
        never_summed_with: ['recompute'],
        unit: 'token_ms',
        grain: '5min',
        bucket_ms: 300_000,
        start_ms: AT - 600_000,
        end_ms: AT + 600_000,
        window_dup_token_ms: 0,
        rows: [
          { bucket_ms: AT - 600_000, k2: 3_600_000, k34: 3_600_000, k58: 0, k9: 0 },
          { bucket_ms: AT - 300_000, k2: 7_200_000, k34: 0, k58: 0, k9: 0 },
          { bucket_ms: AT, k2: 1_800_000, k34: 0, k58: 0, k9: 0 },
        ],
        members: [],
        cross_engine_token_ms: 0,
        zero_basis: {
          meaning: 'measured',
          instances: 2,
          stores: 10,
          comparable_stores: 10,
          key_spaces: 1,
        },
        within_engine_token_ms: 0,
        cache_group_token_ms: 0,
        copies_token_ms: 0,
        window_held_token_ms: 0,
      },
      AT,
    );
    // Before: two 5-min buckets holding 2 + 2 token-hours: 4 tok-h over 10 min.
    expect(spans?.duBefore).toBeCloseTo(0.4);
    // After: one bucket holding 0.5 tok-h over 5 min.
    expect(spans?.duAfter).toBeCloseTo(0.1);
    expect(spans?.afterMinutes).toBe(5);
  });

  it('returns null with no before bucket', () => {
    const spans = duplicationSpans(
      {
        register: 'capacity',
        never_summed_with: ['recompute'],
        unit: 'token_ms',
        grain: '5min',
        bucket_ms: 300_000,
        start_ms: AT,
        end_ms: AT + 300_000,
        window_dup_token_ms: 0,
        rows: [{ bucket_ms: AT, k2: 1, k34: 0, k58: 0, k9: 0 }],
        members: [],
        cross_engine_token_ms: 0,
        zero_basis: {
          meaning: 'measured',
          instances: 2,
          stores: 10,
          comparable_stores: 10,
          key_spaces: 1,
        },
        within_engine_token_ms: 0,
        cache_group_token_ms: 0,
        copies_token_ms: 0,
        window_held_token_ms: 0,
      },
      AT,
    );
    expect(spans).toBeNull();
  });
});
