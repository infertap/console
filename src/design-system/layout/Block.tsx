// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { InfoHover } from '../info/InfoHover';
import type { DefinitionKey } from '../info/definitions';
import styles from './Block.module.css';

/**
 * The section structure: **the heading lives on the canvas; beneath it, one or more
 * independent plates.** A section is a group, not a box, so independent content gets an
 * independent block, and a control lives in the head of the one block it changes.
 */

export function Section({
  name,
  id,
  definition,
  hoverTitle,
  children,
}: {
  name: string;
  id: string;
  definition?: DefinitionKey;
  /** The hover's label, where it differs from the section name. */
  hoverTitle?: string;
  children: ReactNode;
}): ReactNode {
  const headingId = `${id}-name`;
  return (
    <section className={styles['section']} id={id} aria-labelledby={headingId}>
      <div className={styles['sectionHead']}>
        <h2 className={styles['sectionName']} id={headingId}>
          {name}
        </h2>
        {definition && <InfoHover of={definition} label={hoverTitle ?? name} />}
      </div>
      {children}
    </section>
  );
}

/**
 * One plate. The head states what this card shows, at what scope; the head puts
 * the ROLE in plain words on glass and the method name in the hover title, so `head` reads like
 * "how soon it comes back · fleet · 14 d" and `extras` carries the info hover.
 */
export function Block({
  head,
  extras,
  children,
}: {
  head: ReactNode;
  extras?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={styles['block']}>
      <div className={styles['head']}>
        <h4 className={styles['headText']}>{head}</h4>
        {extras}
      </div>
      {children}
    </div>
  );
}

/** A titled region inside a block, separated by a hairline: the chart, the attribution, the
 * breakdown. Regions of one panel share the panel's controls, which is what containment means. */
export function SubBlock({
  head,
  extras,
  children,
}: {
  head?: ReactNode;
  extras?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={styles['sub']}>
      {head !== undefined && (
        <div className={styles['head']}>
          <h4 className={styles['headText']}>{head}</h4>
          {extras}
        </div>
      )}
      {children}
    </div>
  );
}

/** Two independent blocks side by side, stacking on narrow screens. */
export function BlockRow({ children }: { children: ReactNode }): ReactNode {
  return <div className={styles['row']}>{children}</div>;
}
