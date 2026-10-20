// SPDX-License-Identifier: AGPL-3.0-only
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';

/**
 * Navigation primitives. Hand-rolled, and about a hundred lines because that is all this needs.
 *
 * **These live in the design system, not in the app.** Every feature renders links, because
 * hover teaches and click descends, so a feature that could not link would be a feature that
 * could not obey the drill grammar. The route TABLE stays in `app/` where composition belongs;
 * what is here is the interaction vocabulary.
 *
 * **URL is state everywhere** is a law here rather than a convention, which keeps what a router
 * owes this product small and specific: parse the address, keep it in sync with what is on
 * screen, and never invent a state the address cannot express. A dependency would bring routing
 * concepts this product has ruled out and would be the largest thing in the bundle after React.
 *
 * Deep links work because the daemon's console mount falls back to `index.html` for unmatched
 * paths, so `/holder/i-004/0/1` reaches the table rather than a 404.
 */

export interface Location {
  readonly pathname: string;
  readonly search: string;
}

function read(): Location {
  return { pathname: window.location.pathname, search: window.location.search };
}

const LISTENERS = new Set<() => void>();

/**
 * Go somewhere.
 *
 * `replace` is for state that should not be a back-button stop: a filter being scrubbed, a
 * section the scroll passed. A drill is always a push, because descending is a step.
 */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (options.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  for (const listener of LISTENERS) listener();
}

export function useLocation(): Location {
  const [location, setLocation] = useState<Location>(read);

  useEffect(() => {
    const update = () => setLocation(read());
    LISTENERS.add(update);
    window.addEventListener('popstate', update);
    return () => {
      LISTENERS.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);

  return location;
}

/**
 * Read and write one query parameter.
 *
 * Query state is addressable state: a window, a sort, a filter. Anything a reader might send to
 * a colleague lives here rather than inside a component, which is the practical content of the
 * addressable-views law.
 */
export function useQueryParam(
  key: string,
): [string | null, (value: string | null, options?: { replace?: boolean }) => void] {
  const { search, pathname } = useLocation();
  const value = useMemo(() => new URLSearchParams(search).get(key), [search, key]);

  const set = useCallback(
    (next: string | null, options: { replace?: boolean } = {}) => {
      const params = new URLSearchParams(window.location.search);
      if (next === null) params.delete(key);
      else params.set(key, next);
      const qs = params.toString();
      navigate(`${pathname}${qs ? `?${qs}` : ''}`, options);
    },
    [key, pathname],
  );

  return [value, set];
}

/**
 * Read several query parameters and write any subset of them in ONE navigation.
 *
 * A control that owns more than one parameter (a window stop and its custom bounds) must move
 * them together: three single-key writes are three history entries and, between them, two
 * addresses that describe a state the control never showed. The batch setter is what lets a
 * stop change and its bounds land as one address.
 */
export function useQueryParams(
  keys: readonly string[],
): [
  Readonly<Record<string, string | null>>,
  (changes: Readonly<Record<string, string | null>>, options?: { replace?: boolean }) => void,
] {
  const { search, pathname } = useLocation();
  const values = useMemo(() => {
    const params = new URLSearchParams(search);
    return Object.fromEntries(keys.map((key) => [key, params.get(key)]));
  }, [search, keys]);

  const set = useCallback(
    (changes: Readonly<Record<string, string | null>>, options: { replace?: boolean } = {}) => {
      const params = new URLSearchParams(window.location.search);
      for (const [key, next] of Object.entries(changes)) {
        if (next === null) params.delete(key);
        else params.set(key, next);
      }
      const qs = params.toString();
      navigate(`${pathname}${qs ? `?${qs}` : ''}`, options);
    },
    [pathname],
  );

  return [values, set];
}

/**
 * A link that descends.
 *
 * Anything clickable says so before it is clicked. Modified clicks fall through to the browser
 * so open-in-new-tab keeps working, which is part of what addressable means.
 */
export function Link({
  to,
  children,
  ...rest
}: { to: string; children: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
>): ReactNode {
  return (
    <a
      href={to}
      onClick={(event) => {
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/**
 * What every route component receives.
 *
 * Declared here so the router and the features agree on it without a feature having to import
 * the composition root. Params are strings because a URL segment is a string: a route that wants
 * a number parses one and says what it does with a segment that is not.
 */
export interface RouteProps {
  readonly params: Readonly<Record<string, string>>;
}
