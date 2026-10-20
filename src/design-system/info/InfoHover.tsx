// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { DEFINITIONS, type DefinitionKey } from './definitions';
import styles from './InfoHover.module.css';

/**
 * The definition affordance. **Hover teaches, click descends**, and this is the hover half.
 *
 * It gives what a thing measures, how it is computed, its basis and its bound, and it never
 * reads the shape of the data. That division is the whole drill grammar: a reader who wants to
 * know what a number MEANS hovers, and a reader who wants to know what it is MADE OF clicks, and
 * neither gesture ever produces an interpretation.
 */
export function InfoHover({ of, label }: { of: DefinitionKey; label: string }): ReactNode {
  const definition = DEFINITIONS[of];
  return (
    <span className={styles['info']}>
      <button className={styles['button']} type="button" aria-label={`Definition: ${label}`}>
        i
      </button>
      <div className={styles['card']} role="tooltip">
        <dl>
          <dt>measures</dt>
          <dd>{definition.measures}</dd>
          <dt>computed</dt>
          <dd>{definition.computed}</dd>
          <dt>basis</dt>
          <dd>{definition.basis}</dd>
          <dt>bound</dt>
          <dd>{definition.bound}</dd>
        </dl>
      </div>
    </span>
  );
}
