// SPDX-License-Identifier: AGPL-3.0-only
import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation } from '../design-system/navigation/router';
import { matchRoute, type Match } from './routes';

/**
 * Composition: the address, matched against the table, rendered.
 *
 * The navigation primitives live in the design system because every feature links. What lives
 * here is the part only the composition root may know, which is what the whole route table is.
 */

export function useMatch(): Match | null {
  const { pathname } = useLocation();
  return useMemo(() => matchRoute(pathname), [pathname]);
}

export function Outlet({ fallback }: { fallback: ReactNode }): ReactNode {
  const match = useMatch();
  const { pathname } = useLocation();

  useEffect(() => {
    // A new address is a new page, and a page starts at its top. A hash target is the exception,
    // because a section anchor is the reader asking for a position.
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [pathname]);

  if (!match) return fallback;
  const Component = match.route.component;
  return (
    // No spinner. The perf budget is a P95 panel under 150 ms, and a spinner that flashes for
    // 80 ms is worse than nothing appearing for 80 ms.
    <Suspense fallback={null}>
      <Component params={match.params} />
    </Suspense>
  );
}
