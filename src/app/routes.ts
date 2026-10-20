// SPDX-License-Identifier: AGPL-3.0-only
import type { ComponentType, LazyExoticComponent } from 'react';
import { lazy } from 'react';
import type { RouteProps } from '../design-system/navigation/router';

/**
 * The route table. **URL is state, everywhere.**
 *
 * Three levels. Level 0 is the document, one scrolling page
 * that is the argument in reading order. Level 1 is drill, each URL addressable with a
 * breadcrumb back to the section that owns it. Level 2 is evidence, terminal, reached from
 * level 1 and never linked from the rail.
 *
 * Every entry is a dynamic `import()`, so each route is its own chunk. The split points are the
 * feature boundaries the lint already enforces, which means the bundle graph and the
 * architecture cannot drift apart.
 *
 * **There is no `/reports`.** `/v1/reports` was sidelined by ruling on 2026-08-04: the route is
 * not reserved and not refusing, it does not exist. A rail entry pointing at a surface the API
 * has no answer for is a promise this product cannot keep.
 */

export interface RouteDef {
  /** A pattern with `:name` segments. Matched left to right, first match wins. */
  readonly path: string;
  readonly component: LazyExoticComponent<ComponentType<RouteProps>>;
  /** Where this sits in the three levels. Drives the breadcrumb and the rail's active item. */
  readonly level: 0 | 1 | 2;
  /** The rail destination that owns it, for drill pages that never appear in the rail. */
  readonly parent?: string;
  readonly title: string;
}

export const ROUTES: readonly RouteDef[] = [
  {
    path: '/',
    level: 0,
    title: 'Document',
    component: lazy(() => import('../features/dashboard/DocumentRoute')),
  },
  {
    // The facet browse: workloads on top, the instance index beneath, both clickable. The
    // rail's door to the entity pages.
    path: '/fleet',
    level: 1,
    title: 'Fleet',
    component: lazy(() => import('../features/entity/FleetRoute')),
  },
  {
    // Retired page, kept answering: the Ranks table's questions moved to the Fleet index and
    // the instance pages, and the shipped URL redirects rather than dead-ending.
    path: '/holders',
    level: 1,
    parent: '/fleet',
    title: 'Fleet',
    component: lazy(() =>
      import('../features/entity/redirects').then((m) => ({ default: m.HoldersRedirect })),
    ),
  },
  {
    // The rank drill's old spelling, redirecting to its home under the instance.
    path: '/holder/:instance/:dp_rank/:group_idx',
    level: 1,
    parent: '/fleet',
    title: 'Rank',
    component: lazy(() =>
      import('../features/entity/redirects').then((m) => ({ default: m.HolderRedirect })),
    ),
  },
  {
    // The identities drill: was it one block or many, computed over the whole slice and
    // window, with the raw records one level beneath.
    path: '/identities',
    level: 1,
    parent: '/fleet',
    title: 'Identities',
    component: lazy(() => import('../features/entity/IdentitiesRoute')),
  },
  {
    // One rank, nested under its instance: the one containment the model guarantees, since a
    // rank's identity IS (instance, dp_rank, group).
    path: '/instance/:id/rank/:dp_rank/:group_idx',
    level: 1,
    parent: '/fleet',
    title: 'Rank',
    component: lazy(() => import('../features/entity/RankRoute')),
  },
  {
    // The middle facet: a declared, time-varying label, never a container. Collapses out of
    // navigation where the fleet carries one workload; the route stays for deep links.
    path: '/workload/:id',
    level: 1,
    parent: '/fleet',
    title: 'Workload',
    component: lazy(() => import('../features/entity/WorkloadRoute')),
  },
  {
    // The load-bearing facet: one slot, its figures scoped server-side, its ranks a section
    // rather than a fourth level. `/holder/…` stays alive beneath it for deep links.
    path: '/instance/:id',
    level: 1,
    parent: '/fleet',
    title: 'Instance',
    component: lazy(() => import('../features/entity/InstanceRoute')),
  },
  {
    path: '/health',
    level: 1,
    title: 'Health',
    component: lazy(() => import('../features/health/HealthRoute')),
  },
  {
    path: '/day/:date',
    level: 1,
    parent: '/',
    title: 'Day',
    component: lazy(() => import('../features/drill/DayRoute')),
  },
  {
    path: '/marker/:id',
    level: 1,
    parent: '/',
    title: 'Marker',
    component: lazy(() => import('../features/drill/MarkerRoute')),
  },
  {
    path: '/block/:id',
    level: 1,
    parent: '/',
    title: 'Block',
    component: lazy(() => import('../features/drill/BlockRoute')),
  },
  {
    path: '/evidence',
    level: 2,
    parent: '/',
    title: 'Records behind this',
    component: lazy(() => import('../features/drill/EvidenceRoute')),
  },
  {
    path: '/about',
    level: 1,
    title: 'About',
    component: lazy(() => import('../features/system/AboutRoute')),
  },
  {
    path: '/login',
    level: 1,
    title: 'Sign in',
    component: lazy(() => import('../features/auth/LoginRoute')),
  },
  {
    // Permanent. The design system's conformance corpus: every honest state, every refusal,
    // rendered on one page so a regression in the unexamined hatch is a visible diff.
    path: '/gallery',
    level: 1,
    title: 'Gallery',
    component: lazy(() => import('../features/gallery/GalleryRoute')),
  },
];

export interface Match {
  readonly route: RouteDef;
  readonly params: Readonly<Record<string, string>>;
}

/** First match wins, so static segments must be declared before their parameterised siblings. */
export function matchRoute(pathname: string): Match | null {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  for (const route of ROUTES) {
    const pattern = route.path.split('/').filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pattern.length; i++) {
      const seg = pattern[i] as string;
      const value = parts[i] as string;
      if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(value);
      else if (seg !== value) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}
