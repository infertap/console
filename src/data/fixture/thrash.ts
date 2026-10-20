// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The thrash corpus: repeat-compute mass, decomposed by how long the block had been evicted.
 *
 * **Contract-shaped**: `/v1/figures/bands` carries the observed bands in rows (four, the
 * examined history being an hour), the cut riding `dims`, and the
 * gap-unobserved mass as its own figure beside the bands, never one of them. This file scripts the cut members and the series; `responses.ts`
 * assembles the wire bytes and `test/fixture-parity.test.ts` validates them.
 *
 * Minute buckets serve at the fleet, workload and model cuts; the holder cut refuses them by
 * name, and the corpus models both. The panel stops `14d`/`48h`/`3h` resolve against the
 * emission frontier through the same window authority as the copies read.
 *
 * The series is scaffolding ported from `mockups/v3/index.html`: rag-batch is the churner, the
 * affinity deploy moves the short bands at the marker, and the win/regression scenarios move
 * them in opposite directions.
 */

import { GAP_BANDS, type CutKey, type CutMember, type ScenarioKey } from '../../domain/lens';
import { DAY_MS, MIN_MS, type WindowDesc } from '../../domain/windows';
import {
  DEPLOYS,
  HOLDERS,
  WASTE_FULL,
  COVERAGE_FULL,
  POPULATIONS,
  TODAY,
  type Holder,
} from './world';

/** The series edge: one tap seal behind the corpus's wall clock, exactly the mock's anchor. */
export const THRASH_EDGE_MS = Date.parse(`${TODAY}T15:00:00Z`);

/**
 * The scripted incident: cache thrashing on ONE node, in one window, led by one rank.
 *
 * From 04:30Z to 09:30Z on the corpus's newest day, `i-004` thrashes: its recompute surges
 * and the gap mix lurches into the short bands, with rank 0 carrying almost all of it. The
 * story every panel should tell without a sentence: the node's rate spikes against the fleet
 * median, the gap composition goes dark at the left bands for those hours, rank 0's line
 * diverges while its peers idle along, and the dashboard's by-instance cut shows the same
 * rank because it is the same corpus. Over by noon, so the 3 h zoom stays the affinity
 * deploy's story.
 */
export const INCIDENT = {
  instance: 'i-004',
  rank: 'i-004/0/0',
  startMs: Date.parse(`${TODAY}T04:30:00Z`),
  endMs: Date.parse(`${TODAY}T09:30:00Z`),
} as const;

/** How much of a bucket the incident covers, 0..1. Day buckets catch their real overlap. */
export function incidentOverlap(bucketStartMs: number, bucketMs: number): number {
  const lo = Math.max(bucketStartMs, INCIDENT.startMs);
  const hi = Math.min(bucketStartMs + bucketMs, INCIDENT.endMs);
  return Math.max(0, hi - lo) / bucketMs;
}

/**
 * The incident's strength for one member key: the surging rank takes it whole, the node
 * aggregate nearly whole (rank 0 dominates the node's mass), the node's other ranks a
 * ripple, everything else nothing.
 */
export function incidentStrength(memberKey: string): number {
  if (memberKey === INCIDENT.rank) return 1;
  if (memberKey === INCIDENT.instance) return 0.85;
  if (memberKey.startsWith(`${INCIDENT.instance}/`)) return 0.15;
  return 0;
}

/**
 * Tokens per store event, per gap band. NOT flat, deliberately: the short bands carry the
 * whales (big shared prefixes that come back fast), the long bands the small-block churn, so
 * the event-weighted mix sits longer than the token-weighted one and the two bases on the
 * composition genuinely differ, as they do in life. Sized to the corpus's toy scale so a
 * node-hour-class-band cell still counts real events: divisors an order larger drowned every
 * cell in the integer floor and flattened the event mix to uniformity.
 */
export const TOKENS_PER_EVENT: readonly number[] = [32, 24, 14, 8];

/**
 * The scripted cache clears: `post_clear` is recompute after an ANNOUNCED flush (the engine's
 * reset-prefix-cache and its kin), so it is episodic by nature. Near-zero in steady state,
 * bursting after each clear and decaying over hours as traffic re-warms the working set. One
 * clear rides the engine 0.9.4 rollout marker (a rollout that flushed the prefix cache); one
 * sits mid-window so the 14 d view carries a second episode. An engine RESTART is not a
 * clear: nothing was announced, and those stores classify as cold, by evidence.
 */
export const CLEARS: readonly { readonly atMs: number; readonly strength: number }[] = [
  { atMs: Date.parse(`${TODAY}T09:12:00Z`), strength: 1 },
  { atMs: Date.parse(`${TODAY}T00:00:00Z`) - 5 * DAY_MS + 11 * 3_600_000, strength: 0.7 },
];

const CLEAR_DECAY_MS = 3 * 3_600_000;

/** The clear burst at one instant: Σ of decaying episodes, clamped to one. */
function clearBurstAt(t: number): number {
  let burst = 0;
  for (const c of CLEARS) {
    if (t >= c.atMs) burst += c.strength * Math.exp(-(t - c.atMs) / CLEAR_DECAY_MS);
  }
  return Math.min(1, burst);
}

/** Per-band steady-state post_clear share: rare scoped clears leave a trace, no more. */
const POST_CLEAR_BASE: readonly number[] = [0.01, 0.01, 0.02, 0.03];
/** Per-band burst share: right after a flush, the mid bands are mostly rebuild. */
const POST_CLEAR_BURST: readonly number[] = [0.4, 0.5, 0.75, 0.8];

/**
 * The `post_clear` share of one (bucket, band) cell, integrated over the bucket by sampling:
 * a day bucket containing a clear shows the episode diluted by the day, an hour bucket right
 * after it shows the rebuild nearly whole, and a bucket far from any clear shows the near-
 * zero baseline Cort's question predicted.
 */
export function postClearShare(band: number, bucketStartMs: number, bucketMs: number): number {
  const samples = 4;
  let burst = 0;
  for (let i = 0; i < samples; i++) {
    burst += clearBurstAt(bucketStartMs + ((i + 0.5) / samples) * bucketMs);
  }
  burst /= samples;
  return Math.min(0.9, (POST_CLEAR_BASE[band] ?? 0.03) + burst * (POST_CLEAR_BURST[band] ?? 0.6));
}

const DAILY_WASTE = WASTE_FULL / 14;

/**
 * The gap-unobserved share: mass with no observed prior close. First stored in the window, or
 * gone longer than the hour's lookback, indistinguishable by construction. It rides BESIDE the
 * bands, never in the stack, and the corpus scripts it as a share of the window's mass.
 */
export const GAP_UNOBSERVED_SHARE = 0.14;

const FLEET_PROFILE = [0.049, 0.059, 0.639, 0.253] as const;

const rng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

/**
 * A deterministic band profile for a world-derived member: the fleet profile, drifted by a
 * seed off the member's key and renormalised. Scripted variety, not measurement: the holders
 * corpus carries no per-member band decomposition, and inventing one per key is honest
 * scaffolding as long as it is the SAME invention on every machine.
 */
function driftedProfile(key: string): readonly number[] {
  let seed = 7;
  for (const c of key) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const r = rng(seed);
  const raw = FLEET_PROFILE.map((p) => Math.max(0.01, p * (0.7 + r() * 0.6)));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / sum);
}

const holderTriple = (h: Holder): string => `${h.instance}/${h.dp_rank}/${h.group_idx}`;

/** Token-weighted coverage over a set of holders. */
function coverageOver(holders: readonly Holder[]): number {
  const mass = holders.reduce((a, h) => a + h.tokens, 0);
  if (mass === 0) return COVERAGE_FULL;
  return holders.reduce((a, h) => a + h.coverage * h.tokens, 0) / mass;
}

/**
 * The nodes as cut members, derived from the holders corpus: one member per instance, share
 * from its holders' mass, worst first. Scoped to one workload where asked, which is the
 * entity pages' members read: scope says which slice, dims says how to group.
 */
export function nodeMembers(workload: string | null): readonly CutMember[] {
  const byNode = new Map<string, Holder[]>();
  for (const h of HOLDERS) {
    if (workload !== null && h.workload !== workload) continue;
    const list = byNode.get(h.instance) ?? [];
    list.push(h);
    byNode.set(h.instance, list);
  }
  return [...byNode.entries()]
    .map(([key, holders]) => ({
      key,
      label: key,
      share: holders.reduce((a, h) => a + h.tokens, 0) / WASTE_FULL,
      profile: driftedProfile(key),
      cov: coverageOver(holders),
    }))
    .sort((a, b) => b.share - a.share);
}

/** One node's ranks as cut members: the instance page's finest section, dp_size deep. */
export function rankMembers(instance: string): readonly CutMember[] {
  return HOLDERS.filter((h) => h.instance === instance)
    .map((h) => ({
      key: holderTriple(h),
      label: `${h.instance} / ${h.dp_rank} / g${h.group_idx}`,
      share: h.tokens / WASTE_FULL,
      profile: driftedProfile(holderTriple(h)),
      cov: h.coverage,
    }))
    .sort((a, b) => b.share - a.share);
}

/** One holder as a cut member, or null where the corpus never saw the triple. */
export function holderMember(triple: string): CutMember | null {
  const h = HOLDERS.find((x) => holderTriple(x) === triple);
  if (!h) return null;
  return {
    key: triple,
    label: `${h.instance} / ${h.dp_rank} / g${h.group_idx}`,
    share: h.tokens / WASTE_FULL,
    profile: driftedProfile(triple),
    cov: h.coverage,
  };
}

/**
 * Cut members: share of fleet waste plus a band profile. rag-batch is the churner; the
 * instance cut is the top eight ranks by repeat compute of the listable population, taken
 * from the holders corpus itself so a member row can link to an entity page that exists:
 * one world, never authored twice.
 */
export const CUTS: Readonly<Record<CutKey, readonly CutMember[]>> = {
  fleet: [{ key: 'fleet', label: 'fleet', share: 1, profile: FLEET_PROFILE, cov: COVERAGE_FULL }],
  workload: [
    { key: 'rag-batch', label: 'rag-batch', share: 0.41, profile: [0.07, 0.085, 0.678, 0.167], cov: 0.991 },
    { key: 'chat-prod', label: 'chat-prod', share: 0.38, profile: [0.034, 0.041, 0.625, 0.3], cov: 0.988 },
    { key: 'code-assist', label: 'code-assist', share: 0.12, profile: [0.025, 0.03, 0.528, 0.417], cov: 0.972 },
    { key: 'undeclared', label: 'undeclared', share: 0.09, profile: [0.046, 0.056, 0.577, 0.321], cov: 0.941 },
  ],
  instance: [...HOLDERS]
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 8)
    .map((h) => ({
      key: holderTriple(h),
      label: `${h.instance} / ${h.dp_rank} / g${h.group_idx}`,
      share: h.tokens / WASTE_FULL,
      profile: driftedProfile(holderTriple(h)),
      cov: h.coverage,
    })),
  model: [
    { key: 'llama-70b', label: 'llama-3-70b', share: 0.63, profile: [0.058, 0.07, 0.651, 0.221], cov: 0.992 },
    { key: 'qwen-32b', label: 'qwen-32b', share: 0.31, profile: [0.029, 0.035, 0.59, 0.346], cov: 0.983 },
    { key: 'undeclared', label: 'undeclared', share: 0.06, profile: [0.039, 0.049, 0.6, 0.312], cov: 0.93 },
  ],
};

/** A top-N cut's population, so the glass can name what the eight rows were cut from. */
export const INSTANCE_CUT_POPULATION = POPULATIONS.holdersListable;

/**
 * A member's series over a window: per-bucket totals × profile, drifting.
 *
 * The affinity deploy moves the short bands at its instant, settling over about twelve minutes:
 * down in the win scenario, up in the regression, at full strength in rag-batch, half at fleet,
 * and invisibly elsewhere. That scoping is the scaffolding for "scope is the operator's lens":
 * the same deploy reads differently under different cuts because the effect really is scoped.
 */
export function thrashSeriesFor(
  member: CutMember,
  desc: Pick<WindowDesc, 'n' | 'startMs' | 'bucketMs' | 'unitName' | 'key' | 'spanMs'>,
  scenario: ScenarioKey,
): readonly (readonly number[])[] {
  let seed = 1000 + member.key.length * 31;
  for (const c of `${desc.key}${desc.key === 'custom' ? desc.startMs + desc.spanMs : ''}`) {
    seed += c.charCodeAt(0) * 7;
  }
  const r = rng(seed);
  const affinity = DEPLOYS.find((d) => d.id === 'affinity-weights');
  const affMs = affinity?.atMs ?? THRASH_EDGE_MS;
  const affScope = member.key === 'rag-batch' ? 1 : member.key === 'fleet' ? 0.5 : 0;
  const perCol = (DAILY_WASTE * desc.bucketMs) / DAY_MS;

  const strength = incidentStrength(member.key);

  const rows: number[][] = [];
  for (let i = 0; i < desc.n; i++) {
    const at = desc.startMs + i * desc.bucketMs;
    const t = at + 0.5 * desc.bucketMs;
    let total = perCol * member.share * (0.82 + r() * 0.4);
    const drift =
      desc.unitName === 'day' && desc.n >= 10 ? (i - desc.n / 2) * 0.012 * (14 / desc.n) : 0;
    let shift = 0;
    if (affScope > 0 && t >= affMs) {
      const k = Math.min(1, (t - affMs) / (12 * MIN_MS));
      shift = (scenario === 'reg' ? 0.22 : -0.35) * k * affScope;
    }
    // The diurnal mix: cache pressure peaks mid-afternoon and the gaps shorten with it, so
    // an hour-grain composition breathes instead of holding one flat mix all day.
    if (desc.bucketMs < DAY_MS) {
      const hh = new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
      shift += 0.16 * Math.sin(((hh - 8) / 24) * 2 * Math.PI);
    }
    // The incident: the covered share of the bucket surges and lurches short.
    const surge = incidentOverlap(at, desc.bucketMs) * strength;
    if (surge > 0) {
      total *= 1 + 2.4 * surge;
      shift += 0.9 * surge;
    }
    rows.push(
      member.profile.map((p, b) => {
        const adj =
          b <= 2 ? p * (1 + shift) + drift : Math.max(0.005, p * (1 - shift * 0.4) - drift * 0.66);
        // Per-band jitter, so the MIX wobbles bucket to bucket the way sampled traffic does:
        // a single per-bucket noise term scales every band together and freezes the shares.
        return total * adj * (0.9 + r() * 0.2);
      }),
    );
  }
  return rows;
}

/** The arithmetic the thrash corpus must satisfy, each named, for the world test to assert. */
export function thrashInvariants(): readonly { name: string; holds: boolean }[] {
  const shareSum = (cut: CutKey): number => CUTS[cut].reduce((a, m) => a + m.share, 0);
  const profileSums = Object.values(CUTS)
    .flat()
    .map((m) => m.profile.reduce((a, p) => a + p, 0));
  return [
    {
      name: 'every profile spans the four bands and sums to one',
      holds:
        Object.values(CUTS)
          .flat()
          .every((m) => m.profile.length === GAP_BANDS.length) &&
        profileSums.every((s) => Math.abs(s - 1) < 0.006),
    },
    {
      name: 'the workload and model cuts partition the fleet',
      holds: Math.abs(shareSum('workload') - 1) < 0.001 && Math.abs(shareSum('model') - 1) < 0.001,
    },
    {
      name: 'the instance cut is a top-N, not a partition, and says so',
      holds: shareSum('instance') < 1 && INSTANCE_CUT_POPULATION > CUTS.instance.length,
    },
    {
      name: 'the incident sits inside the newest day and stays out of the 3 h zoom',
      holds:
        INCIDENT.startMs >= Date.parse(`${TODAY}T00:00:00Z`) &&
        INCIDENT.endMs <= THRASH_EDGE_MS - 3 * 3_600_000,
    },
    {
      name: 'the incident rank is a rank the holders corpus knows',
      holds: (() => {
        const [inst, rank, group] = INCIDENT.rank.split('/');
        return HOLDERS.some(
          (h) =>
            h.instance === inst && String(h.dp_rank) === rank && String(h.group_idx) === group,
        );
      })(),
    },
    {
      name: 'the affinity deploy sits inside the 3 h window before the edge',
      holds: (() => {
        const at = DEPLOYS.find((d) => d.id === 'affinity-weights')?.atMs ?? 0;
        return at > THRASH_EDGE_MS - 3 * 3_600_000 && at < THRASH_EDGE_MS;
      })(),
    },
  ];
}
