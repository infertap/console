// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import styles from './AnchorLine.module.css';

/**
 * The anchor line: the whole scalar story in one row.
 *
 * The aggregate is what it structurally is, denominator and warrant:
 * one fraction with its denominator, then the labelled facts that qualify it. The lens below
 * such a line is the meter face; this is not a second verdict and carries no state word.
 */

/** One labelled fact beside the anchor's fraction. */
export interface AnchorItem {
  readonly label: string;
  readonly value: string;
  readonly tip?: string;
}

/** The anchor line: the headline fraction with its denominator, then the facts that qualify it. */
export function AnchorLine({
  headline,
  unit,
  items,
  tip,
}: {
  /** The one big figure. */
  headline: string;
  /** Its denominator or unit, beside it. */
  unit: string;
  items: readonly AnchorItem[];
  tip?: string;
}): ReactNode {
  return (
    <div className={styles['line']}>
      <span className={styles['item']} {...(tip ? { title: tip } : {})}>
        <span className={`${styles['headline']} tabular`}>{headline}</span>
        <span className={styles['unit']}>{unit}</span>
      </span>
      {items.map((item) => (
        <span className={styles['item']} key={item.label} {...(item.tip ? { title: item.tip } : {})}>
          <span className={styles['unit']}>{item.label}</span>
          <span className={styles['value']}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}
