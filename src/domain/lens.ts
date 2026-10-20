// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The lens vocabulary: the metric panels' shared cut and band words, and the shapes still
 * waiting on the analyzer.
 *
 * Most of what lived here has graduated: the thrash bands, the copies histogram and the
 * two-basis coverage join are contract reads now, and their local types were deleted for the
 * generated ones, exactly as placement's were. What remains pre-contract is the scoped
 * attribution card the fixture serves, and the pure span arithmetic the live card computes
 * with, which stays here because both metric panels share it.
 */

import type { FiguresData, ReplicationData } from './contract';

/**
 * The gap-band vocabulary, keyed by the wire's own band strings. **Bands are fixed fleet to
 * fleet, so the figure compares.** Darkest is shortest is the churn end; presentation tone is
 * assigned at the glass, never here.
 */
export const GAP_BANDS = [
  { key: '<10s', label: 'under 10 s' },
  { key: '10s-1m', label: '10 s to 1 min' },
  { key: '1-10m', label: '1 to 10 min' },
  { key: '10-60m', label: '10 to 60 min' },
] as const;

/**
 * The copy-count band vocabulary, index-aligned with the wire's named fields (`k2`, `k34`,
 * `k58`, `k9`). Darkest is two copies; the top band is bounded because a fleet holding its
 * shared preamble on twelve nodes must not render identically to one holding it on three.
 */
export const COPY_BANDS = [
  { key: 'k2', label: '2 copies' },
  { key: 'k34', label: '3 to 4' },
  { key: 'k58', label: '5 to 8' },
  { key: 'k9', label: '9 or more' },
] as const;

/** The lens's cut vocabulary. The wire dim each cut asks for is the panel's mapping. */
export type CutKey = 'fleet' | 'workload' | 'instance' | 'model';

/** A scripted cut member, for the corpora that still fake their reads. */
export interface CutMember {
  readonly key: string;
  readonly label: string;
  /** Share of the fleet register. */
  readonly share: number;
  /** Band shares of this member's mass, in band order, summing to one. */
  readonly profile: readonly number[];
  /** Token-weighted coverage of this member's figures. */
  readonly cov: number;
}

/**
 * The scripted outcome of the change under test. **Corpus scaffolding, not product state**: the
 * real series has one outcome, but a panel reviewed only against a win is a panel nobody has
 * seen carry bad news, so the corpus scripts both and the rig switches them.
 */
export type ScenarioKey = 'win' | 'reg';

// ── The attribution card ────────────────────────────────────────────────────────────────────

/**
 * PROPOSED to the analyzer (relay ask, 2026-09-02): identity concentration for one slice and
 * one window. `/v1/blocks` ranks identities fleet-wide only and states no distinct count, so
 * the question a clicked bucket asks — was it one block coming back over and over, or many
 * different ones — has no served answer at any scope. The natural landing is scope params
 * (`holder`/`instance`/`workload`) plus `distinct_blocks`/`events`/`scope_total` on the
 * blocks read; until then the corpus serves this shape behind the seam and live mode renders
 * the awaiting-endpoint state.
 */
export interface ConcentrationQuery {
  /** The slice: a holder triple or an instance id. Exactly one. */
  readonly holder?: string;
  readonly instance?: string;
  /** `start_ms,end_ms` absolute: the clicked bucket's own span. */
  readonly window: string;
  readonly limit?: number;
}

/** One identity in the concentration read: its mass, its spread, its evidence. */
export interface ConcentrationRow {
  readonly block_id: string;
  /** Recompute mass this identity cost the slice over the window. */
  readonly tokens: { readonly value: number; readonly coverage: number };
  readonly events: number;
  /** Holders that stored this identity at some point: the spread hint toward the block page. */
  readonly holders_stored: number;
}

/** The concentration read: which identities cost the slice its recompute, worst first. */
export interface ConcentrationData {
  readonly register: 'recompute';
  readonly start_ms: number;
  readonly end_ms: number;
  /** Every identity with recompute mass in the slice over the window. */
  readonly distinct_blocks: number;
  readonly total_events: number;
  /** The slice's whole recompute over the window: every share's denominator. */
  readonly scope_total: number;
  /** Worst first, top-N; whatever the bound excluded stays counted in the totals. */
  readonly rows: readonly ConcentrationRow[];
}

/** The scoped attribution card's ask: the scope, the marker and the window. */
export interface AttributionQuery {
  /** The scope lens: a cut member key, or `fleet`. */
  readonly scope: string;
  /** The marker instant the spans center on. */
  readonly atMs: number;
  readonly scenario?: ScenarioKey;
}

/** The before/after card: means over equal spans either side of the marker instant. */
export interface AttributionCard {
  /** Recompute, tokens per minute. */
  readonly rcBefore: number;
  readonly rcAfter: number;
  /** Duplication, token-hours per minute. */
  readonly duBefore: number;
  readonly duAfter: number;
  /** Minutes of after-span actually available. Under 60 means still filling. */
  readonly afterMinutes: number;
}

/** The card's recompute register alone, from a figures read. */
export interface RecomputeSpans {
  /** Tokens per minute, mean over each span. */
  readonly rcBefore: number;
  readonly rcAfter: number;
  readonly afterMinutes: number;
}

/**
 * The live attribution arithmetic over a figures response: recompute mass summed per bucket,
 * meaned over equal spans either side of the marker instant.
 *
 * Served-grain honest: the bucket length comes from the response's own `grain` field, never
 * from a client-side constant, so an hour-served answer computes hour-wide means rather than
 * pretending minutes it was not given. `workload` scopes the sums to one member's buckets when
 * the read carried the workload dim. Returns null when no bucket falls before the instant: a
 * card with no before span has no comparison to state.
 */
export function recomputeSpans(
  figures: FiguresData,
  recomputeClasses: readonly string[],
  atMs: number,
  workload?: string,
): RecomputeSpans | null {
  const bucketMinutes =
    figures.grain === 'minute' ? 1 : figures.grain === 'hour' ? 60 : 24 * 60;
  const masses = new Map<number, number>();
  for (const segment of figures.segments) {
    for (const bucket of segment.figures ?? []) {
      const cls = bucket.dims.find((d) => d.dim === 'class')?.value;
      if (cls === undefined || !recomputeClasses.includes(cls)) continue;
      if (workload !== undefined) {
        const member = bucket.dims.find((d) => d.dim === 'workload')?.value ?? 'undeclared';
        if (member !== workload) continue;
      }
      const key = bucket.bucket;
      const at = Date.parse(key.length > 10 ? key : `${key}T00:00:00Z`);
      masses.set(at, (masses.get(at) ?? 0) + bucket.tokens.value);
    }
  }
  let beforeMass = 0;
  let beforeBuckets = 0;
  let afterMass = 0;
  let afterBuckets = 0;
  for (const [at, mass] of masses) {
    if (at < atMs) {
      beforeMass += mass;
      beforeBuckets += 1;
    } else {
      afterMass += mass;
      afterBuckets += 1;
    }
  }
  if (beforeBuckets === 0) return null;
  return {
    rcBefore: beforeMass / (beforeBuckets * bucketMinutes),
    rcAfter: afterBuckets > 0 ? afterMass / (afterBuckets * bucketMinutes) : 0,
    afterMinutes: afterBuckets * bucketMinutes,
  };
}

/** The card's duplication register, from a replication read. Token-hours per minute. */
export interface DuplicationSpans {
  readonly duBefore: number;
  readonly duAfter: number;
  readonly afterMinutes: number;
}

const HOUR_MS = 3_600_000;

/**
 * The duplication half of the live card: the copies read at a custom window around the marker,
 * bands summed per bucket, meaned over the spans. Same served-grain honesty as the recompute
 * half: the response's own `bucket_ms` decides the rate's denominator.
 */
export function duplicationSpans(
  replication: ReplicationData,
  atMs: number,
): DuplicationSpans | null {
  const bucketMinutes = replication.bucket_ms / 60_000;
  let beforeMass = 0;
  let beforeBuckets = 0;
  let afterMass = 0;
  let afterBuckets = 0;
  for (const row of replication.rows) {
    const mass = row.k2 + row.k34 + row.k58 + row.k9;
    if (row.bucket_ms < atMs) {
      beforeMass += mass;
      beforeBuckets += 1;
    } else {
      afterMass += mass;
      afterBuckets += 1;
    }
  }
  if (beforeBuckets === 0) return null;
  return {
    duBefore: beforeMass / HOUR_MS / (beforeBuckets * bucketMinutes),
    duAfter: afterBuckets > 0 ? afterMass / HOUR_MS / (afterBuckets * bucketMinutes) : 0,
    afterMinutes: afterBuckets * bucketMinutes,
  };
}
