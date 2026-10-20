// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAUSES } from '../src/domain/refusal';

/**
 * Where this repo's transcriptions of the contract are checked against the contract.
 *
 * Generation covers the types. It does not cover the handful of places where a value had to be
 * written out on this side: the cause set as a runtime array, the route table the data layer
 * actually calls. Those drift silently, so they are checked loudly.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const spec = JSON.parse(readFileSync(resolve(root, 'contract/openapi.json'), 'utf8')) as Spec;

interface Operation {
  responses: Record<string, { 'x-causes'?: string[] }>;
}

interface Spec {
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<
      string,
      { enum?: string[]; required?: string[]; properties?: Record<string, unknown> }
    >;
  };
}

describe('the closed cause set', () => {
  it('matches the contract exactly, in both directions', () => {
    const fromSpec = spec.components.schemas['Cause']?.enum;
    expect(fromSpec).toBeDefined();
    // Sorted on both sides: order is not part of the contract, membership is. A cause the
    // analyzer adds fails here rather than falling through a `default:` into a shrug, and one it
    // removes fails here rather than leaving a designed state nothing can reach.
    expect([...CAUSES].sort()).toEqual([...(fromSpec ?? [])].sort());
  });
});

describe('the data layer calls every endpoint the contract publishes', () => {
  it('leaves no path unimplemented and invents none', () => {
    const source = readFileSync(resolve(root, 'src/data/live/source.ts'), 'utf8');
    const called = new Set(
      [...source.matchAll(/'(\/v1\/[^']*)'/g)].map((m) => m[1] as string),
    );
    const published = new Set(Object.keys(spec.paths));

    // The stream is reached through `events()`, which builds its URL in the same file.
    const missing = [...published].filter((p) => !called.has(p));
    const invented = [...called].filter((p) => !published.has(p));

    expect({ missing, invented }).toEqual({ missing: [], invented: [] });
  });
});

/**
 * A ratchet over the contract itself, with its exceptions written down.
 *
 * A schema whose `required` names a property it does not describe generates a type that cannot
 * satisfy the schema it came from: openapi-typescript reads `properties`, a validator reads
 * `required`, and the two disagree. This is how finding 10 was found, and the list below is the
 * exceptions as they stand at the current pin.
 *
 * **The list is exact, so it fails in both directions.** A new violation fails here and gets
 * reported. A violation the analyzer FIXES also fails here, which is the point: it is the signal
 * to delete the workaround in `domain/contract.ts` rather than leave it to outlive its reason.
 */
const KNOWN_UNDESCRIBED: Readonly<Record<string, readonly string[]>> = {
  // Empty, and it should stay that way. `Stamp` lived here until 2026-08-05, when finding 10
  // closed and this list emptying is what told us to delete the workaround it justified.
};

describe('every schema describes what it requires', () => {
  it('has exactly the known exceptions, no more and no fewer', () => {
    const found: Record<string, string[]> = {};
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      const described = new Set(Object.keys(schema.properties ?? {}));
      const undescribed = (schema.required ?? []).filter((key) => !described.has(key));
      if (undescribed.length > 0) found[name] = undescribed.sort();
    }
    const expected = Object.fromEntries(
      Object.entries(KNOWN_UNDESCRIBED).map(([k, v]) => [k, [...v].sort()]),
    );
    expect(found).toEqual(expected);
  });
});

describe('the envelope', () => {
  it('is a stamp and a data body on every JSON response, with no third key', () => {
    for (const [path, item] of Object.entries(spec.paths)) {
      const get = item['get'] as
        | { responses?: Record<string, { content?: Record<string, { schema?: Spec['components']['schemas'][string] }> }> }
        | undefined;
      const schema = get?.responses?.['200']?.content?.['application/json']?.schema;
      if (!schema) continue;
      expect({ path, keys: Object.keys(schema.properties ?? {}).sort() }).toEqual({
        path,
        keys: ['data', 'stamp'],
      });
    }
  });
});

/**
 * `x-causes` names which causes can arrive at which status on which operation.
 *
 * It is what lets a caller narrow per status instead of switching on all 23 causes at every
 * catch site, so it is only useful if it is complete and if every word in it is a real cause.
 * Both are checked here, because an extension nobody validates is a comment with punctuation.
 */
describe('x-causes', () => {
  const errorResponses = (): [string, string, { 'x-causes'?: string[] }][] => {
    const out: [string, string, { 'x-causes'?: string[] }][] = [];
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(item)) {
        for (const [code, response] of Object.entries(op.responses)) {
          if (code !== '200') out.push([`${method.toUpperCase()} ${path}`, code, response]);
        }
      }
    }
    return out;
  };

  it('names only causes that are in the closed set', () => {
    const known = new Set<string>(CAUSES);
    const strays: string[] = [];
    for (const [where, code, response] of errorResponses()) {
      for (const cause of response['x-causes'] ?? []) {
        if (!known.has(cause)) strays.push(`${where} ${code}: ${cause}`);
      }
    }
    expect(strays).toEqual([]);
  });

  /**
   * Exact, so it fails in both directions: a new gap gets reported, and a gap the analyzer
   * closes tells us to delete the entry rather than let the allowance outlive its reason.
   *
   * Empty since `7113ced`. `GET /v1/events 401` was the one entry, and this list emptying is
   * what told us to remove it, one commit after it was added.
   */
  const KNOWN_WITHOUT_CAUSES: readonly string[] = [];

  it('is present on every error response, with its exceptions written down', () => {
    const missing = errorResponses()
      .filter(([, , response]) => response['x-causes'] === undefined)
      .map(([where, code]) => `${where} ${code}`);
    expect(missing.sort()).toEqual([...KNOWN_WITHOUT_CAUSES].sort());
  });
});
