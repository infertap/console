// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactNode } from 'react';
import type { Cause, Figure as CoveredFigure } from '../../domain/contract';
import { HONEST_STATES } from '../../domain/state';
import { Figure, Unmeasured } from '../../design-system/figure/Figure';
import { ALL_CAUSES, Refusal } from '../../design-system/refusal/Refusal';
import { StateChip, WireStateChip } from '../../design-system/state/StateChip';
import styles from './Gallery.module.css';

/**
 * The gallery: **the design system's conformance corpus, and it is permanent.**
 *
 * Not a storybook and not a scratchpad. The honest states are product claims, so a regression in
 * the unexamined hatch is a defect in the same sense a wrong number is: the whole argument of
 * this product is that "we did not measure this" looks different from "we measured zero". This
 * page is where that difference is visible in one screen, and CI snapshots it.
 *
 * Three things it must always show, because all three are states a reader will meet:
 *
 * 1. every honest state, with its provenance, at both sizes;
 * 2. a measured figure and an unmeasured one at the same tier, side by side, so the designed
 *    absence can be compared against the thing it stands in for;
 * 3. **every cause in the closed set**, driven off `ALL_CAUSES` rather than a list typed here.
 *    A cause the analyzer adds appears on this page automatically, which is the only way a
 *    catalogue stays honest as the contract moves.
 */

const SAMPLE: CoveredFigure = {
  value: 4_187_266,
  register: '>=',
  coverage: 0.978,
  coverage_kind: 'token-weighted',
};

const CAPACITY_SAMPLE: CoveredFigure = {
  value: 812_400,
  register: '>=',
  coverage: 0.941,
  coverage_kind: 'token-weighted',
};

/** A message per cause, in the register the analyzer writes them in. */
const SAMPLE_MESSAGE: Readonly<Record<Cause, string>> = {
  unauthenticated: 'no session cookie was presented',
  session_expired: 'the analyzer restarted, and sessions live in its memory',
  engine_unavailable: 'the storage engine did not answer within the read deadline',
  outside_raw_horizon:
    'event grain is retained about 14 days; 2026-06-02 is older than the oldest record this fleet holds',
  grain_unavailable: 'hourly rollups are retained one year, and this window is older',
  superseded_semantics:
    'figures under js-6 are not re-derivable by this process, which runs js-7',
  unlinked_generation: 'no marker links this generation to the one in force',
  request_invalid: 'evidence requires exactly one of `block` or `holder`',
  window_invalid: 'the window did not parse: expected <N>d, or start_ms,end_ms',
  limit_invalid: 'limit must be between 1 and 200',
  subject_missing: 'evidence needs a subject: name a block or a holder',
  dim_unknown: 'dim must be one of class, holder, workload, tenant, model, tier',
  cursor_stale: 'this cursor was minted before the last analysis, and the rows have moved since',
  unknown_holder:
    'the roster is observed, and a holder that never reported leaves no trace here',
  unknown_block: 'no block with that identity appears in the examined window',
  unknown_marker: "no marker with that id appears in this fleet's annotation stream",
  unknown_route: 'no route with that path exists on this API',
  annotation_invalid: 'the label is empty after trimming, and a marker with no words marks nothing',
  bucket_unavailable:
    'this read needs the bucket, and no bucket is attached: the declaration was recorded row-only',
  console_not_configured: 'the daemon was started without --console-dir',
};

const SAMPLE_BOUND: Partial<Record<Cause, unknown>> = {
  outside_raw_horizon: {
    raw_from_day: '2026-07-21',
    declared_days: 14,
    requested_day: '2026-06-02',
  },
  cursor_stale: { current_frontier_day: '2026-08-03', current_discriminator: 'w86400000s1000mnx259200000' },
  limit_invalid: { min: 1, max: 200, requested: 5000 },
  grain_unavailable: { hourly_from_day: '2025-08-05', requested_day: '2025-01-04' },
};

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className={styles['section']}>
      <h2 className={styles['h2']}>{title}</h2>
      <p className={styles['note']}>{note}</p>
      {children}
    </section>
  );
}

/** The gallery: every designed state of every component, for review in one place. */
export default function GalleryRoute(): ReactNode {
  return (
    <main className={styles['page']}>
      <header className={styles['header']}>
        <h1 className={styles['h1']}>Conformance corpus</h1>
        <p className={styles['lead']}>
          Every state this design system can render, on one page. The states are product claims,
          so a change here is a change to what this product asserts. Nothing on this page is fleet
          data.
        </p>
      </header>

      <Section
        title="Honest states"
        note="Five words and no sixth. Every chip carries its provenance, because a state word with no basis is an assertion rather than a measurement."
      >
        <div className={styles['row']}>
          {HONEST_STATES.map((state) => (
            <StateChip key={state} state={state} provenance="at pass time" />
          ))}
        </div>
        <div className={styles['row']}>
          {HONEST_STATES.map((state, i) => (
            <StateChip
              key={state}
              state={state}
              provenance="per run"
              value={String(7 * (i + 1))}
              size="small"
            />
          ))}
        </div>
        <p className={styles['note']}>
          A state word the analyzer sends that this bundle does not know renders as itself,
          marked. Inventing one of the five for something we do not understand is the one outcome
          this product may never produce.
        </p>
        <div className={styles['row']}>
          <WireStateChip raw="fine" provenance="over the window" />
          <WireStateChip raw="quarantined" provenance="over the window" />
        </div>
      </Section>

      <Section
        title="Figures, and the positions they will one day occupy"
        note="A measured figure beside the designed absence that stands in for it, at the same tier. Sections resolve, they never reflow: the position is the same on day one and at steady state."
      >
        <div className={styles['pair']}>
          <Figure value={SAMPLE} unit="tokens" register="recompute" tier="hero" />
          <Unmeasured
            state="unexamined"
            unit="tokens"
            register="recompute"
            tier="hero"
            reason="No analysis has covered this window. There is nothing to classify yet, and a zero here would be a measurement nobody made."
          />
        </div>
        <div className={styles['pair']}>
          <Figure value={SAMPLE} unit="tokens" register="recompute" />
          <Figure value={CAPACITY_SAMPLE} unit="tokens" register="capacity" />
        </div>
        <div className={styles['pair']}>
          <Unmeasured
            state="indeterminate"
            unit="share of tokens stored"
            register="recompute"
            reason="Observed, and the observation does not settle the question."
          />
          <Unmeasured
            state="unobserved"
            unit="tokens"
            register="capacity"
            reason="This holder reported once and does not now. A departure, not an outage."
          />
        </div>
        <div className={styles['row']}>
          <Figure value={SAMPLE} unit="tokens" register="recompute" tier="cell" />
          <Figure
            value={{ ...SAMPLE, value: 0.0042 }}
            unit="fraction"
            register="recompute"
            tier="cell"
            format="percent"
          />
          <Unmeasured
            state="unexamined"
            unit="tokens"
            register="recompute"
            tier="cell"
            reason="not covered"
          />
        </div>
      </Section>

      <Section
        title="Refusals, the whole closed set"
        note="Driven off the cause set itself, so a cause the analyzer adds appears here without anybody remembering to add it. A refusal is a result: it occupies the position the answer would have occupied and states the bound that produced it."
      >
        <div className={styles['stack']}>
          {ALL_CAUSES.map((cause) => (
            <Refusal
              key={cause}
              refusal={{
                cause,
                message: SAMPLE_MESSAGE[cause],
                ...(SAMPLE_BOUND[cause] === undefined ? {} : { bound: SAMPLE_BOUND[cause] }),
              }}
            />
          ))}
          <Refusal
            refusal={{
              cause: 'a_cause_from_a_newer_analyzer' as Cause,
              message: 'this build of the analyzer named a cause this bundle has never heard of',
            }}
          />
        </div>
      </Section>
    </main>
  );
}
