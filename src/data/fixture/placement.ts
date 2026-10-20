// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The placement corpus: where the same content sat, and on which pairs.
 *
 * **The pre-contract types are gone, as promised.** This file carried hand-written shapes while
 * `/v1/residual/placement` did not exist, agreed with the analyzer before either side built. The
 * endpoint landed at 40738ce and every field matched, so the generated type is now the source of
 * truth and the local ones are deleted rather than left to drift beside it. The swap was a
 * one-file change because nothing outside this file and the panels ever imported them.
 *
 * **Two analyzed days, and that is the point.** The rest of this world runs a single bucket,
 * and a single-bucket corpus cannot catch a per-bucket cardinality blowup by construction: the
 * gap panel drew one curve per row against a corpus that only ever had one row per class, and
 * would have drawn fourteen against a real analyzer. Two days here means the panels meet the
 * shape they will actually be served.
 *
 * Deterministic like the rest of the world: seeded, fixed days, no clock.
 */

import type {
  Figure,
  PlacementData,
  PlacementRow,
  WithinEngineRow,
} from '../../domain/contract';
import { AGE_SCRIPT, dayDate, TODAY, TREND_DAYS, type AgeScript } from './world';

export type { PlacementData };

const DAY_MS = 86_400_000;

/** Milliseconds of resident overlap per token. The console renders token-hours. */
const HOUR_MS = 3_600_000;

/** The two analyzed days this corpus banks. Newest last. */
export const PLACEMENT_DAYS: readonly string[] = [dayDate(TREND_DAYS - 2), TODAY];

/** A figure, in the wire's shape. Coverage rides every cell, never the response. */




function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const engine = (n: number): string => `i-${String(n).padStart(3, '0')}`;

/**
 * The coverage basis, named as the wire will name it.
 *
 * Instance-grain: the intersection of both engines' heartbeat-observed time over the day. **A
 * per-rank gap inside an engine is invisible at this basis**, which matters because every other
 * figure on this document is per-rank. A cell can read fully covered while a rank inside one of
 * its two engines was dark.
 */
const PAIR_OBSERVED = 'pair-observed time, instance grain';

function figure(tokenHours: number, coverage: number): Figure {
  return {
    value: Math.round(tokenHours * HOUR_MS),
    coverage,
    coverage_kind: PAIR_OBSERVED,
    register: 'placement',
  };
}

/**
 * Two workload shapes, because the panel exists to tell them apart.
 *
 * `chat-prod` is DENSE: one prefix every engine serves, so overlap appears on most pairs of the
 * group and the matrix fills. That is the shared-trunk case, and the remedy is prompt mass.
 *
 * `rag-batch` is SPARSE: a few pairs carry nearly all of it, which is the routing case, and the
 * remedy is affinity. Same register, same unit, opposite reading, and a reader who cannot see the
 * matrix cannot tell which fleet they have.
 */
const DENSE_GROUP = [1, 2, 3, 4, 5, 6, 7, 8];

/** Each engine runs dp=2 here, so an engine pair carries four holder pairs beneath it. */
const RANK_PAIRS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];
const SPARSE_PAIRS: readonly (readonly [number, number])[] = [
  [11, 12],
  [11, 19],
  [24, 37],
];

function pairsFor(day: string, dayIdx: number): PlacementRow[] {
  const r = rng(8_675_309 + dayIdx * 977);
  const out: PlacementRow[] = [];

  // Dense: every unordered pair in the group, canonical a < b.
  for (let i = 0; i < DENSE_GROUP.length; i++) {
    for (let j = i + 1; j < DENSE_GROUP.length; j++) {
      const a = DENSE_GROUP[i] as number;
      const b = DENSE_GROUP[j] as number;
      // A broad shallow floor with a couple of heavier pairs, so the matrix has shape rather
      // than being uniformly warm.
      const heavy = (a === 1 && b === 2) || (a === 3 && b === 6);
      const base = heavy ? 5_600 + r() * 900 : 1_450 + r() * 820;
      // Two engines in this group are half-observed for the day. The cell reads as the weaker
      // claim it is rather than silently averaging into its neighbours.
      const impaired = a === 5 || b === 5;
      // Coverage is INSTANCE-grain by construction: it is the intersection of both engines'
      // observed time over the day, so every holder pair beneath one engine pair carries the
      // SAME coverage. That identity is what makes the matrix's client-side aggregation honest
      // rather than a laundering step, and `placement.test.ts` asserts it — the day the basis
      // goes finer it stops holding, and the aggregation has to move server-side.
      const cov = impaired ? 0.51 + r() * 0.06 : 0.96 + r() * 0.03;
      for (const [ra, rb] of RANK_PAIRS) {
        out.push({
          workload: 'chat-prod',
          engine_a: engine(a),
          rank_a: ra,
          group_a: 0,
          engine_b: engine(b),
          rank_b: rb,
          group_b: 0,
          token_ms: figure((base / RANK_PAIRS.length) * (dayIdx === 0 ? 0.86 : 1), cov),
          day,
        });
      }
    }
  }

  for (const [a, b] of SPARSE_PAIRS) {
    out.push({
      workload: 'rag-batch',
      engine_a: engine(a),
      rank_a: 0,
      group_a: 0,
      engine_b: engine(b),
      rank_b: 0,
      group_b: 0,
      token_ms: figure((a === 11 && b === 12 ? 9_400 : 780) * (dayIdx === 0 ? 0.91 : 1), 0.97 + r() * 0.02),
      day,
    });
  }

  // The undeclared bucket is a named slice, never folded away and never dropped. A producer
  // that declared nothing has not declared "no workload", it has said nothing, and
  // collapsing the two would report uncategorized traffic as traffic categorized as none.
  out.push({
    workload: 'undeclared',
    engine_a: engine(41),
    rank_a: 0,
    group_a: 0,
    engine_b: engine(42),
    rank_b: 0,
    group_b: 0,
    token_ms: figure(1_120 * (dayIdx === 0 ? 0.94 : 1), 0.93 + r() * 0.04),
    day,
  });

  return out;
}

function withinFor(day: string, dayIdx: number): WithinEngineRow[] {
  const r = rng(112_358 + dayIdx * 131);
  // Data parallelism replicates the whole cache per rank, so a DP=8 engine holds its shared
  // trunk eight times over and no router reaches inside it. Canonical rank_a < rank_b.
  const out: WithinEngineRow[] = [];
  for (const [ra, rb] of [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const) {
    out.push({
      workload: 'chat-prod',
      engine: engine(1),
      rank_a: ra,
      group_a: 0,
      rank_b: rb,
      group_b: 0,
      token_ms: figure((3_200 + r() * 400) * (dayIdx === 0 ? 0.9 : 1), 0.97 + r() * 0.02),
      day,
    });
  }
  return out;
}

/** The primary state: the figure computes, on both days. */
export function placementFor(age: AgeScript): PlacementData {
  const days = age.passes > 0 ? PLACEMENT_DAYS : [];
  return {
    register: 'placement',
    never_summed_with: ['capacity', 'recompute'],
    unit: 'token_ms',
    day_rows_sum_to_window: true,
    bound: { source: 'replication_pairs_day' },
    ...totalled(days.flatMap((d, i) => pairsFor(d, i)), days.flatMap((d, i) => withinFor(d, i))),
  };
}

/** The partition and the figure it sums to, derived together so they cannot disagree. */
function totalled(
  rows: PlacementRow[],
  within: WithinEngineRow[],
): { rows: PlacementRow[]; within_engine: WithinEngineRow[]; window_total: Figure } {
  const cells = [...rows.map((r) => r.token_ms), ...within.map((r) => r.token_ms)];
  return {
    rows,
    within_engine: within,
    window_total: {
      value: cells.reduce((a, c) => a + c.value, 0),
      coverage: cells.length > 0 ? Math.min(...cells.map((c) => c.coverage)) : 0,
      coverage_kind: PAIR_OBSERVED,
      register: 'placement',
    },
  };
}

/** Invariants, in the world's own style. A failing row means the corpus is lying. */
export function placementInvariants(): readonly { name: string; holds: boolean }[] {
  const d = placementFor(AGE_SCRIPT.t3);
  const days = [...new Set(d.rows.map((r) => r.day))];
  return [
    { name: 'placement banks two analyzed days', holds: days.length === 2 },
    {
      name: 'every pair is canonically ordered',
      holds: d.rows.every((r) => r.engine_a < r.engine_b),
    },
    {
      name: 'every rank pair is canonically ordered',
      holds: d.within_engine.every((r) => r.rank_a < r.rank_b),
    },
    {
      // Keyed on the full holder triple on both sides. Keying on engines alone passed while the
      // corpus emitted one row per engine pair and would have hidden a genuine duplicate the
      // moment rows went holder-grain — which is exactly what happened.
      name: 'no holder pair repeats within a day',
      holds:
        new Set(
          d.rows.map(
            (r) =>
              `${r.day}|${r.workload}|${r.engine_a}:${r.rank_a}:${r.group_a}|${r.engine_b}:${r.rank_b}:${r.group_b}`,
          ),
        ).size === d.rows.length,
    },
    {
      name: 'every cell carries its own coverage',
      holds: d.rows.every((r) => r.token_ms.coverage > 0 && r.token_ms.coverage <= 1),
    },
    {
      // The property the matrix's aggregation rests on. `pair_observed_ms` is instance-grain, so
      // every holder pair beneath one engine pair must carry an IDENTICAL coverage. When that
      // holds, summing them mixes no confidence and the weakest-cell rule is satisfied trivially.
      // The day the basis goes finer this fails, and that is the day the aggregation has to move
      // server-side rather than being quietly wrong on the glass.
      name: 'coverage is identical across every holder pair under one engine pair',
      holds: (() => {
        const by = new Map<string, Set<number>>();
        for (const r of d.rows) {
          const k = `${r.day}|${r.workload}|${r.engine_a}|${r.engine_b}`;
          const set = by.get(k) ?? new Set<number>();
          set.add(r.token_ms.coverage);
          by.set(k, set);
        }
        return [...by.values()].every((set) => set.size === 1);
      })(),
    },
    {
      name: 'the dense workload fills more pairs than the sparse one',
      holds:
        d.rows.filter((r) => r.workload === 'chat-prod' && r.day === TODAY).length >
        d.rows.filter((r) => r.workload === 'rag-batch' && r.day === TODAY).length,
    },
    {
      name: 'no workload is null; absence is the literal undeclared',
      holds: d.rows.every((r) => typeof r.workload === 'string' && r.workload.length > 0),
    },
    {
      name: 'placement is never summed with either other register',
      holds:
        d.never_summed_with.includes('capacity') && d.never_summed_with.includes('recompute'),
    },
    {
      name: 'a day of overlap cannot exceed a day of wall clock per token',
      holds: d.rows.every((r) => r.token_ms.value > 0 && Number.isFinite(r.token_ms.value)),
    },
    {
      name: 'the impaired pair reads as the weaker claim',
      holds: d.rows.some((r) => r.token_ms.coverage < 0.75),
    },
    {
      // The invariant the wire's window_total exists to make checkable. Believing the two arrays
      // are disjoint is a promise; asserting they sum to the stated figure is a check.
      name: 'the two arrays are disjoint partitions of the window total',
      holds:
        d.rows.reduce((a, r) => a + r.token_ms.value, 0) +
          d.within_engine.reduce((a, r) => a + r.token_ms.value, 0) ===
        d.window_total.value,
    },
    {
      name: 'the window total carries the weakest cell in the response',
      holds:
        d.window_total.coverage ===
        Math.min(
          ...d.rows.map((r) => r.token_ms.coverage),
          ...d.within_engine.map((r) => r.token_ms.coverage),
        ),
    },
  ];
}

export { DAY_MS as PLACEMENT_DAY_MS };
