// SPDX-License-Identifier: AGPL-3.0-only
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGE_SCRIPT, SEAMS, type AgeScript } from '../src/data/fixture/world';
import * as r from '../src/data/fixture/responses';
import { ApiError } from '../src/domain/refusal';

/**
 * **The spec validates the fixture bytes.**
 *
 * This is the compensating mechanism `read-api.md` §2.2.1 named and then declined to build,
 * because before per-path schemas existed it would have passed trivially and read as coverage.
 * Per-path schemas exist now, so it does not pass trivially: it is the check that keeps the
 * corpus honest about the shapes it claims to be, and it is the reason the console can develop
 * against fixtures without the fixtures drifting into flattery.
 *
 * What it proves: every response the corpus emits would deserialize on the other side of the
 * seam. What it does not prove: that the analyzer would emit these VALUES. Nothing on this side
 * of the repo split can prove that, which is what the canary and live mode are for.
 */

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(
  readFileSync(resolve(here, '../contract/openapi.json'), 'utf8'),
) as SpecDocument;

interface SpecDocument {
  paths: Record<
    string,
    Record<
      string,
      { responses: Record<string, { content?: Record<string, { schema: unknown }> }> }
    >
  >;
  components: { schemas: Record<string, unknown> };
}

const ajv = new Ajv2020({
  // The document uses OpenAPI annotations (`example`, `format: int64`) that are not assertions.
  // Validating them would test the generator, not the corpus.
  strict: false,
  validateFormats: false,
  allErrors: true,
});
ajv.addSchema(spec, 'openapi.json');

const validators = new Map<string, ValidateFunction>();

/** JSON Pointer escaping, so a path like `/v1/days/{day}` can address itself. */
const pointer = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1');

/**
 * The 200 body schema for a route, envelope included, straight out of the contract.
 *
 * Addressed by JSON Pointer INTO the added document rather than extracted and compiled on its
 * own. The response schemas are full of `#/components/schemas/...` references, and a schema
 * lifted out of the document takes its own root with it, so every one of those references
 * dangles. Resolving them against the document is the whole point: the thing under test is the
 * contract as published, not a fragment of it.
 */
function validatorFor(route: string): ValidateFunction {
  const cached = validators.get(route);
  if (cached) return cached;
  const has = spec.paths[route]?.['get']?.responses['200']?.content?.['application/json']?.schema;
  if (!has) throw new Error(`no 200 JSON schema for ${route} in the contract`);
  const ref = `openapi.json#/paths/${pointer(route)}/get/responses/200/content/${pointer('application/json')}/schema`;
  const validate = ajv.getSchema(ref);
  if (!validate) throw new Error(`could not resolve ${ref}`);
  validators.set(route, validate);
  return validate;
}

interface JsonSchema {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
}

function deref(schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!schema?.$ref) return schema;
  const name = schema.$ref.split('/').pop() as string;
  return spec.components.schemas[name] as JsonSchema;
}

/**
 * **The other direction: does the schema DESCRIBE every key the payload carries?**
 *
 * A validator only ever reads `required` and `properties` for the keys it knows about, so a
 * field that is emitted on every response and described in neither list passes validation
 * silently forever. That is exactly how `analyzer_version` survived: present in every stamp on
 * the wire, absent from the schema in both directions, and invisible to `required ⊆ properties`
 * because the drift ran the other way.
 *
 * So this walks the payload rather than the schema, and reports keys the document does not
 * describe. Suggested by the analyzer after fixing finding 10, and it is the assertion that
 * would have caught the part of finding 10 that our first check structurally could not see.
 */
function undescribedKeys(payload: unknown, raw: JsonSchema | undefined, path = ''): string[] {
  const schema = deref(raw);
  if (!schema || payload === null || payload === undefined) return [];

  if (Array.isArray(payload)) {
    return payload.flatMap((item, i) => undescribedKeys(item, schema.items, `${path}[${i}]`));
  }

  if (typeof payload !== 'object') return [];

  // A nullable field is `oneOf: [null, ref]`. Take the branch that is not the null.
  const branches = schema.oneOf ?? schema.anyOf;
  if (branches) {
    const real = branches.map(deref).find((b) => b && b.type !== 'null' && b.properties);
    return undescribedKeys(payload, real, path);
  }

  // An open object states that it carries anything, which is a decision rather than a gap.
  if (schema.additionalProperties === true) return [];
  if (!schema.properties) return [];

  const out: string[] = [];
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const child = schema.properties[key];
    if (!child) {
      out.push(`${path}/${key}`);
      continue;
    }
    out.push(...undescribedKeys(value, child, `${path}/${key}`));
  }
  return out;
}

function check(route: string, body: unknown): void {
  const validate = validatorFor(route);
  if (!validate(body)) {
    const detail = (validate.errors ?? [])
      .map((e) => `  ${e.instancePath || '/'} ${e.message ?? ''}`)
      .join('\n');
    throw new Error(`${route} does not satisfy the contract:\n${detail}`);
  }

  const schema = spec.paths[route]?.['get']?.responses['200']?.content?.['application/json']
    ?.schema as JsonSchema | undefined;
  const undescribed = undescribedKeys(body, schema);
  if (undescribed.length > 0) {
    throw new Error(
      `${route} carries keys the contract does not describe:\n` +
        undescribed.map((k) => `  ${k}`).join('\n'),
    );
  }
}

/** The envelope, exactly as every 200 in this API carries it. */
function stamped(age: AgeScript, data: unknown): unknown {
  return { stamp: r.stampFor(age), data };
}

const AGES_WITH_A_PASS: AgeScript[] = [AGE_SCRIPT.t2, AGE_SCRIPT.t3];
const ALL_AGES: AgeScript[] = [AGE_SCRIPT.t0, AGE_SCRIPT.t1, AGE_SCRIPT.t2, AGE_SCRIPT.t3];

describe('every fixture response satisfies the committed contract', () => {
  it.each(ALL_AGES)('stamp at $key', (age) => {
    check('/v1/stamp', stamped(age, r.stampDataFor(age)));
  });

  it.each(ALL_AGES)('health at $key', (age) => {
    // Health answers at EVERY age. The strip has nothing to hydrate from otherwise, which is the
    // t0 case a delta-only design fails silently.
    check('/v1/health', stamped(age, r.healthFor(age)));
  });

  it.each(ALL_AGES)('roster at $key', (age) => {
    check('/v1/roster', stamped(age, r.rosterFor(age)));
  });

  it.each(AGES_WITH_A_PASS)('figures at $key, 14 days by class', (age) => {
    check('/v1/figures', stamped(age, r.figuresFor(age, { window: '14d', dims: ['class'] })));
  });

  it.each(AGES_WITH_A_PASS)('figures at $key, 90 days across two seams', (age) => {
    check('/v1/figures', stamped(age, r.figuresFor(age, { window: '90d', dims: ['class'] })));
  });

  it.each(AGES_WITH_A_PASS)('figures at $key, the 3 h stop at minute grain under an instance scope', (age) => {
    check(
      '/v1/figures',
      stamped(age, r.figuresFor(age, { window: '3h', grain: 'minute', dims: ['class'], instance: 'i-003' })),
    );
  });

  it.each(AGES_WITH_A_PASS)('holders at $key', (age) => {
    check('/v1/holders', stamped(age, r.holdersFor(age, {})));
  });

  it.each(AGES_WITH_A_PASS)('coverage at $key, both bases', (age) => {
    check('/v1/coverage', stamped(age, r.coverageFor(age, { by: 'fleet' })));
    check('/v1/coverage', stamped(age, r.coverageFor(age, { by: 'instance' })));
  });

  it.each(AGES_WITH_A_PASS)('markers at $key', (age) => {
    check('/v1/markers', stamped(age, r.markersFor(age, { window: '90d' })));
  });

  it.each(AGES_WITH_A_PASS)('whales at $key, stamped and limited', (age) => {
    check('/v1/residual/whales', stamped(age, r.whalesFor(age, {})));
    check('/v1/residual/whales', stamped(age, r.whalesFor(age, { window: '2d', limit: 2 })));
  });

  it.each(AGES_WITH_A_PASS)('replication at $key, on the stops and a custom range', (age) => {
    check('/v1/residual/replication', stamped(age, r.replicationFor(age, {})));
    check('/v1/residual/replication', stamped(age, r.replicationFor(age, { window: '3h', workload: 'rag-batch' })));
    const from = Date.parse('2026-08-03T09:00:00Z');
    check('/v1/residual/replication', stamped(age, r.replicationFor(age, { window: `${from},${from + 5 * 3_600_000}` })));
  });

  it.each(AGES_WITH_A_PASS)('figure bands at $key, uncut, by workload and on the stops', (age) => {
    check('/v1/figures/bands', stamped(age, r.bandsFor(age, { window: '14d', grain: 'day' })));
    check(
      '/v1/figures/bands',
      stamped(age, r.bandsFor(age, { window: '2d', grain: 'hour', dims: 'workload' })),
    );
    check(
      '/v1/figures/bands',
      stamped(age, r.bandsFor(age, { window: '3h', grain: 'minute', dims: 'workload' })),
    );
    check(
      '/v1/figures/bands',
      stamped(age, r.bandsFor(age, { window: '3h', grain: 'minute', instance: 'i-003', dims: 'class' })),
    );
    check('/v1/figures/bands', stamped(age, r.bandsFor(age, { window: '48h', grain: 'hour' })));
  });

  it.each(AGES_WITH_A_PASS)('instance duplication at $key, hybrid, single-group, unseen, both grains', (age) => {
    // i-005 runs a hybrid model (cache-group mass present); i-004 is single-group; i-999 was
    // never seen, and its empty rows are a measured zero rather than a refusal. The 3 h stop
    // asks minute (landing 10), so the minute-wide document is checked beside the hourly one.
    check(
      '/v1/instances/{instance}/duplication',
      stamped(age, r.instanceDuplicationFor(age, 'i-005', { window: '2d' })),
    );
    check(
      '/v1/instances/{instance}/duplication',
      stamped(age, r.instanceDuplicationFor(age, 'i-005', { window: '3h', grain: 'minute' })),
    );
    check(
      '/v1/instances/{instance}/duplication',
      stamped(age, r.instanceDuplicationFor(age, 'i-004', { window: '2d' })),
    );
    check(
      '/v1/instances/{instance}/duplication',
      stamped(age, r.instanceDuplicationFor(age, 'i-999', {})),
    );
  });

  it.each(AGES_WITH_A_PASS)('day detail at $key', (age) => {
    check('/v1/days/{day}', stamped(age, r.dayFor(age, '2026-08-02')));
  });

  it.each(AGES_WITH_A_PASS)('evidence at $key, inside the horizon', (age) => {
    check('/v1/evidence', stamped(age, r.evidenceFor(age, { block: 'b4a1' })));
  });

  it.each(AGES_WITH_A_PASS)('evidence at $key, refused past the horizon', (age) => {
    const from = Date.parse('2026-06-02T09:00:00Z');
    const window = `${from},${from + 3_600_000}`;
    check('/v1/evidence', stamped(age, r.evidenceFor(age, { holder: 'i-001/0/0', window })));
  });

  it.each(AGES_WITH_A_PASS)('blocks and the block drill at $key', (age) => {
    check('/v1/blocks', stamped(age, r.blocksFor(age, {})));
    check('/v1/tags', stamped(age, r.tagsFor(age)));
    check('/v1/blocks/{block_id}/holders', stamped(age, r.blockHoldersFor(age, 'b4a1', {})));
  });

  it.each(AGES_WITH_A_PASS)('holder timeline at $key', (age) => {
    const holder = { instance: 'i-001', dp_rank: 0, group_idx: 0 };
    check('/v1/holders/{instance}/{dp_rank}/{group_idx}/timeline', stamped(age, r.timelineFor(age, holder, {})));
  });

  it('marker detail', () => {
    const first = SEAMS[0];
    expect(first).toBeDefined();
    check('/v1/markers/{id}', stamped(AGE_SCRIPT.t3, r.markerFor(first!.id)));
  });
});

describe('the drill says where it read from', () => {
  // A block's records are re-derived from the log; a holder's are its ring, the newest stores
  // the analysis classified on it. Each reaches back differently, so each says which.
  const age = AGE_SCRIPT.t3;
  const holder = 'i-001/0/0';
  const rank = { instance: 'i-001', dp_rank: 0, group_idx: 0 };
  const hourFrom = (iso: string): string => {
    const from = Date.parse(iso);
    return `${from},${from + 3_600_000}`;
  };

  it('a block is re-derived from the log', () => {
    expect(r.evidenceFor(age, { block: 'b4a1' }).read_from).toBe('log');
    expect(r.blockHoldersFor(age, 'b4a1', {}).read_from).toBe('log');
  });

  it("a holder is read from its ring", () => {
    const rows = r.evidenceFor(age, { holder, window: hourFrom('2026-08-03T09:00:00Z') });
    check('/v1/evidence', stamped(age, rows));
    expect(rows.read_from).toBe('ring');
    expect(rows.records?.length).toBeGreaterThan(0);
    expect(r.timelineFor(age, rank, {}).read_from).toBe('ring');
  });

  it('a refusal still says where it would have read from', () => {
    const past = r.evidenceFor(age, { holder, window: hourFrom('2026-06-02T09:00:00Z') });
    check('/v1/evidence', stamped(age, past));
    expect(past.refused?.cause).toBe('outside_raw_horizon');
    expect(past.read_from).toBe('ring');
  });
});

describe('the paging path is walked, not assumed', () => {
  it('pages holders one row at a time and stops exactly once', () => {
    // At the v1 envelope one page holds the table, so this is the path nobody would otherwise
    // exercise. A cursor mechanism that has never been followed to exhaustion is a mechanism
    // that breaks the day the envelope lifts.
    const age = AGE_SCRIPT.t3;
    let cursor: string | undefined;
    let pages = 0;
    let rows = 0;
    do {
      const page = r.holdersFor(age, { limit: 1, ...(cursor ? { cursor } : {}) });
      check('/v1/holders', stamped(age, page));
      expect(page.refused).toBeUndefined();
      rows += page.rows?.length ?? 0;
      cursor = page.page.next_cursor ?? undefined;
      pages += 1;
      if (pages > 12) break;
    } while (cursor && pages < 12);

    expect(rows).toBe(pages);
    expect(cursor).toBeDefined();
  });

  it('exhausts a short surface and nulls the cursor exactly once', () => {
    const age = AGE_SCRIPT.t3;
    let cursor: string | undefined;
    let pages = 0;
    let seen = 0;
    for (;;) {
      const page = r.blockHoldersFor(age, 'b4a1', { limit: 4, ...(cursor ? { cursor } : {}) });
      check('/v1/blocks/{block_id}/holders', stamped(age, page));
      seen += page.rows?.length ?? 0;
      pages += 1;
      // Keyset paging answers "is there more" from the same read, so a count would be a second
      // scan for a number nobody reads.
      expect(page.page.total_rows).toBeNull();
      const next = page.page.next_cursor;
      if (next === null || next === undefined) break;
      cursor = next;
      expect(pages).toBeLessThan(10);
    }
    expect(seen).toBe(9);
    expect(pages).toBe(3);
  });

  it('issues no cursor from a ranking, because page two answers a question nobody asked', () => {
    const blocks = r.blocksFor(AGE_SCRIPT.t3, { limit: 10 });
    check('/v1/blocks', stamped(AGE_SCRIPT.t3, blocks));
    expect('page' in blocks).toBe(false);
    for (const day of blocks.days) expect(day.blocks.length).toBeLessThanOrEqual(10);
  });
});

describe('a stale cursor is a result, not an error', () => {
  const stale = (): string => {
    const minted = r.holdersFor(AGE_SCRIPT.t3, { limit: 1 }).page.next_cursor;
    expect(minted).toBeTruthy();
    return minted as string;
  };

  it('keeps the envelope, the heading and the page block, and replaces only the rows', () => {
    const page = r.holdersFor(AGE_SCRIPT.t2, { limit: 1, cursor: stale() });
    check('/v1/holders', stamped(AGE_SCRIPT.t2, page));

    expect(page.refused?.cause).toBe('cursor_stale');
    // The payload is null exactly when the refusal is present. An empty array would mean
    // "looked and found nothing", which is a different and much worse claim.
    expect(page.rows).toBeUndefined();
    expect(page.fleet_total).toBeUndefined();
    // The page block describes the request, so the frame survives.
    expect(page.page.returned).toBe(0);
    expect(page.page.next_cursor).toBeNull();
    expect(page.page.total_rows).toBeNull();
  });

  it('states what moved, so the console can name the change', () => {
    const page = r.holdersFor(AGE_SCRIPT.t2, { limit: 1, cursor: stale() });
    const bound = page.refused?.bound as Record<string, unknown>;
    expect(bound['current_discriminator']).toBeDefined();
    expect(Object.keys(bound)).toContain('current_classified_day');
  });

  it('refuses one SECTION of a day, never the day', () => {
    const day = r.dayFor(AGE_SCRIPT.t2, '2026-08-02', { limit: 1, cursor: stale() });
    check('/v1/days/{day}', stamped(AGE_SCRIPT.t2, day));

    expect(day.holders_refused?.cause).toBe('cursor_stale');
    expect(day.holders).toBeUndefined();
    // The unpaged sections are still valid and still present. Blanking the panel around a
    // holders-section refusal would discard four facts to report one.
    expect(day.by_class.length).toBeGreaterThan(0);
    expect(day.coverage).toBeDefined();
    expect(day.evidence_bound).toBeDefined();
  });

  it('drops the summaries that describe the rows it could not read', () => {
    const roster = r.rosterFor(AGE_SCRIPT.t2, { limit: 1, cursor: stale() });
    check('/v1/roster', stamped(AGE_SCRIPT.t2, roster));
    expect(roster.refused?.cause).toBe('cursor_stale');
    // A summary that outlives the read it summarises is the altitude lie the summary law forbids.
    expect(roster.rows).toBeUndefined();
    expect(roster.state_counts).toBeUndefined();
    expect(roster.producer_runs).toBeUndefined();
    // What survives is what does not depend on the rows.
    expect(roster.cannot_tell_you).toBeTruthy();
  });
});

describe('before the first pass, a pass-derived read is not yet measured rather than zero', () => {
  // Since analyzer landing 2 of the grain ladder (2026-09-02) this is a STAMP fact, not a
  // wire cause: the server answers 200 with `pass.frontier_day` null, and the data layer
  // raises the same not-yet-measured state the panels always rendered. The corpus mirrors
  // that seam, so the error carries no cause and says so.
  it.each([AGE_SCRIPT.t0, AGE_SCRIPT.t1])('figures at $key', (age) => {
    try {
      r.figuresFor(age, {});
      throw new Error('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const api = error as ApiError;
      expect(api.notYetPassed).toBe(true);
      expect(api.cause).toBeNull();
      expect(api.isNotYetMeasured).toBe(true);
    }
  });
});
