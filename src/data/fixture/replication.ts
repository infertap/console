// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The replication corpus: cached token-hours held in more than one place at once.
 *
 * **Contract-shaped**: `/v1/residual/replication` speaks the panel's window tongue, with the four copy bands as named fields, the members table
 * fleet-first, the remedy split, and the exact mean-copies pair. This corpus renders those
 * bytes; `test/fixture-parity.test.ts` validates them against the committed contract.
 *
 * **A time integral, not a daily maximum.** A token-time lands in the band of its simultaneous
 * copy count, so the figure sums across days, workloads and fleets and never refuses a window
 * total: the exact properties the max-k residual lacked, which is why this superseded it.
 *
 * **k=1 dominates, and that is the honest picture rather than the flattering one.** The mean's
 * denominator is ALL cached token-time, so a fleet that is mostly unique reads a mean just
 * above one. The scripted rates keep that true: duplicated mass is under five percent of cached
 * mass, and the mean moves only in the second decimal, which is exactly why it was demoted
 * from glass to hover.
 */

import type {
  InstanceDuplicationData,
  InstanceDupRowJson,
  ReplicationData,
  WhaleJson,
} from '../../domain/contract';
import { COPY_BANDS } from '../../domain/lens';
import { DAY_MS, MIN_MS, type WindowDesc } from '../../domain/windows';
import { atGrain, customWindow, presetWindow } from './windows';
import { HOLDERS, STORED_SHARES, WASTE_FULL, TODAY } from './world';

/** The series edge, shared with the thrash corpus: one tap seal behind the wall clock. It is
 * also `emitted_to_ms`: the producer's emission frontier, the honest uncertainty of an
 * integral that carries no coverage figure. */
export const EDGE_MS = Date.parse(`${TODAY}T15:00:00Z`);

const HOUR_MS = 3_600_000;

/** The fleet's daily rates. Duplicated mass is a small share of cached mass, deliberately. */
export const DUP_TH_DAY = 11_400;
export const CACHED_TH_DAY = 250_600;
export const MEAN_COPIES = 1.06;
export const CROSS_ENGINE_SHARE = 0.71;
/**
 * The third remedy bucket's share: duplicated mass that exists only because a
 * hybrid model splits its layers into separate KV cache groups. Architecture, never waste; the
 * corpus scripts a hybrid minority so the state renders. Within-engine gets the remainder.
 */
export const CACHE_GROUP_SHARE = 0.08;

/**
 * The copies cut, by workload, fleet row first as the wire orders it. rag-batch carries the
 * fat tail: its shared preambles materialise on many nodes, which is the case the panel
 * exists for.
 */
export const COPIES_CUTS = [
  { key: 'fleet', label: 'fleet', share: 1, profile: [0.58, 0.27, 0.11, 0.04] },
  { key: 'rag-batch', label: 'rag-batch', share: 0.52, profile: [0.44, 0.31, 0.17, 0.08] },
  { key: 'chat-prod', label: 'chat-prod', share: 0.31, profile: [0.68, 0.24, 0.07, 0.01] },
  { key: 'code-assist', label: 'code-assist', share: 0.11, profile: [0.79, 0.17, 0.04, 0] },
  { key: 'undeclared', label: 'undeclared', share: 0.06, profile: [0.74, 0.2, 0.05, 0.01] },
] as const;

/**
 * The heaviest duplicated identities, in the wire's own shape. The identities are the blocks
 * corpus's own, so the drill from a whale lands on a block page that exists: one world, never
 * authored twice.
 */
export const WHALES: readonly WhaleJson[] = [
  { identity: 'b4a1', dup_token_ms: 1840 * HOUR_MS, held_token_ms: 2350 * HOUR_MS, n_tokens: 48_128, dup_token_ms_bound: 0, days_in_cut: 14 },
  { identity: 'b4c6', dup_token_ms: 1212 * HOUR_MS, held_token_ms: 1810 * HOUR_MS, n_tokens: 31_744, dup_token_ms_bound: 0, days_in_cut: 14 },
  { identity: 'b4eb', dup_token_ms: 760 * HOUR_MS, held_token_ms: 1490 * HOUR_MS, n_tokens: 24_576, dup_token_ms_bound: 0, days_in_cut: 14 },
  {
    identity: 'b510',
    dup_token_ms: 431 * HOUR_MS,
    held_token_ms: 980 * HOUR_MS,
    n_tokens: 12_288,
    // Out of two days' cuts: short by at most those days' floors.
    dup_token_ms_bound: 38 * HOUR_MS,
    days_in_cut: 12,
  },
];

/** Identity-days with duplicated time over the stamped window's settled days. */
export const WHALE_IDENTITY_DAYS = 4_120;

/** Each settled day's cut. */
export const WHALE_CUT = 1_000;

const rng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

type Member = (typeof COPIES_CUTS)[number];

function seriesFor(member: Member, desc: WindowDesc): readonly (readonly number[])[] {
  const r = rng(9977 + member.key.length + desc.n * 7);
  return Array.from({ length: desc.n }, (_, i) => {
    const hh = new Date(desc.startMs + (i + 0.5) * desc.bucketMs).getUTCHours();
    // Diurnal shape on sub-day buckets only: a whole-day bucket's midpoint is always midday,
    // and boosting every day by the noon factor would inflate the window total it must sum to.
    const diurnal =
      desc.bucketMs < DAY_MS ? 1 + 0.35 * Math.sin(((hh - 8) / 24) * 2 * Math.PI) : 1;
    const total =
      DUP_TH_DAY * member.share * (desc.bucketMs / DAY_MS) * diurnal * (0.9 + r() * 0.2);
    return member.profile.map((p) => total * Math.max(0.004, p + (r() - 0.5) * 0.02));
  });
}

/** The stops the endpoint fixes, plus the two contract window grammars. */
function descFor(spec: string): WindowDesc {
  if (spec === '48h' || spec === '3h') return presetWindow(spec, EDGE_MS);
  const rel = /^(\d+)d$/.exec(spec);
  if (rel?.[1]) {
    const days = Math.min(Number(rel[1]), 90);
    const base = presetWindow('14d', EDGE_MS);
    return {
      ...base,
      n: days,
      startMs: base.startMs + (14 - days) * DAY_MS,
      spanMs: days * DAY_MS,
      rangeLabel: `${days} d`,
    };
  }
  const abs = /^(\d+),(\d+)$/.exec(spec);
  if (abs?.[1] && abs[2]) return customWindow(Number(abs[1]), Number(abs[2]), EDGE_MS);
  return presetWindow('14d', EDGE_MS);
}

/** The corpus's `/v1/residual/replication` bytes. */
export function replicationResponse(query: {
  window?: string;
  grain?: string;
  workload?: string;
}): ReplicationData {
  // An explicit tier is honored verbatim, as the server honors it; `auto` and absence ladder
  // by span against the corpus's reach.
  const laddered = descFor(query.window ?? '14d');
  const desc =
    query.grain === 'minute' || query.grain === 'hour' || query.grain === 'day'
      ? atGrain(laddered, query.grain)
      : laddered;
  const member =
    COPIES_CUTS.find((m) => m.key === (query.workload ?? 'fleet')) ?? (COPIES_CUTS[0] as Member);
  const series = seriesFor(member, desc);
  const rows = series.map((bands, i) => ({
    bucket_ms: desc.startMs + i * desc.bucketMs,
    k2: (bands[0] ?? 0) * HOUR_MS,
    k34: (bands[1] ?? 0) * HOUR_MS,
    k58: (bands[2] ?? 0) * HOUR_MS,
    k9: (bands[3] ?? 0) * HOUR_MS,
  }));
  const dup = rows.reduce((a, row) => a + row.k2 + row.k34 + row.k58 + row.k9, 0);
  const held = CACHED_TH_DAY * (desc.spanMs / DAY_MS) * HOUR_MS;
  return {
    register: 'capacity',
    never_summed_with: ['recompute'],
    unit: 'token_ms',
    grain: desc.grain,
    bucket_ms: desc.bucketMs,
    start_ms: desc.startMs,
    end_ms: desc.startMs + desc.spanMs,
    ...(desc.derived === undefined ? {} : { derived: desc.derived }),
    ...(member.key === 'fleet' ? {} : { workload: member.key }),
    window_dup_token_ms: dup,
    rows,
    members: COPIES_CUTS.map((m) => ({
      key: m.key,
      label: m.label,
      share: m.share,
      profile: [...m.profile],
    })),
    // The remedy split partitions the selected cut's duplicated mass, disjointly, three ways:
    // cross-engine (routing policy), within-engine across ranks (placement), and cache-group
    // (a hybrid model's architecture, which no policy removes).
    cross_engine_token_ms: dup * CROSS_ENGINE_SHARE,
    within_engine_token_ms: dup * (1 - CROSS_ENGINE_SHARE - CACHE_GROUP_SHARE),
    cache_group_token_ms: dup * CACHE_GROUP_SHARE,
    // The exact mean-copies pair: a real summed measure, never a midpoint approximation. The
    // corpus scripts the pair so the quotient is the scripted mean.
    copies_token_ms: MEAN_COPIES * held,
    window_held_token_ms: held,
    emitted_to_ms: EDGE_MS,
    // A positive cross-engine figure is its own evidence (spec 5.7); the basis states the
    // fleet's scripted stores beside it.
    zero_basis: {
      meaning: 'positive',
      instances: 16,
      stores: 48_000,
      comparable_stores: 48_000,
      key_spaces: 1,
    },
  };
}

// ── One node's internal duplication ──────────────────────────────────────────────────────────

/**
 * The emitted band spellings this table carries — the analyzer's own vocabulary, `2`, `3`,
 * `4`, `5-8`, `9-16`, `17+` — each with the copy count its rows' `copies_token_ms`
 * contribution is summed at and its share of a bucket's duplicated mass. The shares sum to
 * one and fall off with the count, so the panel's top band draws thin and present. Band `1`
 * is held-once mass and never appears: one copy is no relationship to classify.
 */
const DUP_BANDS: readonly (readonly [string, number, number])[] = [
  ['2', 2, 0.55],
  ['3', 3, 0.2],
  ['4', 4, 0.09],
  ['5-8', 6, 0.1],
  ['9-16', 12, 0.04],
  ['17+', 24, 0.02],
];

/**
 * The hybrid minority: the nodes whose model splits its layers into separate KV cache groups,
 * so cache-group mass exists there and nowhere else. Scripted by name because the holders
 * corpus gives every instance a `g1` holder and so cannot express hybridness structurally;
 * zero on every other node is the reachable single-group state.
 */
const HYBRID_INSTANCES: ReadonlySet<string> = new Set(['i-005', 'i-017', 'i-063']);

/**
 * A deterministic unit-interval hash of one instant under one seed: the corpus's stand-in
 * for the producer's per-cell variation. Keyed on the absolute instant rather than drawn in
 * sequence, so a minute's mass is the same whichever window or grain enumerates it, which is
 * what lets the hour rows BE the minute rows summed.
 */
function hash01(seed: number, at: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(at / MIN_MS), 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * `/v1/instances/{instance}/duplication`: the mass one node held more than once inside itself.
 *
 * **A different question from the fleet's copies histogram, not a slice of it.** Cross-engine
 * mass is absent by construction — it belongs to no single node — and `cannot_tell_you` says
 * so. The corpus scripts each node's within-ranks mass off its waste share and concentrates
 * the fleet's cache-group mass on the hybrid minority, both normalised so the per-instance
 * halves sum to the fleet remedy buckets: one world, never authored twice. An instance the
 * corpus has never seen returns empty rows, which is a MEASURED zero.
 *
 * **Two grains, one producer.** The minute cell is the unit: each
 * minute's mass is a function of its own instant, and an hour row is its sixty minutes
 * summed, so the same ask served at minute and at hour agree to the token, the law the
 * analyzer pins (`instance_tiers_agree`). An explicit `minute` or `hour` is honored verbatim;
 * `day` reads the hourly cut and says `hour`; absent, the ask ladders by span the way the
 * copies read does, so a `3h` ask answers minute-wide rows and a `2d` ask hour rows.
 */
export function instanceDuplicationResponse(
  instance: string,
  query: { window?: string; grain?: string },
): InstanceDuplicationData {
  const laddered = descFor(query.window ?? '14d');
  const asked =
    query.grain === 'minute' || query.grain === 'hour' ? atGrain(laddered, query.grain) : laddered;
  const grain = asked.grain === 'minute' ? 'minute' : 'hour';
  const bucketMs = grain === 'minute' ? MIN_MS : HOUR_MS;
  const startMs = Math.floor(asked.startMs / bucketMs) * bucketMs;
  const endMs = asked.startMs + asked.spanMs;
  const held = HOLDERS.filter((h) => h.instance === instance);
  const share = held.reduce((a, h) => a + h.tokens, 0) / WASTE_FULL;
  const hybrid = HYBRID_INSTANCES.has(instance);
  const hybridShare = HOLDERS.filter((h) => HYBRID_INSTANCES.has(h.instance)).reduce(
    (a, h) => a + h.tokens / WASTE_FULL,
    0,
  );

  // One minute's share of a daily rate: the diurnal curve at that minute, an hour-wide
  // variation its sixty minutes share, and a smaller variation of the minute's own.
  const seed = [...instance].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 4242);
  const minuteShape = (at: number): number => {
    const hh = (at % DAY_MS) / HOUR_MS;
    const diurnal = 1 + 0.35 * Math.sin(((hh - 8) / 24) * 2 * Math.PI);
    const hourly = 0.85 + 0.3 * hash01(seed, Math.floor(at / HOUR_MS) * HOUR_MS);
    const own = 0.92 + 0.16 * hash01(seed ^ 0x5bd1e995, at);
    return (MIN_MS / DAY_MS) * diurnal * hourly * own;
  };
  // A bucket's shape is its minutes' shapes summed: one at minute grain, sixty at hour.
  const bucketShape = (at: number): number => {
    let sum = 0;
    for (let m = at; m < at + bucketMs; m += MIN_MS) sum += minuteShape(m);
    return sum;
  };

  const rows: InstanceDupRowJson[] = [];
  let within = 0;
  let group = 0;
  let copies = 0;
  if (share > 0) {
    const withinPerDay = DUP_TH_DAY * (1 - CROSS_ENGINE_SHARE - CACHE_GROUP_SHARE) * share;
    const groupPerDay = hybrid
      ? DUP_TH_DAY * CACHE_GROUP_SHARE * (share / hybridShare)
      : 0;
    for (let at = startMs; at < endMs; at += bucketMs) {
      const shape = bucketShape(at);
      for (const [locality, perDay] of [
        ['within', withinPerDay],
        ['group', groupPerDay],
      ] as const) {
        if (perDay === 0) continue;
        const bucketTotal = perDay * shape * HOUR_MS;
        for (const [band, count, bandShare] of DUP_BANDS) {
          const tokenMs = bucketTotal * bandShare;
          if (tokenMs <= 0) continue;
          rows.push({ bucket_ms: at, copies_band: band, locality, token_ms: tokenMs });
          if (locality === 'within') within += tokenMs;
          else group += tokenMs;
          copies += tokenMs * count;
        }
      }
    }
  }

  return {
    register: 'capacity',
    never_summed_with: 'recompute',
    instance,
    // The served grain and its width, stated: a 3 h panel knows its bars are minute-wide.
    grain,
    bucket_ms: bucketMs,
    start_ms: startMs,
    end_ms: endMs,
    within_ranks_token_ms: within,
    cache_groups_token_ms: group,
    copies_token_ms: copies,
    // The denominator: ALL token-time this node held over the window,
    // held-once included, so within/held is the ratified fraction. The node's held mass
    // takes the STORED_SHARES shape: cache work spreads with traffic, not with the
    // recompute power law, which is what lets busy and wasteful separate here too.
    held_token_ms:
      CACHED_TH_DAY * (STORED_SHARES.get(instance) ?? 0) * ((endMs - startMs) / DAY_MS) * HOUR_MS,
    rows,
    cannot_tell_you:
      'duplication SPANNING engines, which belongs to no single node and would double on any sum across instances; the fleet copies histogram carries that half',
  };
}

export function replicationInvariants(): readonly { name: string; holds: boolean }[] {
  const workloads = COPIES_CUTS.filter((m) => m.key !== 'fleet');
  const fleet = replicationResponse({ window: '14d' });
  const threeHours = replicationResponse({ window: '3h' });
  const sum = (xs: readonly number[]): number => xs.reduce((a, x) => a + x, 0);
  return [
    {
      name: 'every profile spans the four bands and sums to one',
      holds: COPIES_CUTS.every(
        (m) => m.profile.length === COPY_BANDS.length && Math.abs(sum([...m.profile]) - 1) < 0.006,
      ),
    },
    {
      name: 'the members ride fleet-first and the workloads partition the fleet',
      holds:
        COPIES_CUTS[0]?.key === 'fleet' &&
        Math.abs(sum(workloads.map((m) => m.share)) - 1) < 0.001,
    },
    {
      name: 'duplicated mass stays a small share of cached mass',
      holds: fleet.window_dup_token_ms / fleet.window_held_token_ms < 0.05,
    },
    {
      name: 'the mean-copies pair divides to a mean just above one',
      holds: (() => {
        const mean = fleet.copies_token_ms / fleet.window_held_token_ms;
        return mean > 1 && mean < 1.2;
      })(),
    },
    {
      name: 'the three remedy buckets partition the duplicated mass disjointly',
      holds:
        Math.abs(
          fleet.cross_engine_token_ms +
            fleet.within_engine_token_ms +
            fleet.cache_group_token_ms -
            fleet.window_dup_token_ms,
        ) < 1,
    },
    {
      name: 'the 3 h stop serves minute buckets, in the one grain vocabulary, ending at the edge',
      holds:
        threeHours.grain === 'minute' &&
        threeHours.bucket_ms === MIN_MS &&
        threeHours.rows.length === 180 &&
        threeHours.end_ms === EDGE_MS,
    },
    {
      name: 'the whales rank worst first, by duplicated token-time',
      holds: WHALES.every(
        (w, i) => i === 0 || (WHALES[i - 1]?.dup_token_ms ?? 0) >= w.dup_token_ms,
      ),
    },
    {
      name: 'a whale never claims more duplicated time than it was held at all',
      holds: WHALES.every((w) => w.dup_token_ms <= w.held_token_ms),
    },
    {
      name: 'the rows are a cut of a larger population, and the population says so',
      holds: WHALE_IDENTITY_DAYS > WHALES.length,
    },
    {
      name: 'a bounded whale says how far short it may be, and an exact one says nothing',
      holds: WHALES.every((w) => (w.dup_token_ms_bound > 0) === (w.days_in_cut < 14)),
    },
    {
      name: 'a whale is drillable: its identity is a block id of the blocks corpus shape',
      holds: WHALES.every((w) => /^b[0-9a-f]{3}$/.test(w.identity)),
    },
  ];
}
