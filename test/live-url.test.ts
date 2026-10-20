// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The live seam's URL builder follows the vendored contract's parameter styles. `dims` is an
 * array parameter with `explode: false`, so it travels as one comma-joined value; repeated keys
 * are what the analyzer refuses as a duplicate field, and that refusal was the first thing the
 * console saw of a real daemon (rig, 2026-09-04).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { url } from '../src/data/live/http';

const here = dirname(fileURLToPath(import.meta.url));

describe('the live URL builder', () => {
  it('joins array parameters with commas, as the contract pins for dims', () => {
    const built = url('/v1/figures', {}, { window: '14d', dims: ['workload', 'class'] });
    expect(built).toContain('dims=workload%2Cclass');
    expect(built).not.toContain('dims=workload&dims=class');
  });

  it('is the style the vendored contract declares for dims', () => {
    const spec = JSON.parse(readFileSync(resolve(here, '../contract/openapi.json'), 'utf8'));
    const params: Array<{ name: string; explode?: boolean; style?: string }> =
      spec.paths['/v1/figures'].get.parameters;
    const dims = params.find((p) => p.name === 'dims');
    expect(dims?.style).toBe('form');
    expect(dims?.explode).toBe(false);
  });
});
