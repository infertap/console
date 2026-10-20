// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type ReactNode } from 'react';
import { compact, integer, multiplier } from '../../design-system/format/numbers';
import { Link } from '../../design-system/navigation/router';
import styles from './Entity.module.css';

/**
 * Members drawn as a distribution, not a ranked table.
 *
 * "One offender or all of them" is a shape question, and a sorted table shows the top without
 * showing whether the top is ten percent or ten times above the median. The columns are the
 * shape; the list beneath is the navigation; both come from the one query navigation already
 * needed, so the members list and the diagnosis are one object.
 *
 * Hover joins the two halves: a legend entry lights its column, a column lights its legend
 * entry, and either floats the member's annotation — name, value, and the absolutes behind
 * it — so the shape and the names never have to be cross-referenced by eye.
 */

/** One member of the distribution: its key, its label, its value and the evidence behind it. */
export interface DistMember {
  readonly key: string;
  readonly label: string;
  /** The value the columns and the sentence rank by: a mass or a rate, the caller's call. */
  readonly total: number;
  /** Extra hover evidence for this member: the absolutes behind a rate. */
  readonly detail?: string;
}

/** A cut's members drawn as a distribution, the subject marked, each member a link. */
export function MemberDistribution({
  members,
  noun,
  subjectKey,
  linkTo,
  listLimit = 8,
  fmt = (v) => `≥ ${compact(v)}`,
}: {
  /** Any order in; drawn worst first. */
  members: readonly DistMember[];
  /** The member noun for the stats sentence: "instance", "workload", "rank". */
  noun: string;
  /** The page's own member, inked apart from its peers. */
  subjectKey?: string | undefined;
  /** Where a member's column and list entry go; null renders it unlinked. */
  linkTo: (key: string) => string | null;
  listLimit?: number;
  /** How the ranked value renders: mass by default, a percentage where rates rank. */
  fmt?: (v: number) => string;
}): ReactNode {
  const [hover, setHover] = useState<string | null>(null);
  const sorted = [...members].sort((a, b) => b.total - a.total);
  if (sorted.length === 0) {
    return (
      <p className={styles['awaiting']}>
        No classified mass in this slice over the window. Not a zero over something: there is
        nothing here to distribute.
      </p>
    );
  }
  const top = sorted[0]?.total ?? 0;
  const median = sorted[Math.floor((sorted.length - 1) / 2)]?.total ?? 0;
  const subject = subjectKey === undefined ? null : sorted.find((m) => m.key === subjectKey);

  const hoverIndex = hover === null ? -1 : sorted.findIndex((m) => m.key === hover);
  const hovered = hoverIndex >= 0 ? sorted[hoverIndex] : undefined;
  const hoverFrac = hoverIndex >= 0 ? (hoverIndex + 0.5) / sorted.length : 0;

  return (
    <>
      <div className={styles['chartWrap']}>
        <div
          className={styles['dist']}
          data-hovering={hover !== null}
          role="img"
          aria-label={`${sorted.length} ${noun}s by repeat compute, worst first`}
          onMouseLeave={() => setHover(null)}
        >
          {sorted.map((m) => {
            const href = linkTo(m.key);
            const height = `${Math.max(3, top > 0 ? (m.total / top) * 100 : 0)}%`;
            const shared = {
              style: { height },
              'data-subject': m.key === subjectKey,
              'data-hot': m.key === hover,
              onMouseEnter: () => setHover(m.key),
            };
            return href === null ? (
              <span key={m.key} {...shared} />
            ) : (
              <Link key={m.key} to={href} {...shared}>
                {''}
              </Link>
            );
          })}
        </div>
        {hovered !== undefined && (
          <div
            className={styles['tip']}
            data-flip={hoverFrac > 0.55}
            style={
              hoverFrac > 0.55
                ? { right: `${(1 - hoverFrac) * 100}%` }
                : { left: `${hoverFrac * 100}%` }
            }
          >
            <div className={styles['tipHead']}>{hovered.label}</div>
            <div className={styles['tipRow']}>
              <span className={styles['tipLabel']}>{noun}</span>
              <span className={styles['tipValue']}>{fmt(hovered.total)}</span>
            </div>
            {hovered.detail !== undefined && (
              <div className={styles['tipRow']} data-muted="true">
                <span className={styles['tipLabel']}>{hovered.detail}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <p className={styles['stamp']}>
        {integer(sorted.length)} {noun}
        {sorted.length === 1 ? '' : 's'} · worst <b>{fmt(top)}</b> · median <b>{fmt(median)}</b>
        {median > 0 && sorted.length > 1 && (
          <>
            {' '}
            · the worst carries <b>{multiplier(top / median)}</b> the median
          </>
        )}
        {subject && subject !== sorted[0] && median > 0 && (
          <>
            {' '}
            · this one carries <b>{multiplier(subject.total / median)}</b> the median
          </>
        )}
      </p>
      <p className={`${styles['stamp']} ${styles['distList']}`} onMouseLeave={() => setHover(null)}>
        {sorted.slice(0, listLimit).map((m, i) => {
          const href = linkTo(m.key);
          return (
            <span key={m.key} data-hot={m.key === hover} onMouseEnter={() => setHover(m.key)}>
              {i > 0 && ' · '}
              {href === null ? m.label : <Link to={href}>{m.label}</Link>}{' '}
              {fmt(m.total)}
            </span>
          );
        })}
        {sorted.length > listLimit && <> · and {integer(sorted.length - listLimit)} more in the columns above</>}
      </p>
    </>
  );
}
