// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { Link } from '../navigation/router';
import styles from './Drill.module.css';

/**
 * A drill page.
 *
 * **Every level-1 page is URL addressable with a breadcrumb back to the section that owns it.**
 * A page reached by clicking must be reachable by pasting, or the drill grammar produces states
 * a reader cannot share, and the whole point of descending is to be able to show somebody what
 * you found.
 *
 * Level 2 is evidence and is terminal: it says so, because a reader who has descended three
 * times should be told they have arrived rather than left hunting for a fourth.
 */
export function Drill({
  title,
  crumbs,
  stamp,
  terminal,
  children,
}: {
  title: string;
  crumbs: readonly { readonly to: string; readonly label: string }[];
  stamp?: ReactNode;
  terminal?: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <main className={styles['page']}>
      <p className={styles['crumbs']}>
        {crumbs.map((crumb, i) => (
          <span key={crumb.to}>
            <Link to={crumb.to}>{crumb.label}</Link>
            {i < crumbs.length - 1 && <span className={styles['sep']}> / </span>}
          </span>
        ))}
      </p>
      <h1 className={styles['title']}>
        {title}
        {terminal && <span className={styles['terminal']}>terminal</span>}
      </h1>
      {stamp && <p className={styles['stamp']}>{stamp}</p>}
      {children}
    </main>
  );
}
