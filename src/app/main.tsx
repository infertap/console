// SPDX-License-Identifier: AGPL-3.0-only
import { StrictMode } from 'react';
import '../design-system/tokens.css';
import { createRoot } from 'react-dom/client';
import { config, isSynthetic } from '../config';
import { createDataSource, type DataSource } from '../data';
import { DataProvider } from '../data/react';
import { createFixtureSource } from '../dev/rig';
import { App } from './App';

/**
 * Bootstrap. The composition root, and the only place an implementation is chosen.
 *
 * **`import.meta.env.DEV` is the outer condition, and it is load-bearing rather than defensive.**
 * Vite replaces it with a literal `false` when building, so the whole branch is dead code, the
 * `../dev/rig` import goes unreferenced, and Rollup drops the fixture corpus out of the artifact.
 * A production bundle does not contain the mock, so no flag, no environment variable and no
 * mistake can display one. `scripts/audit-bundle.mjs` checks that against the built bytes.
 */
function source(): DataSource {
  if (import.meta.env.DEV && isSynthetic(config)) return createFixtureSource(config.fixtureAge);
  return createDataSource();
}

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <DataProvider source={source()}>
      <App />
    </DataProvider>
  </StrictMode>,
);
