// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Definitions, ported from `DEFS` in `mockups/assets/data-v2.js`.
 *
 * **These are product copy, not fixture data**, which is why they live here rather than in the
 * corpus: they are equally true in live mode, and a definition that only existed alongside
 * synthetic numbers would vanish exactly when a real reader needed it.
 *
 * Every entry answers the same four questions, in the same order, because a definition that
 * teaches the axis is one a reader can check a figure against:
 *
 * - **measures** — what the quantity is, in the fleet's own terms.
 * - **computed** — how it is derived, naming the inputs.
 * - **basis** — which coverage basis qualifies it. Two figures at 80% on different bases are
 *   not comparable, so this is never omitted.
 * - **bound** — what it is a bound ON, and what would move it.
 *
 * A definition never reads the shape of the data. "Rising since Tuesday" is an interpretation
 * and belongs nowhere in this product.
 */

export interface Definition {
  readonly measures: string;
  readonly computed: string;
  readonly basis: string;
  readonly bound: string;
}

export const DEFINITIONS = {
  repeat_compute: {
    measures:
      'Tokens that were stored, evicted or cleared, and then stored again on the same engine: prefill the fleet paid for more than once. Your engine\'s hit rate answers a different question, over a different denominator: it counts lookups that found a block, against lookups made. This counts tokens computed a second time. A fleet can hold a high hit rate and carry a large figure here, and neither number implies the other.',
    computed:
      'Sum of n_tokens over stores classified "evicted, then recomputed" or "recomputed after cache clear" (wire classes ETR, post_clear). A store counts when its block had a prior observed close on the same engine, within the history the analysis examined. The class is decided by that close\'s reason alone; no attribution window is applied, and the gap rides beside the class as its own measure. Copies held across engines are not here: they count under Duplicate KV footprint and are never added to this figure.',
    basis: 'Token-weighted. sum(coverage x tokens) / sum(tokens) over exactly the classes summed.',
    bound: 'Lower bound. Unobserved mass is not counted and is not estimated.',
  },
  fraction: {
    measures: 'Recomputed prefill as a share of all tokens stored in the window.',
    computed:
      'recomputed prefill / total stored, both measured over the same window, the same ranks and the same analysis version.',
    basis: 'Token-weighted, carried from the numerator.',
    bound: 'Lower bound. The denominator is also a floor.',
  },
  threshold: {
    measures: 'The action threshold declared in your configuration.',
    computed: 'Not computed. Declared, and drawn as a rule across the measured mass.',
    basis: 'Declared input. It is your value, rendered as yours.',
    bound: 'None. A declared threshold is true regardless of what has been measured.',
  },
  trend: {
    measures: 'Daily recomputed prefill as a fraction of tokens stored, one point per day.',
    computed:
      'Read from the banked daily rollup. Days no analysis has covered are hatched, never zeroed, and days under a superseded analysis version are hatched with their reason.',
    basis: 'Token-weighted per day. The ribbon below the series is that day coverage.',
    bound: 'Rollup retention. Daily rows age to monthly under the existing TTL.',
  },
  seams: {
    measures: 'Points where the meaning of the series changed.',
    computed:
      'Observed seams come from semantics_version and key_epoch in the record stream. Recorded seams come from the annotations stream, including parameter changes the analyzer writes itself.',
    basis: 'Provenance is labelled per marker: observed, or recorded.',
    bound:
      'Rows either side of a breaking seam are different quantities and are never summed. A deploy marks the series and does not break it.',
  },
  delta: {
    measures: 'The difference between two windows of the same quantity.',
    computed:
      'Later window minus earlier window, both read from the same rollup at the same grain and paired on a shared analysis version.',
    basis:
      'Each window carries its own coverage. The two are never blended, so a delta between figures of unequal confidence stays legible as one.',
    bound:
      'Comparison windows must contain no breaking change and share an analysis version. Where a breaking change falls inside one, the window scopes to its longest clean range, or the comparison is refused.',
  },
  replication: {
    measures:
      'Cached token-hours held in more than one place at once, decomposed by how many copies existed. The cross-engine share is routing and affinity; the within-engine share is that engine\'s own eviction pressure.',
    computed:
      'Residency intervals per content identity, integrated over time; a token-hour lands in the band of its simultaneous copy count.',
    basis:
      'Time integral. Sums across days, workloads and fleets, unlike a daily maximum, and never refuses a window total.',
    bound:
      'Cross-engine comparability requires a shared model group; non-comparable stores are excluded, never counted as unique.',
  },
  pairs: {
    measures: 'Which engine pairs co-held the same content, and for how many token-hours per day.',
    computed:
      'Pair-observed co-residency integrated per day; the matrix sums rank pairs to engine pairs and says how many it summed. A marked corner is a cell under 75% pair-observed time.',
    basis:
      'Day grain deliberately: pair count is quadratic in fleet, so minutes live on the linear fleet series and days on the pairs.',
    bound:
      'Identity never enters a rollup: it lives one drill down, inside the raw window.',
  },
  thrash: {
    measures:
      'Repeat-compute token mass, decomposed by how long the block had been evicted before the fleet paid to store it again. Short bands are churn; long bands are coincidental re-use a larger cache would not have held.',
    computed:
      'The gap is observed per store: the store instant minus the observed prior close. Mass lands in a fixed band at the instant the recompute landed, which is when the cost was paid. The class is the close reason: ETR where capacity evicted the block, post_clear where an announced cache flush removed it, so post_clear is episodic by nature and near zero outside a flush. An engine restart announces nothing and is neither: those stores are cold, by evidence.',
    basis:
      'Two bases, each honest about what it weighs. Tokens weigh the bill: where the recomputed mass sits, dominated by the heavy blocks. Events weigh the typical block: what the population of stores experiences, which is the number a policy is tuned against, since eviction acts per block and not per token. Both are sums, so any cut and any window merge exactly, and the bands are fixed fleet to fleet, so the figure compares.',
    bound:
      'The 72 h lookback right-censors gaps: mass with no observed prior close (first-seen, or gone longer than 72 h, indistinguishable by construction) renders as the gap-unobserved gauge, beside the bands and never in the stack. No recovery claim: what a larger cache would have held is a counterfactual and stays off glass.',
  },
  ledger: {
    measures:
      'Both registers as one contiguous span with every marker on it. A marker is a declared deployment (operator-recorded: a label and an instant, per fleet) or a system-recorded measurement change; the platform infers no blast radius. Scope is your lens: cut to the workload you deployed to, and the selected marker\'s equal spans shade on that series.',
    computed:
      'Minute-bucket sums. Before and after are means over the shaded spans; the after span may still be filling for a recent marker. Deltas are neutral ink with a sign: whether a movement is good news is a conclusion the meter has no basis for.',
    basis:
      'Event-time buckets. Late segments correct by addition, identity-scoped. A marker that breaks the series splits the line and refuses its comparison: rows either side are not one quantity.',
    bound:
      'Arrives in tap-seal batches, so the edge trails the wall clock by one seal. Minute buckets are not minute latency.',
  },
  placement: {
    measures:
      'Token-hours of the same content resident in two places at the same time: across two engines, or across two data-parallel ranks inside one engine.',
    computed:
      'Time-integrated overlap between pairs, summed per workload over the days in the window. Day rows sum, which is what separates this from a distribution: quantiles cannot be combined that way and these can.',
    basis:
      'Pair-observed time at instance grain: the intersection of both engines\' observed telemetry over the day. A gap on one rank inside an engine is invisible at this grain, so a cell can read fully covered while a rank under it was dark.',
    bound:
      'Derivation budget. A day whose pair set exceeded it is named as refused rather than counted as zero, and is not in any total on this panel.',
  },
  holders: {
    measures:
      'Recomputed prefill per rank: one engine, one data-parallel rank, one cache group.',
    computed: 'The daily rollup at full rank grain, summed over the window.',
    basis: 'Token-weighted per rank.',
    bound:
      'Rank grain is banked, so this survives the raw horizon. Event-grain drill does not.',
  },
  blocks: {
    measures:
      'The individual blocks the most recomputed tokens landed on, and how many ranks stored each one over the window.',
    computed:
      'Recomputed prefill summed per block identity, ranked. The rank count is uniqExact over the window.',
    basis: 'Token-weighted for the mass. The rank count is a distinct count and carries no coverage of its own.',
    bound:
      'Ranks that STORED it, never ranks that held it at one instant. A block that moved around the fleet counts high here and low under a co-residency test, so a high count is dispersion of computation and not a claim that copies existed together. Duplicate KV footprint is the figure that answers the second question. Raw-window-bounded, so a block older than the horizon is not here.',
  },
  evidence: {
    measures: 'The individual store records a figure was computed from.',
    computed: 'Event grain, read from classified stores joined to the record stream.',
    basis: 'Observed records. This is the terminal level: there is nothing beneath it.',
    bound:
      'Raw-window-bounded. Evidence is retained about 14 days, so a drill past that horizon returns nothing and says so with its bound.',
  },
  ingest: {
    measures: 'Segments relayed by the taps and acknowledged by the analyzer.',
    computed:
      'Counted from the batches ledger. Lag is now minus the newest acknowledged segment end.',
    basis: 'Observed. Nothing here is a scrape.',
    bound: 'Pending segments are in flight, not lost.',
  },
  odometer: {
    measures: 'Records observed since install.',
    computed: 'Cumulative count over acknowledged segments.',
    basis: 'Observed. It counts records relayed, not records that existed.',
    bound: 'Starts at install. It cannot see what happened before the tap ran.',
  },
  window_time: {
    measures: 'Whether telemetry was arriving over the window at all, as observed time.',
    computed: 'Summed covered_ms from the coverage rollup, per engine.',
    basis: 'Observed time. This is not the basis of any token figure.',
    bound: 'A fleet can look fully observed here and sit at 40% token-weighted, or the reverse.',
  },
  status: {
    measures: 'Whether a rank\'s tap is feeding data: the server\'s judgment, fresh at every read.',
    computed:
      'Facts land at ingest; the verdict is computed by the server at read time, per request, against real now and one fixed platform heartbeat threshold. The reason rides beside it exactly when inactive: a clean stop, a silence, or a process that never declared itself. Silence produces no ingest event, which is why the verdict is never frozen at the last heartbeat.',
    basis:
      'Coverage qualifies this row\'s figures over the window. Status qualifies the rank now. They answer different questions and one does not imply the other.',
    bound:
      'A rank can carry high coverage and still be silent now, or be active now with poor coverage over the window.',
  },
  internal_duplication: {
    measures:
      'The cached mass one node held more than once inside itself, as duplicated token-time, by how many copies it held at once and by where the copies sat: across the node\'s data-parallel ranks, or across one rank\'s KV cache groups. The headline share is that mass across ranks over all the mass the node held.',
    computed:
      'From the producer\'s copy-count bands, scoped to this node, at the grain the head states: minute-wide inside the minute tier\'s reach, hour-wide beyond it. The two halves mean opposite things. Across ranks is real waste with a real lever: two ranks are two independent caches on one machine, and the engine\'s own balancer routes by load with no prefix term, so identical prefixes scatter by default; a gateway that sets the rank by prefix affinity removes it. Across cache groups is a hybrid model\'s architecture: each group caches the prefix independently, and no routing or placement change removes it.',
    basis:
      'Exact through the producer\'s emission frontier; no coverage figure, by statement rather than omission.',
    bound:
      'Duplication SPANNING engines is absent by construction: it belongs to no single node and would double on any sum across instances. The fleet copies histogram carries that half.',
  },
  identity_concentration: {
    measures:
      'One slice\'s recompute over one window, cut by block identity: how much of the mass the heaviest identity carried, how many distinct identities there were, and the worst of them ranked.',
    computed:
      'Summed over every event in the slice and window server-side, never from a page of records: a reader cannot count repeats across thousands of rows, so the surface does. Identities are the engine\'s own cache keys; content never leaves the fleet, and the cache hits and misses on exactly this granularity, so nothing capacity-relevant is missing from an opaque id.',
    basis: 'Token mass, with event counts beside it. Shares denominate over the slice\'s whole recompute in the window.',
    bound:
      'A high top share is one hot block churning (pinning, prefix-affinity routing and residency are the levers); a low share over many identities is breadth (capacity and admission are). Same mass, opposite remedies, and only identity tells them apart.',
  },
  entity_scope: {
    measures:
      'One slice of the fleet: a declared workload, one instance, or one rank, with the same figures the fleet page carries, scoped server-side.',
    computed:
      'Scope says which slice to answer about; the cut says how to group inside it. The model is facets, not a tree: an instance id is a label the operator typed, a workload is declared per producer run and one instance can wear two labels in a window, so nothing above the rank is derivable and no containment is asserted.',
    basis: 'Each figure on the page states its own basis; scope changes the slice, never the basis.',
    bound:
      'A slice the fleet never matched renders as looked-and-found-nothing, not as a zero over something.',
  },
  delivery: {
    measures: 'Of the telemetry segments the taps produced, how many arrived, since install.',
    computed:
      "Sequence accounting per tap process: segments are numbered gap-free from zero, so expected is the highest number seen or declared, plus one. Captured counts arrivals; declared losses are the tap's own drop confessions; the remainder is missing without a declaration.",
    basis: 'Segment-denominated, since install. Not a token figure and never weighted by one.',
    bound:
      "Claims nothing past each tap's last word: a segment newer than anything seen or declared is invisible until it arrives.",
  },
  staleness: {
    measures: 'Which tap processes are not heartbeating, and for how long past the threshold.',
    computed:
      'Judged by the server at read time against real now. Agents heartbeat on one fixed platform contract, and one platform threshold decides silence: no learned rhythms, no client thresholds, ever.',
    basis:
      'Per process (incarnation). A rolling deploy reads as a clean stop and a new arrival, never a fleet outage.',
    bound:
      'Silent means past the threshold with no stop record: the absence of the goodbye is the signal. Ungraded means the process never declared itself, a coverage gap rather than a health claim.',
  },
  coverage_bases: {
    measures:
      'Both coverage bases per engine. Instance-time: was telemetry present at all. Token-weighted: at what coverage the mass was observed.',
    computed:
      'Instance-time = covered time / window time. Token-weighted = coverage summed over tokens / tokens.',
    basis:
      'An engine can sit high on one basis and low on the other: a few blind minutes that held most of the mass. The divergence is the diagnostic.',
    bound: 'Stamped window.',
  },
  model_identity: {
    measures:
      'Which engines carry a declared model identity, which is what fences cross-engine comparisons.',
    computed:
      'Declared via the kv-events topic template (kv@pod@model) or a model key in --provenance: the same value that feeds the engine\'s launch, so serving breaks before the label drifts. Never probed, never guessed; absence stays null.',
    basis: 'Cross-engine findings (duplication, placement) compare only within a shared model group.',
    bound:
      'An undeclared engine\'s cross-engine findings are indeterminate; its per-engine figures are unaffected.',
  },
  trust: {
    measures: 'Whether the meter was looking, and how much of it is reporting now.',
    computed:
      'Capture since install from arrival facts, token-weighted coverage over the window, plus per-tap-process staleness states at analysis time.',
    basis: 'Both bases appear and are labelled. They are not interchangeable.',
    bound:
      'A summary compresses volume, never valence. Impaired and unexamined counts appear here whenever they exist.',
  },
} as const satisfies Record<string, Definition>;

export type DefinitionKey = keyof typeof DEFINITIONS;
