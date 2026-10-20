// SPDX-License-Identifier: AGPL-3.0-only
/**
 * One coherent synthetic world, ported from `mockups/assets/data-v2.js`.
 *
 * **Nothing here is authored twice.** Every number on every page derives from this file, because
 * a platform engineer cross-checks arithmetic instinctively and the demo dies the moment two
 * pages disagree. The invariants at the bottom are asserted by `world.test.ts` rather than
 * logged, which is the difference between a claim and a check.
 *
 * **Deterministic by construction.** A seeded LCG and a fixed `TODAY`, so the corpus is the same
 * bytes on every machine and a visual snapshot means something. No `Date.now()` reaches this
 * file or anything it feeds.
 */

// ── Time ─────────────────────────────────────────────────────────────────────────────────────

export const TODAY = '2026-08-03';
export const TREND_DAYS = 90;

const DAY_MS = 86_400_000;
const todayMs = Date.parse(`${TODAY}T00:00:00Z`);

/** Day index 0 is the oldest day in the trend; `TREND_DAYS - 1` is today. */
export function dayDate(i: number): string {
  return new Date(todayMs - (TREND_DAYS - 1 - i) * DAY_MS).toISOString().slice(0, 10);
}

export function dayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function dayIndex(date: string): number {
  return TREND_DAYS - 1 - Math.round((todayMs - dayStartMs(date)) / DAY_MS);
}

/** The mock's LCG, kept verbatim so the corpus renders the shapes the mock was reviewed at. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ── Three populations, three visibly different numbers ───────────────────────────────────────

export const POPULATIONS = {
  /** Physical engines the taps sit beside. The smallest of the three. */
  instances: 120,
  /** `(instance, dp_rank, cache group)` tuples that reported. */
  holdersSeen: 469,
  /** Of those, the ones a pass has covered. */
  holdersListable: 468,
  /** Reported, never covered. Listed as unexaminable rather than omitted. */
  holdersUnexamined: 1,
  /** Incarnations. A restarted instance is a new run, so this exceeds holders. */
  runs: 480,
} as const;

// ── The ledger everything derives from ───────────────────────────────────────────────────────

export const CLASSES = ['ETR', 'post_clear'] as const;
export type WasteClass = (typeof CLASSES)[number];
export type WindowHalf = 'later' | 'earlier';

interface ClassLedger {
  readonly later: number;
  readonly earlier: number;
  readonly cov: Record<WindowHalf, number>;
  readonly ev: Record<WindowHalf, number>;
}

export const LEDGER: Record<WasteClass, ClassLedger> = {
  ETR: {
    later: 1_596_102,
    earlier: 1_465_102,
    cov: { later: 0.995, earlier: 0.985 },
    ev: { later: 21_486, earlier: 19_722 },
  },
  post_clear: {
    later: 584_340,
    earlier: 537_452,
    cov: { later: 0.984, earlier: 0.971 },
    ev: { later: 8258, earlier: 7626 },
  },
};

export const STORED: Record<WindowHalf, number> = { later: 703_368_387, earlier: 690_535_862 };

export const sumTokens = (w: WindowHalf): number =>
  CLASSES.reduce((a, c) => a + LEDGER[c][w], 0);
export const sumEvents = (w: WindowHalf): number =>
  CLASSES.reduce((a, c) => a + LEDGER[c].ev[w], 0);
/** Token-weighted, over exactly the classes summed. */
export const coverageOf = (w: WindowHalf): number =>
  CLASSES.reduce((a, c) => a + LEDGER[c][w] * LEDGER[c].cov[w], 0) / sumTokens(w);
export const classFull = (c: WasteClass): number => LEDGER[c].later + LEDGER[c].earlier;
export const classCoverageFull = (c: WasteClass): number =>
  (LEDGER[c].later * LEDGER[c].cov.later + LEDGER[c].earlier * LEDGER[c].cov.earlier) / classFull(c);

export const WASTE_FULL = sumTokens('later') + sumTokens('earlier');
export const STORED_FULL = STORED.later + STORED.earlier;
export const COVERAGE_FULL =
  CLASSES.reduce((a, c) => a + classFull(c) * classCoverageFull(c), 0) / WASTE_FULL;
export const EVENTS_FULL = sumEvents('later') + sumEvents('earlier');

export const WINDOWS = {
  later: { start: '2026-07-28', end: TODAY, days: 7 },
  earlier: { start: '2026-07-21', end: '2026-07-27', days: 7 },
} as const;

/** The document's stamped window: the 14 days the two halves cover between them. */
export const WINDOW_14D = { start: '2026-07-21', end: TODAY, days: 14 } as const;

/** The same window, anchored to wherever the frontier currently sits. */
export function stampedWindow(age: AgeScript): { start: string; end: string; days: number } {
  const end = frontierIndex(age);
  return {
    start: dayDate(end - WINDOW_14D.days + 1),
    end: dayDate(end),
    days: WINDOW_14D.days,
  };
}

export const DECLARED_THRESHOLD = 0.01;
export const RAW_HORIZON_DAYS = 14;

// ── Seams. The date is derived from the day index, so the two can never disagree. ────────────

export interface Seam {
  readonly id: string;
  readonly day: number;
  readonly dagger: string;
  readonly provenance: 'observed' | 'recorded';
  readonly label: string;
  /** Whether rows either side are one quantity. Decided here as the server decides it. */
  readonly breaks: boolean;
  readonly kind: string;
  readonly from: string;
  readonly to: string;
  readonly ledger: string;
  readonly at: string;
}

const RAW_SEAMS: readonly Omit<Seam, 'at'>[] = [
  {
    id: 'js-6',
    day: 34,
    dagger: '†',
    provenance: 'observed',
    label: 'js-5 to js-6',
    breaks: true,
    kind: 'semantics_version',
    from: 'js-5',
    to: 'js-6',
    ledger:
      'The join semantics changed. Rows either side are computed under different rules and are not one quantity.',
  },
  {
    // Was `w_refetch 12h to 24h` until that parameter was deleted outright: the class is now
    // decided by the close's reason alone and the gap rides beside it as a measure, so there is
    // no attribution window to key on and the token's `w` segment left with it. The seam this
    // demo needs is a real discriminating parameter, and the examined-history horizon is one:
    // it decides what `cold` MEANS, so two passes over identical records under different
    // horizons genuinely produce different class counts. Token format is `s{skew}x{history}`.
    id: 'examined-history',
    day: 60,
    dagger: '‡',
    provenance: 'recorded',
    label: 'examined history 3 d to 7 d',
    breaks: true,
    kind: 'classification parameter',
    from: 's1000x259200000',
    to: 's1000x604800000',
    ledger:
      'The examined history widened, so a store whose prior close sits further back is now seen rather than read as a first compute. Rows either side are different quantities. Written by the analyzer as a system annotation.',
  },
  {
    id: 'router-2-3',
    day: 85,
    dagger: '§',
    provenance: 'recorded',
    label: 'deploy router v2.3',
    breaks: false,
    kind: 'deploy annotation',
    from: 'router v2.2',
    to: 'router v2.3',
    ledger:
      'A fleet change, not a measurement change. The series continues across it and rows either side are one quantity.',
  },
];

export const SEAMS: readonly Seam[] = RAW_SEAMS.map((s) => ({ ...s, at: dayDate(s.day) }));

/**
 * Declared deployments, at minute precision.
 *
 * The v3 attribution interaction exists for these: an operator records a label and an instant,
 * per fleet, and the platform infers no blast radius. Both sit on the corpus's newest day so the
 * 3 h and 48 h lens views have a marker to draw and a before/after to compute: the affinity
 * change lands 40 minutes before the series edge, which is what exercises the "after span still
 * filling" state. A deploy never breaks the series; the breaking seams above stay the only
 * splits.
 */
export interface Deploy {
  readonly id: string;
  readonly atMs: number;
  /** The instant on glass, raw UTC. */
  readonly at: string;
  readonly label: string;
  readonly from: string;
  readonly to: string;
}

export const DEPLOYS: readonly Deploy[] = [
  {
    id: 'engine-0-9-4',
    atMs: Date.parse(`${TODAY}T09:12:00Z`),
    at: '09:12Z',
    label: 'engine 0.9.4 rollout',
    from: 'engine 0.9.3',
    to: 'engine 0.9.4',
  },
  {
    id: 'affinity-weights',
    atMs: Date.parse(`${TODAY}T14:20:00Z`),
    at: '14:20Z',
    label: 'router affinity weights 0.3 to 0.6',
    from: 'affinity 0.3',
    to: 'affinity 0.6',
  },
];

export const SEMANTICS_CURRENT = 'js-6';
export const SEMANTICS_PRIOR = 'js-5';
export const DISCRIMINATOR_CURRENT = 'w86400000s1000mnx259200000';
export const DISCRIMINATOR_PRIOR = 'w43200000s1000mnx259200000';
export const FLEET_ID = 'prod-usc1';
export const ANALYZER_VERSION = '0.9.4';

/**
 * The meaning pair in force on a given day.
 *
 * Two breaking seams sit inside the 90-day trend, so the window carries three generations. The
 * oldest is under superseded semantics and this process states no figures for it at all.
 */
export function meaningAt(dayIdx: number): {
  semantics_version: string;
  discriminator: string;
} {
  return {
    semantics_version: dayIdx < 34 ? SEMANTICS_PRIOR : SEMANTICS_CURRENT,
    discriminator: dayIdx < 60 ? DISCRIMINATOR_PRIOR : DISCRIMINATOR_CURRENT,
  };
}

// ── Holders. 468 rows summing exactly to the full window figure. ─────────────────────────────

export interface Holder {
  readonly id: string;
  readonly instance: string;
  readonly dp_rank: number;
  readonly group_idx: number;
  readonly workload: string;
  readonly tokens: number;
  readonly etr: number;
  readonly post_clear: number;
  readonly events: number;
  readonly coverage: number;
  readonly state: 'fine' | 'impaired' | 'indeterminate';
  /**
   * The server's status judgment, computed at read time, in the wire's two words plus a reason.
   *
   * **Deliberately uncorrelated with `coverage`.** They answer different questions and neither
   * implies the other, so the corpus carries both crossings explicitly: a holder with high
   * coverage that is silent now, and a holder active now whose window was poorly covered. A
   * fixture that derived this from coverage would let a tautology back onto the glass by the
   * same door the last one came in.
   */
  readonly status: 'active' | 'inactive';
  readonly statusReason: 'stopped' | 'silent' | 'ungraded' | null;
  readonly model: string | null;
}

/**
 * The workload token shares the dashboard's cut scaffolding scripts. The holders corpus fills
 * toward these targets so the two authorings agree: an instance carries ONE workload (its
 * ranks share the tap's declaration), instances are assigned greedily by mass to the workload
 * with the largest remaining deficit, and the fill lands within about a percent of target.
 */
const WORKLOAD_SHARE_TARGETS: readonly (readonly [string, number])[] = [
  ['rag-batch', 0.41],
  ['chat-prod', 0.38],
  ['code-assist', 0.12],
  ['undeclared', 0.09],
];

export const HOLDERS: readonly Holder[] = (() => {
  const r = rng(31415);
  const n = POPULATIONS.holdersListable;
  const raw: number[] = [];
  for (let i = 0; i < n; i++) raw.push(Math.pow(i + 1, -0.75) * (0.92 + r() * 0.16));
  const k = WASTE_FULL / raw.reduce((a, b) => a + b, 0);
  const pre: Omit<Holder, 'workload'>[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const tokens = i === n - 1 ? WASTE_FULL - acc : Math.round((raw[i] ?? 0) * k);
    acc += tokens;
    const impaired = i >= 5 && i <= 16;
    const indeterminate = i >= 22 && i <= 27;
    const etr = Math.round(tokens * (0.68 + r() * 0.14));
    pre.push({
      id: `h${String(i + 1).padStart(3, '0')}`,
      instance: `i-${String((i % POPULATIONS.instances) + 1).padStart(3, '0')}`,
      dp_rank: Math.floor(i / POPULATIONS.instances) % 8,
      group_idx: Math.floor(i / 240) % 2,
      tokens,
      etr,
      post_clear: tokens - etr,
      events: Math.round(tokens / (58 + r() * 26)),
      coverage: impaired ? 0.44 + r() * 0.16 : 0.94 + r() * 0.058,
      state: impaired ? 'impaired' : indeterminate ? 'indeterminate' : 'fine',
      // Crossed against coverage on purpose. Rows 0-2 are well covered and SILENT, which is the
      // case a coverage column can never show. Rows 5-8 are poorly covered and ACTIVE, the
      // reverse. Row 40 stopped cleanly, which is a rolling deploy and must not read as a
      // problem. The ungraded rows never declared themselves.
      status: i <= 2 || i === 40 || indeterminate ? 'inactive' : 'active',
      statusReason:
        i <= 2 ? 'silent' : i === 40 ? 'stopped' : indeterminate ? 'ungraded' : null,
      model: indeterminate ? null : 'meta-llama/Llama-3.1-70B-Instruct',
    });
  }

  // The greedy fill: heaviest instance first, into the workload furthest below its target.
  const nodeMass = new Map<string, number>();
  for (const h of pre) nodeMass.set(h.instance, (nodeMass.get(h.instance) ?? 0) + h.tokens);
  const filled = new Map(WORKLOAD_SHARE_TARGETS.map(([w]) => [w, 0]));
  const assigned = new Map<string, string>();
  for (const [instance, mass] of [...nodeMass.entries()].sort((a, b) => b[1] - a[1])) {
    let best = WORKLOAD_SHARE_TARGETS[0]?.[0] ?? 'undeclared';
    let bestDeficit = -Infinity;
    for (const [w, target] of WORKLOAD_SHARE_TARGETS) {
      const deficit = (target - (filled.get(w) ?? 0) / WASTE_FULL) / target;
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        best = w;
      }
    }
    assigned.set(instance, best);
    filled.set(best, (filled.get(best) ?? 0) + mass);
  }

  return pre.map((h) => ({ ...h, workload: assigned.get(h.instance) ?? 'undeclared' }));
})();

/**
 * Per-instance share of STORED mass: near-uniform with jitter, deliberately NOT the recompute
 * power law. Recompute concentrates where placement went wrong; total cache work spreads with
 * routed traffic. Keeping the two shapes different is what gives per-node recompute RATES a
 * story: a node can be busy without being wasteful, and the rate view must separate them.
 */
export const STORED_SHARES: ReadonlyMap<string, number> = (() => {
  const r = rng(777);
  const weights = new Map<string, number>();
  let sum = 0;
  for (let i = 0; i < POPULATIONS.instances; i++) {
    const w = 0.7 + r() * 0.6;
    weights.set(`i-${String(i + 1).padStart(3, '0')}`, w);
    sum += w;
  }
  return new Map([...weights.entries()].map(([id, w]) => [id, w / sum]));
})();

export const HOLDER_STATE_COUNTS: Readonly<Record<string, number>> = HOLDERS.reduce<
  Record<string, number>
>((a, x) => {
  a[x.state] = (a[x.state] ?? 0) + 1;
  return a;
}, {});

export function holderById(id: string): Holder {
  return HOLDERS.find((x) => x.id === id) ?? (HOLDERS[0] as Holder);
}

// ── Producer runs. Staleness is per run, which is why this is not the holder count. ──────────

export interface RunGroup {
  readonly state: string;
  readonly label: string;
  readonly count: number;
  readonly basis: string;
}

/**
 * Counts keyed by the wire's most specific status word, as `state_counts` keys them. The old
 * idle-or-stalled population folds into `active`: its heartbeat is current, and an engine
 * being quiet is a different question the status no longer conflates.
 */
export const RUNS: readonly RunGroup[] = [
  { state: 'active', label: 'heartbeating', count: 468, basis: 'within the platform threshold' },
  {
    state: 'silent',
    label: 'silent, no stop record',
    count: 5,
    basis: 'past the platform threshold',
  },
  { state: 'stopped', label: 'stopped cleanly', count: 6, basis: 'agent_stop observed' },
  { state: 'ungraded', label: 'never declared', count: 1, basis: 'no agent_start observed' },
];

// ── The four ages. One layout, four states. ──────────────────────────────────────────────────

export interface AgeScript {
  readonly key: 't0' | 't1' | 't2' | 't3';
  readonly label: string;
  readonly at: string;
  readonly atMs: number;
  readonly passes: number;
  /**
   * How many days a pass has classified, counted back from the frontier.
   *
   * A pass walks every dirty day its window covers, oldest to newest, and emits each one,
   * so the frontier day is examined the moment one pass has run. The examined days are the
   * newest `examinedDays` ending at the frontier, at every age; days older than that are
   * unexamined until a later pass reaches them.
   */
  readonly examinedDays: number;
  readonly segments: number;
  readonly events: number;
  readonly lagMs: number | null;
  readonly note: string;
  /**
   * How many days the frontier has advanced past the corpus's anchor day.
   *
   * Zero for every scripted age. A completed pass advances it, which is what makes the
   * slide-forward a real change in the data rather than an animation over a fixed series: a day
   * that did not exist becomes the live edge, and the window ending at the frontier moves with
   * it. The mock could only ever redraw the same 90 points.
   */
  readonly frontierOffset?: number;
}

const clockMs = (hhmm: string): number => Date.parse(`${TODAY}T${hhmm}:00Z`);

export const AGE_SCRIPT: Record<AgeScript['key'], AgeScript> = {
  t0: {
    key: 't0',
    label: 't0 install',
    at: '13:04Z',
    atMs: clockMs('13:04'),
    passes: 0,
    examinedDays: 0,
    segments: 0,
    events: 0,
    lagMs: null,
    note: 'installed, no segment relayed',
  },
  t1: {
    key: 't1',
    label: 't1 ingesting',
    at: '13:41Z',
    atMs: clockMs('13:41'),
    passes: 0,
    examinedDays: 0,
    segments: 37,
    events: 18_412_992,
    lagMs: 214_000,
    note: 'relaying, no pass yet',
  },
  t2: {
    key: 't2',
    label: 't2 first pass',
    at: '14:01Z',
    atMs: clockMs('14:01'),
    passes: 1,
    // One completed pass: the frontier day and the eight before it. The stamp names the
    // frontier day at this age, and every pass-derived read agrees with it: the figures,
    // the ranks and the duplication all answer over a window ending at the frontier.
    examinedDays: 9,
    segments: 44,
    events: 22_106_880,
    lagMs: 148_000,
    note: 'first pass complete',
  },
  t3: {
    key: 't3',
    label: 't3 steady state',
    at: '14:02Z',
    atMs: clockMs('14:02'),
    passes: 612,
    examinedDays: 88,
    segments: 4412,
    events: 2_147_006_144,
    lagMs: 112_000,
    note: 'steady',
  },
};

/** The absolute day index of the newest classified day. */
export function frontierIndex(age: AgeScript): number {
  return TREND_DAYS - 1 + (age.frontierOffset ?? 0);
}

/** The day the frontier sits on. */
export function frontierDay(age: AgeScript): string {
  return dayDate(frontierIndex(age));
}

/**
 * The newest day whose final whole re-derivation ran (analyzer grain ladder §4.8.2): the day
 * before the frontier in this corpus, because the frontier day is still being classified at
 * ingest cadence while the completed day behind it has been restated from the full model.
 */
export function auditedThroughDay(age: AgeScript): string {
  return dayDate(frontierIndex(age) - 1);
}

/**
 * The same age, one pass later.
 *
 * A pass classifies one more day and moves the frontier onto it, so the examined count rises
 * with the offset. Nothing else about the age changes: this is the corpus advancing, not a
 * different scenario.
 */
export function advanced(age: AgeScript, passes = 1): AgeScript {
  return {
    ...age,
    frontierOffset: (age.frontierOffset ?? 0) + passes,
    passes: age.passes + passes,
    examinedDays: Math.min(age.examinedDays + passes, TREND_DAYS),
  };
}

// ── The trend. Days no pass has covered hatch; they never render as zero. ────────────────────

export interface TrendPoint {
  readonly day: number;
  readonly date: string;
  readonly value: number;
  readonly coverage: number;
  readonly examined: boolean;
}

export function trendFor(age: AgeScript): readonly TrendPoint[] {
  const r = rng(20260803);
  const out: TrendPoint[] = [];
  const end = frontierIndex(age);
  const start = end - TREND_DAYS + 1;
  for (let i = start; i <= end; i++) {
    let b = 0.0042 - i * 0.0000135;
    if (i > 34) b -= 0.0004;
    if (i > 60) b += 0.0006;
    if (i > 85) b += 0.0011;
    let cov = 0.965 + r() * 0.032;
    if (i >= 44 && i <= 51) cov = 0.41 + r() * 0.09;
    // The examined days end at the frontier at every age: a pass walks every dirty day its
    // window covers and emits each one, so the frontier day exists the moment one pass has
    // run. t2 used to keep its frontier day unexamined while the stamp named it and the
    // ranks and duplication reads answered over it, a state no analyzer produces. Days
    // older than the examined history are unexamined until a later pass reaches them.
    const examined = age.examinedDays > 0 && i > end - age.examinedDays;
    out.push({
      day: i,
      date: dayDate(i),
      value: Math.max(0.0004, b + (r() - 0.5) * 0.0009),
      coverage: cov,
      examined,
    });
  }
  return out;
}

// ── Ingest health, per source ────────────────────────────────────────────────────────────────

export interface CoverageBySource {
  readonly source: string;
  readonly windowTime: number;
  readonly tokenWeighted: number;
  readonly state: 'fine' | 'impaired';
}

export const COVERAGE_BY_SOURCE: readonly CoverageBySource[] = (() => {
  const r = rng(5150);
  const out: CoverageBySource[] = [];
  for (let i = 0; i < 12; i++) {
    const low = i === 2 || i === 7;
    out.push({
      source: `i-${String(3 + i * 11).padStart(3, '0')}`,
      windowTime: low ? 0.38 + r() * 0.12 : 0.951 + r() * 0.047,
      tokenWeighted: low ? 0.52 + r() * 0.14 : 0.966 + r() * 0.032,
      state: low ? 'impaired' : 'fine',
    });
  }
  return out;
})();

export const MODELS = { observed: POPULATIONS.instances - 8, unobserved: 8 } as const;

// ── Preflight facts, listed by the verdict section before any pass has run ───────────────────

export const PREFLIGHT: readonly (readonly [string, string])[] = [
  ['engine', 'clickhouse 24.8.4.13 pinned'],
  ['data directory', 'exclusive lock held'],
  ['declared GPUs', '480 of 500 envelope'],
  ['endpoints', '12 declared, 12 reachable'],
  ['deterministic hashing', 'PYTHONHASHSEED fixed on 12 of 12'],
  ['observed models', 'pending first subscribe'],
  ['archive lifecycle', 'enabled, re-projection horizon 365 d'],
  ['semantics_version', SEMANTICS_CURRENT],
  ['raw horizon', '14 d floor'],
  ['action threshold', '1.00% declared'],
];

// ── Invariants. If one of these fails the corpus is lying somewhere. ─────────────────────────

export interface Invariant {
  readonly name: string;
  readonly holds: boolean;
}

export function invariants(): readonly Invariant[] {
  const holderSum = HOLDERS.reduce((a, x) => a + x.tokens, 0);
  const runSum = RUNS.reduce((a, x) => a + x.count, 0);
  const stateSum = Object.values(HOLDER_STATE_COUNTS).reduce((a, b) => a + b, 0);
  return [
    { name: 'later + earlier = full window', holds: sumTokens('later') + sumTokens('earlier') === WASTE_FULL },
    {
      name: 'ETR + post_clear = full window',
      holds: CLASSES.reduce((a, c) => a + classFull(c), 0) === WASTE_FULL,
    },
    { name: 'sum(holders) = full window', holds: holderSum === WASTE_FULL },
    { name: 'holder states total the listable count', holds: stateSum === POPULATIONS.holdersListable },
    { name: 'run states total the run count', holds: runSum === POPULATIONS.runs },
    { name: 'runs exceed holders', holds: POPULATIONS.runs > POPULATIONS.holdersSeen },
    { name: 'holders exceed instances', holds: POPULATIONS.holdersSeen > POPULATIONS.instances },
    { name: 'every seam is in the past', holds: SEAMS.every((s) => s.at <= TODAY) },
    { name: 'seam dates match their day indices', holds: SEAMS.every((s) => dayDate(s.day) === s.at) },
    {
      name: 'each holder splits into its two classes',
      holds: HOLDERS.every((h) => h.etr + h.post_clear === h.tokens),
    },
  ];
}
