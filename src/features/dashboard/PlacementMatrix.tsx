// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { PlacementData } from '../../domain/contract';
import { integer, percent } from '../../design-system/format/numbers';
import styles from './PlacementMatrix.module.css';

/**
 * One workload's engine-by-engine matrix.
 *
 * **The axis is ENGINES, and the cell says so.** The wire emits holder-grain pairs — a rank of A
 * against a rank of B — but this view answers to gateway routing affinity, and a gateway routes
 * to an engine: one InferencePool endpoint, one pod. Nothing an operator configures addresses
 * "rank 3 of A versus rank 5 of B", so holder detail sits BELOW the actionable grain here. Rank
 * grain is not lost; it is relocated to `within_engine`, where the balancer's dp-placement knob
 * actually lives.
 *
 * **The aggregation is honest because coverage cannot be mixed by it.** `pair_observed_ms` is
 * instance-grain — the intersection of both ENGINES' observed time — so every holder pair beneath
 * one engine pair carries an identical coverage by construction. Summing them therefore blends no
 * confidence, and the weakest-cell rule is satisfied trivially rather than by luck. A corpus
 * invariant asserts that identity, because the day the basis goes finer it stops holding and the
 * aggregation has to move server-side.
 *
 * **Cells are `rows` entries only.** Within-engine overlap never appears here: it is rank-to-rank
 * inside one engine, a different axis, and putting it on the diagonal would make the diagonal
 * mean something the rest of the grid does not. The diagonal is simply empty, and empty here is
 * the honest reading — an engine cannot duplicate content against itself at this grain.
 *
 * **Why a matrix rather than a bigger number.** The ledger says how much; this says whether it is
 * everywhere or somewhere. Broad warmth across the group is one prefix every engine serves, and
 * the remedy is prompt mass. A few hot cells against a cold field is traffic that should have
 * been routed together, and the remedy is affinity. The totals are identical in both cases, which
 * is exactly why a total cannot pick the remedy.
 *
 * **A thin cell is marked, not shaded.** Intensity carries magnitude, so it cannot also carry
 * confidence: a low-coverage cell rendered as a pale cell is indistinguishable from a genuinely
 * small one. Cells below the coverage floor take a corner mark instead, and the reader is told
 * what the mark is rather than left to infer it from the colour.
 */

/** Same floor the state chips use, so one number does not mean two things on one page. */
const IMPAIRED_BELOW = 0.75;

const HOUR_MS = 3_600_000;

interface Cell {
  readonly hours: number;
  readonly coverage: number;
}

export function PlacementMatrix({
  placement,
  workload,
}: {
  placement: PlacementData;
  /**
   * One workload, or absent for the whole fleet. Summing workloads into one cell is valid
   * arithmetic here and only here: the wire's `window_total` already states that `rows` and
   * `within_engine` disjointly partition the duplicated mass, so a token-hour sits under
   * exactly one workload and a fleet cell adds nothing twice. The v3 ruling draws the matrix
   * fleet-wide, independent of the copies panel's cut.
   */
  workload?: string;
}): ReactNode {
  const rows =
    workload === undefined ? placement.rows : placement.rows.filter((r) => r.workload === workload);

  // Days sum, per the response's own `day_rows_sum_to_window`. A cell is the pair over the
  // window, not the pair on the newest day, which would be a different quantity under the
  // same label.
  const cells = new Map<string, Cell>();
  const engines = new Set<string>();
  let holderPairs = 0;
  for (const r of rows) {
    engines.add(r.engine_a);
    engines.add(r.engine_b);
    holderPairs += 1;
    const key = `${r.engine_a}|${r.engine_b}`;
    const prev = cells.get(key);
    cells.set(key, {
      hours: (prev?.hours ?? 0) + r.token_ms.value / HOUR_MS,
      // Min rather than an average, per the ruled rule. Under an instance-grain basis these are
      // all equal so it is a no-op; it is written as the rule anyway so a finer basis degrades
      // to the weakest claim instead of silently averaging.
      coverage: Math.min(prev?.coverage ?? 1, r.token_ms.coverage),
    });
  }

  const axis = [...engines].sort();
  const peak = Math.max(...[...cells.values()].map((c) => c.hours), 0);
  if (axis.length === 0) return null;

  const at = (a: string, b: string): Cell | undefined =>
    cells.get(a < b ? `${a}|${b}` : `${b}|${a}`);

  return (
    <div className={styles['wrap']}>
      <div className="table-scroll">
        <table className={styles['grid']}>
          <thead>
            <tr>
              <th className={styles['corner']} />
              {axis.map((e) => (
                <th key={e} className={styles['head']} scope="col">
                  {e.replace('i-', '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {axis.map((a) => (
              <tr key={a}>
                <th className={styles['rowhead']} scope="row">
                  {a}
                </th>
                {axis.map((b) => {
                  const c = a === b ? undefined : at(a, b);
                  const thin = c !== undefined && c.coverage < IMPAIRED_BELOW;
                  return (
                    <td key={b} className={styles['cell']}>
                      {a === b ? (
                        <span className={styles['self']} aria-hidden="true" />
                      ) : (
                        <span
                          className={styles['tile']}
                          data-thin={thin ? 'true' : undefined}
                          style={{
                            // Zero is a measured zero here, not an absence: the derivation
                            // covered the day and found no overlap on this pair.
                            opacity: peak > 0 && c ? 0.1 + (c.hours / peak) * 0.9 : 0.06,
                          }}
                          title={
                            c
                              ? `${a} and ${b}: ${integer(Math.round(c.hours))} token-hours, ${percent(c.coverage, 0)} pair-observed`
                              : `${a} and ${b}: no overlap measured`
                          }
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles['grain']}>
        engine pairs, summed over {integer(holderPairs)} rank pairs
      </p>

      <p className={styles['key']}>
        <span className={styles['keyItem']}>
          <i className={styles['tile']} style={{ opacity: 1 }} />
          {integer(Math.round(peak))} token-hours
        </span>
        <span className={styles['keyItem']}>
          <i className={styles['tile']} style={{ opacity: 0.12 }} />
          none measured
        </span>
        <span className={styles['keyItem']}>
          <i className={styles['tile']} data-thin="true" style={{ opacity: 0.6 }} />
          under {percent(IMPAIRED_BELOW, 0)} pair-observed
        </span>
      </p>
    </div>
  );
}
