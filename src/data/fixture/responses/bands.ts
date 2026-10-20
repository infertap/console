// SPDX-License-Identifier: AGPL-3.0-only
/** `/v1/figures/bands`: repeat-compute mass by time-since-eviction band, per bucket, per cut. */
import * as w from '../world';
import type { BandsData } from '../../../domain/contract';
import { GAP_BANDS } from '../../../domain/lens';
import type { CutKey, CutMember } from '../../../domain/lens';
import { ApiError } from '../../../domain/refusal';
import type { WindowDesc } from '../../../domain/windows';
import {
  CUTS,
  GAP_UNOBSERVED_SHARE,
  INSTANCE_CUT_POPULATION,
  THRASH_EDGE_MS,
  TOKENS_PER_EVENT,
  holderMember,
  nodeMembers,
  postClearShare,
  rankMembers,
  thrashSeriesFor,
} from '../thrash';
import { errorBody, figure, reachFor, requirePass, resolveScope, windowDays } from './shared';

/** The wire's dim for each of the lens's cuts. */
const BAND_DIM_CUTS: Readonly<Record<string, CutKey>> = {
  workload: 'workload',
  holder: 'instance',
  model: 'model',
};

/**
 * The thrash lens's bytes: the five observed bands in rows with the cut riding `dims`, and the
 * gap-unobserved mass as its own figure beside them, never a sixth band.
 *
 * Minute grain serves, and the panel stops `14d`/`48h`/`3h` resolve against the emission
 * frontier through the same authority as the copies read. The corpus models the standing bounds: the holder cut at
 * minute grain refuses by name (the minute cells are kept per rank with cache groups rolled
 * up, so a holder cut has no minute table, while an instance or holder scope and the instance
 * cut serve from those rank cells), and a window outside the minute tier's 48-hour
 * reach refuses with its bound rather than downgrading. Everything else matches the wire:
 * buckets, band strings, dims vocabulary.
 */
export function bandsFor(
  age: w.AgeScript,
  query: {
    window?: string;
    grain?: string;
    dims?: string;
    limit?: number;
    workload?: string;
    instance?: string;
    holder?: string;
  } = {},
  scenario: 'win' | 'reg' = 'win',
): BandsData {
  requirePass(age);
  // The holder cut's top-N bound, refused outside its range as the handler refuses it: the
  // handler's cap is 100 (WHALES_MAX), whatever the declared maximum currently claims.
  const limit = query.limit ?? 8;
  if (limit < 1 || limit > 100) {
    throw new ApiError(
      400,
      errorBody('limit_invalid', `limit ${limit} is outside 1..=100`),
      `limit ${limit} is outside 1..=100`,
    );
  }
  const scope = resolveScope(query);
  const dim = (query.dims ?? '').split(',')[0] || null;
  const desc = bandsDesc(query.window ?? '14d', query.grain ?? 'auto');
  const grainWord =
    desc.bucketMs >= 86_400_000 ? 'day' : desc.bucketMs >= 3_600_000 ? 'hour' : 'minute';
  // The standing rule, modeled: the minute cells are kept per rank with cache
  // groups and tiers rolled up. An instance or holder scope and the instance cut serve from
  // them; a holder cut has no minute table and refuses by name, in the route's own words.
  if (grainWord === 'minute' && dim === 'holder') {
    throw new ApiError(
      400,
      errorBody(
        'grain_unavailable',
        'the minute grain keeps its banded cells per rank with cache groups and tiers rolled up; a holder or tier cut has no minute table — scope to the instance or the holder, or ask at `hour`',
      ),
      'a holder cut has no minute table',
    );
  }
  // The minute tier's measured reach: a window past it refuses with the bound stated, and
  // never downgrades.
  if (grainWord === 'minute' && desc.spanMs > 48 * 3_600_000) {
    throw new ApiError(
      400,
      errorBody(
        'grain_unavailable',
        'the minute tier reaches 48 hours; ask a narrower window or the hour tier',
        { reach_ms: 48 * 3_600_000 },
      ),
      'the minute tier reaches 48 hours',
    );
  }

  // Which members answer: scope says which slice, dims says how to group inside it. The
  // holder dim keeps its stated top-N bound; partitions are whole by construction; a scope
  // the corpus never matched yields no members, which downstream is looked-and-found-nothing.
  let members: readonly CutMember[];
  let holderPool: number = INSTANCE_CUT_POPULATION;
  // A scoped whole is the SUM of its parts, exactly: the corpus jitters each member's series
  // independently, so a scoped read synthesized as its own member would disagree with the
  // same page's member cut, which is the one disagreement a page must never have with
  // itself. `sumOf` names the parts; the rows are their per-bucket, per-band sums.
  // The class dim is a SPLIT of the base slice, not a member family of its own, so it takes
  // the scope's member selection exactly as the uncut read does.
  const baseDim = dim === 'class' ? null : dim;
  let sumOf: readonly CutMember[] | null = null;
  if (baseDim === null) {
    if (scope.kind === 'workload') {
      sumOf = nodeMembers(scope.value);
      members = [];
    } else if (scope.kind === 'instance') {
      sumOf = rankMembers(scope.value ?? '');
      members = [];
    } else if (scope.kind === 'holder') {
      members = [holderMember(scope.value ?? '')].filter((m): m is CutMember => m !== null);
    } else {
      members = CUTS.fleet;
    }
  } else if (baseDim === 'holder') {
    const pool =
      scope.kind === 'instance'
        ? rankMembers(scope.value ?? '')
        : scope.kind === 'holder'
          ? [holderMember(scope.value ?? '')].filter((m): m is CutMember => m !== null)
          : CUTS.instance;
    holderPool = scope.kind === 'fleet' ? INSTANCE_CUT_POPULATION : pool.length;
    members = pool.slice(0, limit);
  } else if (baseDim === 'instance') {
    members =
      scope.kind === 'workload'
        ? nodeMembers(scope.value)
        : scope.kind === 'instance'
          ? nodeMembers(null).filter((m) => m.key === scope.value)
          : nodeMembers(null);
  } else if (baseDim === 'workload') {
    members =
      scope.kind === 'workload'
        ? CUTS.workload.filter((m) => m.key === scope.value)
        : CUTS.workload;
  } else {
    members = CUTS[BAND_DIM_CUTS[baseDim] ?? 'fleet'];
  }
  const bucketKey = (i: number): string => {
    const at = desc.startMs + i * desc.bucketMs;
    return grainWord === 'day'
      ? new Date(at).toISOString().slice(0, 10)
      : `${new Date(at).toISOString().slice(0, 16)}:00Z`;
  };
  // Tokens per event vary by band: the short bands carry the whales, so the event basis and
  // the token basis genuinely disagree, as they do in life. No floor: a floor of one event
  // per row drowns small cells and flattens the event mix to uniformity, which is how the
  // instance-hour composition once showed five equal bands whatever the data said.
  const eventsOf = (value: number, band: number): number =>
    Math.max(0, Math.round(value / (TOKENS_PER_EVENT[band] ?? 16)));
  /**
   * The class split of one band's mass: recompute is exactly [ETR, post_clear], and the
   * class IS the close reason. ETR is the steady state (capacity evicted it, traffic asked
   * again); post_clear exists only downstream of an ANNOUNCED cache flush, so its share is
   * near zero in quiet buckets and surges after the scripted clears, decaying as the working
   * set re-warms. The split partitions each value exactly, so the class cut sums to the
   * uncut read to the token.
   */
  const classSplit = (
    value: number,
    band: number,
    bucketIndex: number,
  ): readonly (readonly [string, number])[] => {
    const post = Math.round(
      value * postClearShare(band, desc.startMs + bucketIndex * desc.bucketMs, desc.bucketMs),
    );
    return [
      ['ETR', value - post],
      ['post_clear', post],
    ];
  };
  const rows =
    sumOf !== null
      ? (() => {
          // A scope the corpus never matched has no parts: looked, and found nothing.
          if (sumOf.length === 0) return [];
          const parts = sumOf.map((m) => thrashSeriesFor(m, desc, scenario));
          const mass = sumOf.reduce((a, m) => a + m.share, 0);
          const cov =
            mass > 0 ? sumOf.reduce((a, m) => a + m.cov * m.share, 0) / mass : w.COVERAGE_FULL;
          return Array.from({ length: desc.n }, (_, i) =>
            GAP_BANDS.flatMap((band, b) => {
              // Each part rounds before the sum, exactly as the member cut serves it, so the
              // whole and its parts agree to the token.
              const value = parts.reduce((a, series) => a + Math.round(series[i]?.[b] ?? 0), 0);
              if (dim !== 'class') {
                return [
                  {
                    bucket: bucketKey(i),
                    band: band.key,
                    dims: [] as { dim: string; value: string }[],
                    events: eventsOf(value, b),
                    tokens: figure(value, cov),
                  },
                ];
              }
              return classSplit(value, b, i).map(([cls, clsValue]) => ({
                bucket: bucketKey(i),
                band: band.key,
                dims: [{ dim: 'class', value: cls }],
                events: eventsOf(clsValue, b),
                tokens: figure(clsValue, cov),
              }));
            }),
          ).flat();
        })()
      : members.flatMap((member) => {
          const series = thrashSeriesFor(member, desc, scenario);
          return series.flatMap((bands, i) =>
            bands.flatMap((raw, b) => {
              const value = Math.round(raw);
              if (dim !== 'class') {
                return [
                  {
                    bucket: bucketKey(i),
                    band: GAP_BANDS[b]?.key ?? '10-60m',
                    dims: dim === null ? [] : [{ dim, value: member.key }],
                    events: eventsOf(value, b),
                    tokens: figure(value, member.cov),
                  },
                ];
              }
              return classSplit(value, b, i).map(([cls, clsValue]) => ({
                bucket: bucketKey(i),
                band: GAP_BANDS[b]?.key ?? '10-60m',
                dims: [{ dim: 'class', value: cls }],
                events: eventsOf(clsValue, b),
                tokens: figure(clsValue, member.cov),
              }));
            }),
          );
        });
  const total = rows.reduce((a, row) => a + row.tokens.value, 0);
  const unobserved = Math.round(total * GAP_UNOBSERVED_SHARE);
  return {
    register: 'recompute',
    never_summed_with: 'capacity',
    grain: grainWord,
    // The window echo, exactly as the wire states it: the served bucket WIDTH, the bounds, and
    // for a custom range why this grain. The client renders the buckets it got.
    bucket_ms: desc.bucketMs,
    start_ms: desc.startMs,
    end_ms: desc.startMs + desc.spanMs,
    ...(desc.key === 'custom' ? { derived: 'range × retention' } : {}),
    // The holder cut is a stated top-N: worst first by window mass, a holder whole or absent,
    // and the population names what the rows were cut from.
    ...(dim === 'holder'
      ? { population: holderPool, holders_returned: members.length }
      : {}),
    reach: reachFor(age, w.frontierDay(age)).reach,
    rows,
    gap_unobserved: figure(unobserved, w.COVERAGE_FULL),
    gap_unobserved_events: Math.max(1, Math.round(unobserved / 58)),
  };
}

/** The stops and the ladder, as the endpoint fixes them, over the corpus's edge. */
function bandsDesc(
  windowSpec: string,
  grain: string,
): Pick<WindowDesc, 'n' | 'startMs' | 'bucketMs' | 'unitName' | 'key' | 'spanMs'> {
  // The panel stops, resolved against the emission frontier exactly as the copies read
  // resolves them: one window authority for the page's two zoom charts.
  if (windowSpec === '48h' || windowSpec === '3h') {
    const spanMs = windowSpec === '48h' ? 48 * 3_600_000 : 3 * 3_600_000;
    const minute = grain === 'minute' || (grain === 'auto' && spanMs <= 4 * 3_600_000);
    const bucketMs = minute ? 60_000 : grain === 'day' ? 86_400_000 : 3_600_000;
    const n = Math.max(1, Math.round(spanMs / bucketMs));
    return {
      key: windowSpec,
      n,
      startMs: THRASH_EDGE_MS - spanMs,
      bucketMs,
      spanMs,
      unitName: minute ? 'min' : bucketMs === 3_600_000 ? 'h' : 'day',
    };
  }
  const abs = /^(\d+),(\d+)$/.exec(windowSpec);
  if (abs?.[1] && abs[2]) {
    const a = Number(abs[1]);
    const b = Math.max(Number(abs[2]), a + 600_000);
    // An explicit tier is honored verbatim; auto ladders by span, minute within its reach.
    if (grain === 'minute' || (grain === 'auto' && b - a <= 4 * 3_600_000)) {
      const n = Math.max(2, Math.round((b - a) / 60_000));
      return { key: 'custom', n, startMs: a, bucketMs: 60_000, spanMs: n * 60_000, unitName: 'min' };
    }
    if (grain === 'hour' || (grain === 'auto' && b - a <= 6 * 86_400_000)) {
      const n = Math.max(1, Math.round((b - a) / 3_600_000));
      return { key: 'custom', n, startMs: a, bucketMs: 3_600_000, spanMs: n * 3_600_000, unitName: 'h' };
    }
    const n = Math.max(1, Math.round((b - a) / 86_400_000));
    return { key: 'custom', n, startMs: a, bucketMs: 86_400_000, spanMs: n * 86_400_000, unitName: 'day' };
  }
  const days = windowDays(windowSpec, 14);
  if (grain === 'minute') {
    // Honored verbatim, so the caller's reach check refuses a span past the tier rather than
    // this ladder quietly downgrading it.
    const n = days * 1440;
    return {
      key: 'custom',
      n,
      startMs: THRASH_EDGE_MS - n * 60_000,
      bucketMs: 60_000,
      spanMs: n * 60_000,
      unitName: 'min',
    };
  }
  if (grain === 'hour') {
    const n = days * 24;
    return {
      key: '48h',
      n,
      startMs: THRASH_EDGE_MS - n * 3_600_000,
      bucketMs: 3_600_000,
      spanMs: n * 3_600_000,
      unitName: 'h',
    };
  }
  const start = Math.floor(THRASH_EDGE_MS / 86_400_000) * 86_400_000 - (days - 1) * 86_400_000;
  return {
    key: '14d',
    n: days,
    startMs: start,
    bucketMs: 86_400_000,
    spanMs: days * 86_400_000,
    unitName: 'day',
  };
}

