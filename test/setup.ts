// SPDX-License-Identifier: AGPL-3.0-only
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Unmount between tests.
 *
 * Testing Library registers this itself when vitest runs with globals, and this repo does not:
 * every test imports what it uses, so a reader can tell where `expect` comes from. The cost is
 * that cleanup has to be wired by hand, and the symptom of forgetting is "found multiple
 * elements", which reads like a component bug and is not one.
 */
afterEach(cleanup);

/**
 * jsdom implements no `matchMedia`.
 *
 * The components guard for its absence, because a chrome element that takes the page down over a
 * missing media-query API is a worse failure than one that assumes motion is allowed. This shim
 * exists so the reduced-motion PATH is exercised rather than only the guard: without it, every
 * test would run the same branch.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
