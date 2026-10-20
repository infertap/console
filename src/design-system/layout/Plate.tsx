// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { InfoHover } from '../info/InfoHover';
import type { DefinitionKey } from '../info/definitions';
import styles from './Plate.module.css';

/**
 * One section of the document, as a plate on the canvas.
 *
 * The head carries the section's name, its definition and, where it deviates from the
 * document's canonical stamp, the deviation. **Conformity is silent**: a section that matches
 * the stamp declared under the title says nothing, so a section that does not is visible by
 * contrast rather than by volume. While the document fills, per-section stamps reappearing is
 * itself the progress indicator.
 *
 * Section names are parameter-free. A section is named for the question it answers, never for a
 * current parameter value, and the test applied forward is that every name should still be
 * correct in 2028.
 */
export function Plate({
  name,
  id,
  definition,
  chip,
  deviation,
  lead,
  footer,
  children,
}: {
  name: string;
  id?: string;
  definition?: DefinitionKey;
  chip?: ReactNode;
  /** Rendered only where this section's stamp differs from the document's. */
  deviation?: ReactNode;
  lead?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}): ReactNode {
  const headingId = id ? `${id}-name` : undefined;
  return (
    <section className={styles['plate']} {...(id ? { id } : {})} aria-labelledby={headingId}>
      <div className={styles['head']}>
        <div className={styles['title']}>
          <h2 className={styles['name']} {...(headingId ? { id: headingId } : {})}>
            {name}
          </h2>
          {definition && <InfoHover of={definition} label={name} />}
          {chip}
        </div>
        {deviation && <p className={styles['deviation']}>{deviation}</p>}
      </div>
      {lead && <p className={styles['lead']}>{lead}</p>}
      {children}
      {footer && <p className={styles['footer']}>{footer}</p>}
    </section>
  );
}
