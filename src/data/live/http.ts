// SPDX-License-Identifier: AGPL-3.0-only
import { config } from '../../config';
import type { ApiErrorBody, Stamped } from '../../domain/contract';
import { ApiError } from '../../domain/refusal';
import type { paths } from '../generated/api';

/**
 * The transport. The only file in this repo that calls `fetch`, enforced by lint.
 *
 * Deliberately hand-rolled over the generated types rather than pulled in as a client runtime.
 * The route table is checked at compile time because `Route` is `keyof paths`, which is the part
 * a generated client would actually have bought us, and the rest of what one provides is the
 * error handling this product has opinions about.
 */

/** Every path the contract declares. A typo is a type error, not a 404 at runtime. */
export type Route = keyof paths;

export type QueryValue = string | number | boolean | readonly string[] | undefined;

/**
 * Build a same-origin URL.
 *
 * `apiBase` is empty in the shipped posture: the daemon serves this bundle, so the console and
 * the API share an origin and no host is ever written down. Nothing here can produce an absolute
 * URL, which is what makes the air-gapped case work by construction rather than by discipline.
 */
export function url(
  route: Route,
  params: Readonly<Record<string, string | number>> = {},
  query: Readonly<Record<string, QueryValue>> = {},
): string {
  const path = route.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) throw new Error(`route ${route} needs a ${key}`);
    return encodeURIComponent(String(value));
  });
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    // Array parameters serialize as ONE comma-joined value — `dims=workload,class` — which is
    // what the vendored contract pins (`style: form, explode: false`) and what the analyzer
    // parses. Repeated keys were the first thing the live seam sent that the fixture never had
    // to: the analyzer refused `dims=workload&dims=class` as a duplicate field, and the console
    // rendered the refusal as an unreachable engine (rig, 2026-09-04).
    if (Array.isArray(value)) search.set(key, value.map(String).join(','));
    else search.set(key, String(value as string | number | boolean));
  }
  const qs = search.toString();
  return `${config.apiBase}${path}${qs ? `?${qs}` : ''}`;
}

async function readError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | undefined;
  try {
    const parsed = (await response.json()) as { error?: ApiErrorBody };
    body = parsed.error;
  } catch {
    body = undefined;
  }
  return new ApiError(response.status, body, `${response.status} from ${response.url}`);
}

/**
 * A stamped GET.
 *
 * Credentials ride the session cookie, which is `HttpOnly` and therefore unreadable from here by
 * design: this code cannot inspect the session, only discover it is gone when a 401 arrives.
 */
/**
 * The reads whose data the analysis produces. Before the first tick they answer 200 with an
 * empty body and a stamp whose `tick.classified_to_ms` is null. The console's t0 state is
 * derived from the stamp. The observed surfaces (stamp, roster, health, delivery, markers) stay
 * readable before a tick, which is why this is a list and not a rule over every route.
 */
const PASS_DERIVED: ReadonlySet<string> = new Set<Route>([
  '/v1/figures',
  '/v1/figures/bands',
  '/v1/holders',
  '/v1/coverage',
  '/v1/residual/placement',
  '/v1/residual/replication',
  '/v1/residual/whales',
  '/v1/instances/{instance}/duplication',
  '/v1/days/{day}',
  '/v1/evidence',
  '/v1/blocks',
  '/v1/blocks/{block_id}/holders',
  '/v1/holders/{instance}/{dp_rank}/{group_idx}/timeline',
]);

export async function getStamped<T>(
  route: Route,
  params?: Readonly<Record<string, string | number>>,
  query?: Readonly<Record<string, QueryValue>>,
): Promise<Stamped<T>> {
  const response = await fetch(url(route, params, query), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw await readError(response);
  const stamped = (await response.json()) as Stamped<T>;
  if (PASS_DERIVED.has(route) && stamped.stamp.tick.classified_to_ms == null) {
    throw ApiError.notYetPassed();
  }
  return stamped;
}

/** A stamped POST: the analyze kick and the annotation declaration both answer `{stamp, data}`
 * like every read, and the optional body rides as JSON. */
export async function postStamped<T>(route: Route, body?: unknown): Promise<Stamped<T>> {
  const response = await fetch(url(route), {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as Stamped<T>;
}

/** The auth realm's two verbs. Neither touches fleet data. */
export async function send(
  method: 'POST' | 'DELETE',
  route: Route,
  body?: unknown,
): Promise<void> {
  const response = await fetch(url(route), {
    method,
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) throw await readError(response);
}
