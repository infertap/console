// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The honest-states vocabulary.
 *
 * Five words, and no sixth. State words on glass come only from here and always render as
 * provenance-labelled chips, because the difference between "we looked and it is fine" and "we
 * never looked" is the whole product.
 */

/** The five state words, in declaration order. */
export const HONEST_STATES = [
  /** Observed, within its declared bounds. */
  'fine',
  /** Observed, and degraded. Carries a blast radius and a remedy wherever it renders. */
  'impaired',
  /** No analysis has covered this. It is not a zero and never renders as one. */
  'unexamined',
  /** Observed, and the observation does not settle the question. */
  'indeterminate',
  /** The subject reported once and does not now. A departure, not an outage. */
  'unobserved',
] as const;

/** One of the five honest states. */
export type HonestState = (typeof HONEST_STATES)[number];

const KNOWN = new Set<string>(HONEST_STATES);

/**
 * Narrow a state word the server sent.
 *
 * `RunRow.state` and `run_states` arrive as free strings, so a build of the analyzer that grows
 * a sixth word would otherwise render as a blank chip or a crash. It returns `null` instead, and
 * the caller renders the raw word marked unrecognised. Inventing `fine` for something we do not
 * understand is the one outcome this product may never produce.
 */
export function asHonestState(raw: string): HonestState | null {
  return KNOWN.has(raw) ? (raw as HonestState) : null;
}

/**
 * Whether a state is one the trust strip must surface at every altitude.
 *
 * Summaries compress volume, never valence: an impaired or unexamined count appears in the
 * summary whenever it exists, however small it is against the total.
 */
export function isDegraded(state: HonestState): boolean {
  return state === 'impaired' || state === 'unexamined';
}
