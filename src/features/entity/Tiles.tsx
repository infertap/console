// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import styles from './Entity.module.css';

/**
 * The stat row: figures that stand alone. Every headline is a ratio or a multiplier an
 * operator can weigh without a sentence under it; absolute masses live in the hover. This is
 * words-on-glass held, not broken: the law forbids a naked number, and each tile carries its
 * register in the unit line, its qualifier in the sub line, and its evidence in the hover.
 */

export interface Tile {
  readonly value: string;
  /** What the value is OF: the denominator's name, e.g. "of cache work recomputed". */
  readonly unit: string;
  /** The judgment line beneath: a median, a norm ("balanced is 1×"), a caveat. */
  readonly sub?: string;
  /** The window's shape, 0..1-normalised by the caller. Empty draws none. */
  readonly spark?: readonly number[];
  /** The absolutes and the basis, behind the hover. */
  readonly tip?: string;
}

const SW = 120;
const SH = 26;

function Spark({ values }: { values: readonly number[] }): ReactNode {
  const max = Math.max(...values, 1e-9);
  if (values.length < 2) return null;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * SW},${SH - 2 - (v / max) * (SH - 4)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${SW} ${SH}`} className={styles['spark']} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--seq-4)" strokeWidth="1.5" />
    </svg>
  );
}

export function StatRow({ tiles }: { tiles: readonly Tile[] }): ReactNode {
  return (
    <div className={styles['statRow']}>
      {tiles.map((t) => (
        <div key={t.unit} className={styles['tile']} {...(t.tip === undefined ? {} : { title: t.tip })}>
          <span className={styles['tileValue']}>{t.value}</span>
          <span className={styles['tileUnit']}>{t.unit}</span>
          {t.spark !== undefined && <Spark values={t.spark} />}
          {t.sub !== undefined && <span className={styles['tileSub']}>{t.sub}</span>}
        </div>
      ))}
    </div>
  );
}
