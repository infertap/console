// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The serving engineer's words for the wire's words.
 *
 * **Presentation only, one direction.** Wire and spec names never change — they ride the
 * contract, the drill links and the exports — and every map here translates them at the last
 * moment before the glass. A term missing from a map renders as itself rather than throwing,
 * because an unknown wire word is still a fact, and hiding it would be worse than showing it.
 */

/**
 * The closed class set. "ETR" on the glass was an acronym nobody outside this repo could
 * expand, and a class label a reader has to look up is a figure they cannot check.
 */
export const CLASS_LABELS: Record<string, string> = {
  ETR: 'evicted, then recomputed',
  post_clear: 'recomputed after cache clear',
  cold: 'first compute (cold)',
  re_admit: 're-admitted',
  RE: 'engine-labelled reuse',
  indeterminate: 'unclassifiable',
};

/** The words on glass for a class, or the wire word where none is defined. */
export function classLabel(cls: string): string {
  return CLASS_LABELS[cls] ?? cls;
}

/** The two registers, as the reader meets them on the page. */
export const REGISTER_LABELS: Record<string, string> = {
  recompute: 'recomputed prefill',
  capacity: 'duplicate KV footprint',
};

/** The words on glass for a register. */
export function registerLabel(register: string): string {
  return REGISTER_LABELS[register] ?? register;
}

/** Metric names the changed endpoint sends, where they differ from the reader's words. */
const METRIC_LABELS: Record<string, string> = {
  'repeat compute': 'recomputed prefill',
  'fraction of stored mass': 'share of tokens stored',
};

/**
 * The words on glass for a metric name, falling back to the class labels and then the wire word.
 */
export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? CLASS_LABELS[metric] ?? metric;
}

/**
 * One rank, in the serving engineer's own words: engine and data-parallel rank. The cache
 * group appears only when the fleet actually has more than one, because for the common
 * single-group fleet it is noise wearing precision's clothes.
 */
export function rankLabel(
  holder: { instance: string; dp_rank: number; group_idx: number },
  multiGroup: boolean,
): string {
  const base = `${holder.instance} · rank ${holder.dp_rank}`;
  return multiGroup ? `${base} · group ${holder.group_idx}` : base;
}

/**
 * Where a drill's rows came from: a block's history re-derived from the log, or a holder's
 * newest stores as the analysis classified them. Each by name, because the two reach back
 * differently and the reach beside it is read against it. An unknown wire word renders as
 * itself, the rule this file states at the top.
 */
export const READ_FROM_LABELS: Record<string, string> = {
  log: 're-derived from the log',
  ring: "from the holder's newest stores",
};

/** The words on glass for where a drill's rows came from. */
export function readFromLabel(readFrom: string): string | null {
  return READ_FROM_LABELS[readFrom] ?? `read from ${readFrom}`;
}
