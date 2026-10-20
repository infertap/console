// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { asHonestState, type HonestState } from '../../domain/state';
import styles from './StateChip.module.css';

/**
 * An honest state, as a provenance-labelled chip.
 *
 * Five words and no sixth. The vocabulary is small on purpose: the difference between "we looked
 * and it is fine" and "we never looked" is the whole product, and a chip that could say anything
 * would erase it.
 *
 * **Provenance is required**, because a state word with no basis is an assertion rather than a
 * measurement. "fine, at pass time" and "fine, right now" are different claims about different
 * clocks, and a chip that omits which one it means is the quiet-wrong class.
 */

/** A state word and the clock it was judged on. */
export interface StateChipProps {
  state: HonestState;
  /** What the state is judged on: "at pass time", "over the window", "per run". */
  provenance: string;
  /** An optional count or fraction the state qualifies. */
  value?: string;
  size?: 'default' | 'small';
}

/** The sentence each state makes when a reader hovers it. Definitions teach the axis. */
export const STATE_MEANING: Readonly<Record<HonestState, string>> = {
  fine: 'Observed, and within its declared bounds.',
  impaired: 'Observed, and degraded. The blast radius and the remedy render beside it.',
  unexamined: 'No analysis has covered this. It is not a zero and never renders as one.',
  indeterminate: 'Observed, and the observation does not settle the question.',
  unobserved: 'It reported once and does not now. A departure, not an outage.',
};

/** A provenance-labelled state chip: one of the five honest states, with what it was judged on. */
export function StateChip({
  state,
  provenance,
  value,
  size = 'default',
}: StateChipProps): ReactNode {
  const classes = [styles['chip'], styles[state], size === 'small' ? styles['small'] : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} title={STATE_MEANING[state]}>
      <span className={styles['mark']} aria-hidden="true" />
      <span className={styles['state']}>{state}</span>
      <span className={styles['provenance']}>{provenance}</span>
      {value !== undefined && <span className={styles['value']}>{value}</span>}
    </span>
  );
}

/**
 * A state word straight off the wire, narrowed before it renders.
 *
 * A build of the analyzer that grows a sixth word arrives here. Inventing `fine` for something we
 * do not understand is the one outcome this product may never produce, so an unrecognised word
 * renders as itself, marked, rather than as any of the five.
 */
export function WireStateChip({
  raw,
  provenance,
  value,
  size = 'default',
}: { raw: string } & Omit<StateChipProps, 'state'>): ReactNode {
  const state = asHonestState(raw);
  if (state) {
    return (
      <StateChip
        state={state}
        provenance={provenance}
        size={size}
        {...(value === undefined ? {} : { value })}
      />
    );
  }
  const classes = [
    styles['chip'],
    styles['unrecognised'],
    size === 'small' ? styles['small'] : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span
      className={classes}
      title="This state word is not one of the five this console knows. The analyzer is newer than this bundle."
    >
      <span className={styles['mark']} aria-hidden="true" />
      <span className={styles['state']}>{raw}</span>
      <span className={styles['provenance']}>unrecognised</span>
    </span>
  );
}
