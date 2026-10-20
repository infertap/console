// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { WindowDesc } from '../../domain/windows';
import styles from './RangeRow.module.css';

/**
 * The custom range row: date and time in, the SERVED grain stamped beside them.
 *
 * The server chooses the grain for a custom range and the response states it; this row
 * renders that statement and never derives one of its own. Each panel that offers a range
 * holds its own from/to state, because a control changes only its own panel.
 */
export function RangeRow({
  from,
  to,
  min,
  max,
  onFrom,
  onTo,
  desc,
}: {
  /** `YYYY-MM-DDTHH:MM`, the value vocabulary of datetime-local. */
  from: string;
  to: string;
  min: string;
  max: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  /** The derived window, whose grain and derivation the stamp states. Absent where the read's
   * own grain vocabulary answers instead, as on the paged tables. */
  desc?: WindowDesc;
}): ReactNode {
  return (
    <div className={styles['row']}>
      <span className={styles['label']}>range</span>
      {(
        [
          ['from', from, onFrom],
          ['to', to, onTo],
        ] as const
      ).map(([name, value, set]) => (
        <input
          key={name}
          className={styles['input']}
          type="datetime-local"
          value={value}
          min={min}
          max={max}
          step={300}
          aria-label={name}
          onChange={(e) => {
            if (e.target.value) set(e.target.value);
          }}
        />
      ))}
      {desc && (
        <span className={styles['stamp']}>
          grain <b>{desc.grainLabel}</b>
          {desc.derived ? ` · ${desc.derived}` : ''}
        </span>
      )}
    </div>
  );
}
