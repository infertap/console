// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from '../navigation/router';
import styles from './Chrome.module.css';

/**
 * The rail holds **destinations, never sections**.
 *
 * Drill pages live under their parents and never appear here: a rail that listed every
 * addressable URL would stop being navigation and start being a sitemap. The active item is
 * marked with an accent indicator rather than a second dark surface.
 *
 * **There is no Reports destination.** The API has no `/v1/reports` route, and a rail entry
 * pointing at a surface the API has no answer for is a promise this product cannot keep.
 */

export interface Destination {
  readonly to: string;
  readonly label: string;
  readonly glyph: string;
  /** Drill pages that should light this destination while they are open. */
  readonly owns?: readonly string[];
}

export const DESTINATIONS: readonly { group: string | null; items: readonly Destination[] }[] = [
  {
    group: null,
    items: [
      {
        to: '/',
        label: 'Dashboard',
        glyph: '≡',
        owns: ['/day', '/marker', '/block', '/evidence'],
      },
      // The fleet browse: the facet hierarchy's front door (fleet → workload → instance →
      // rank). Rank is a section of the instance page, not a destination, so the old Ranks
      // entry retired into a drill this destination owns.
      {
        to: '/fleet',
        label: 'Fleet',
        glyph: '☷',
        owns: ['/workload/', '/instance/', '/holders', '/holder/', '/identities'],
      },
      { to: '/health', label: 'Health', glyph: '◑' },
    ],
  },
  // The rail holds only current destinations: retired surfaces leave it rather than
  // linking backward. `/about` stays addressable; a rail entry is a promise of a daily
  // destination and about is not one.
];

function isCurrent(pathname: string, item: Destination): boolean {
  if (item.to === '/') return pathname === '/' || (item.owns ?? []).some((p) => pathname.startsWith(p));
  return pathname === item.to || (item.owns ?? []).some((p) => pathname.startsWith(p));
}

export function Rail(): ReactNode {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav className={styles['rail']} aria-label="Destinations" data-collapsed={collapsed}>
      <button
        type="button"
        className={styles['toggle']}
        aria-label={collapsed ? 'Expand rail' : 'Collapse rail'}
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? '››' : '‹‹'}
      </button>
      {DESTINATIONS.map((group, i) => (
        <div className={styles['group']} key={group.group ?? `group-${i}`}>
          {group.group && <p className={styles['groupLabel']}>{group.group}</p>}
          {group.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={styles['item']}
              title={item.label}
              {...(isCurrent(pathname, item) ? { 'aria-current': 'page' as const } : {})}
            >
              <span className={styles['glyph']} aria-hidden="true">
                {item.glyph}
              </span>
              <span className={styles['text']}>{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
