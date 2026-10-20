// SPDX-License-Identifier: AGPL-3.0-only
import { LiveDataSource } from './live/source';
import type { DataSource } from './source';

export type { DataSource, StreamEvent, StreamListener, Unsubscribe } from './source';
export { LiveDataSource } from './live/source';

/**
 * The data seam, as the product ships it: one implementation, the live one.
 *
 * **The fixture is deliberately not reachable from here.** It used to be — this function read
 * `config.source` and returned a `FixtureDataSource` when the flag was anything but `live`, and
 * because `VITE_SOURCE` is unset in a plain `npm run build`, v1.0.0 shipped a console that drew
 * synthetic figures on a customer's box and never called the API.
 *
 * The choice now lives in `src/app/main.tsx` behind `import.meta.env.DEV`, which is the layer
 * boundary's own rule (`app` is the one place that picks an implementation) and which lets the
 * bundler drop the corpus entirely from a production build.
 */
export function createDataSource(): DataSource {
  return new LiveDataSource();
}
