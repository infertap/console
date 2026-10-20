// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Air-gap posture, and every line here is one of its clauses.
 *
 * - `base: '/'` emits origin-relative asset URLs. Host-independent, so the daemon's console
 *   mount serves the same bundle at any address, and deep links under `/holder/:id` still
 *   resolve their assets. A relative base would break exactly those.
 * - `assetsInlineLimit: 0` keeps assets as files rather than data URIs, so the fonts stay
 *   cacheable and the bundle stays readable to an auditor.
 * - No CDN, no analytics, no telemetry, no update ping. There is no plugin here that fetches
 *   anything, and `test/no-external-loads.test.ts` asserts the built output agrees.
 */
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    target: 'es2023',
    assetsInlineLimit: 0,
    /**
     * **`hidden`, not `true` (S8, 2026-08-15).** The maps are still produced, so a stack trace
     * from a customer is still readable by us — they simply carry no `sourceMappingURL` comment
     * and travel as a console release artifact instead of inside the product.
     *
     * The measurement that decided it: the dist was 1.9 MB, of which **1.3 MB was `.map`**. The
     * analyzer embeds this bundle in its binary, so `true` shipped two thirds of the payload and a
     * readable copy of proprietary console source to every customer. The analyzer's embed also
     * excludes `*.map` independently — two guards, because this one is a single word somebody
     * could flip back while tracking down a bug.
     */
    sourcemap: 'hidden',
    // No manual chunking: route-level splitting comes from dynamic import() at the route table,
    // which is where the boundaries already are.
  },
  server: {
    // Dev only. The daemon needs `--api-dev-origin http://localhost:5173` to answer this,
    // and it prints a line at startup when it does (read-api.md §6.4).
    proxy: {
      '/v1': { target: 'http://127.0.0.1:8088', changeOrigin: false },
    },
  },
});
