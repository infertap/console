// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The bands view model: `/v1/figures/bands` rows, turned into what the lens draws.
 *
 * The response carries one row per bucket × band × cut member (the member riding `dims`), and
 * the gap-unobserved mass as its own figure beside the rows, never a sixth band. This module
 * does the only client-side work that shape leaves: group the rows by member, grid them into
 * the bucket × band matrix the chart consumes, and aggregate each member's totals and
 * token-weighted coverage for the working table. Sums and mass-weighted means only; nothing
 * here invents a figure the rows do not carry.
 */

import type { BandsData } from './contract';
import { GAP_BANDS } from './lens';

/** The wire's band order, index-aligned with `GAP_BANDS`. */
const BAND_INDEX = new Map<string, number>(GAP_BANDS.map((band, i) => [band.key, i]));

export interface BandMember {
  /** The cut member's wire value, or `fleet` for the uncut read. */
  readonly key: string;
  /** One entry per bucket, each band-count long, oldest first. Token mass. */
  readonly rows: readonly (readonly number[])[];
  /** Window totals per band, in band order. */
  readonly bandTotals: readonly number[];
  readonly total: number;
  /** Token-weighted over the member's own rows. */
  readonly coverage: number;
}

export interface BandsView {
  /** Bucket open instants, oldest first: the shared time axis of every member. */
  readonly bucketsMs: readonly number[];
  /** Members by descending total; the fleet read yields exactly one, keyed `fleet`. */
  readonly members: readonly BandMember[];
}

const bucketInstant = (key: string): number =>
  Date.parse(key.length > 10 ? key : `${key}T00:00:00Z`);

/**
 * Group the rows by the cut dim. The bucket axis is the response's own window echo, stepped at
 * its stated `bucket_ms`; a bucket a member has no row for is an honest zero, because these
 * are sums over classified stores and absence of stores is absence of mass, not of looking.
 */
export function bandsView(
  data: BandsData,
  dim: string | null,
  basis: 'tokens' | 'events' = 'tokens',
): BandsView {
  const byMember = new Map<string, Map<number, number[]>>();
  const weights = new Map<string, { weighted: number; mass: number }>();

  for (const row of data.rows) {
    const bandIndex = BAND_INDEX.get(row.band);
    if (bandIndex === undefined) continue;
    const member =
      dim === null ? 'fleet' : (row.dims.find((d) => d.dim === dim)?.value ?? 'undeclared');
    const at = bucketInstant(row.bucket);
    // The row carries both bases: token mass is the bill, the event count is the typical
    // block. The view sums whichever the panel asked for; coverage stays token-weighted
    // either way, because coverage qualifies the token figures.
    const value = basis === 'events' ? row.events : row.tokens.value;

    let buckets = byMember.get(member);
    if (!buckets) {
      buckets = new Map();
      byMember.set(member, buckets);
    }
    let bands = buckets.get(at);
    if (!bands) {
      bands = GAP_BANDS.map(() => 0);
      buckets.set(at, bands);
    }
    bands[bandIndex] = (bands[bandIndex] ?? 0) + value;

    const weight = weights.get(member) ?? { weighted: 0, mass: 0 };
    weight.weighted += row.tokens.coverage * row.tokens.value;
    weight.mass += row.tokens.value;
    weights.set(member, weight);
  }

  const bucketsMs: number[] = [];
  for (let at = data.start_ms; at < data.end_ms; at += data.bucket_ms) bucketsMs.push(at);
  const members = [...byMember.entries()]
    .map(([key, buckets]) => {
      const rows = bucketsMs.map((at) => buckets.get(at) ?? GAP_BANDS.map(() => 0));
      const bandTotals = GAP_BANDS.map((_, band) =>
        rows.reduce((a, row) => a + (row[band] ?? 0), 0),
      );
      const total = bandTotals.reduce((a, x) => a + x, 0);
      const weight = weights.get(key) ?? { weighted: 0, mass: 0 };
      return {
        key,
        rows,
        bandTotals,
        total,
        coverage: weight.mass > 0 ? weight.weighted / weight.mass : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  return { bucketsMs, members };
}
