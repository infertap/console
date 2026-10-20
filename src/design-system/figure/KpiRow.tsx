// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import styles from './KpiRow.module.css';

/**
 * The gauge row: KPI tiles, numbers first.
 *
 * Numbers-only glass: the tiles carry the story, words survive as labels and
 * hover definitions. A tile's `tip` is where a figure's base rate or its plain-words caveat
 * rides, because a percent without its base is half a claim and the base does not earn glass.
 */

/** One tile: a value, its label, an optional width and hover tip. */
export interface Kpi {
  readonly value: string;
  readonly label: string;
  /** The lead tile: full-width value, first in the row. */
  readonly wide?: boolean;
  readonly tip?: string;
}

/** A row of KPI tiles, numbers first, words as labels and hover definitions. */
export function KpiRow({ kpis }: { kpis: readonly Kpi[] }): ReactNode {
  return (
    <div className={styles['row']}>
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className={kpi.wide ? `${styles['kpi']} ${styles['wide']}` : styles['kpi']}
          {...(kpi.tip ? { title: kpi.tip } : {})}
        >
          <div className={`${styles['value']} tabular`}>{kpi.value}</div>
          <div className={styles['label']}>{kpi.label}</div>
        </div>
      ))}
    </div>
  );
}
