// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { combine, type Resource } from '../../data/react';
import type { CoverageData, HealthData, RosterData, Stamped } from '../../domain/contract';
import type { HonestState } from '../../domain/state';
import { DEFAULT_WINDOW, stopLabel } from '../../domain/windows';
import { integer, percent } from '../../design-system/format/numbers';
import { Block, Section } from '../../design-system/layout/Block';
import { Link } from '../../design-system/navigation/router';
import { Refusal } from '../../design-system/refusal/Refusal';
import { WireStateChip } from '../../design-system/state/StateChip';
import styles from './Trust.module.css';

/**
 * Section 3: trust, compact. **The warrant, not a value panel.**
 *
 * This answers one question: was the instrument looking, and how
 * much of it is reporting now. The tile is INSTANCE-TIME coverage, deliberately not
 * token-weighted: the token-weighted figure already renders once, on the anchor line beside the
 * mass it qualifies, and a second render would be the de-duplication rule broken at the exact
 * place it was first enforced. Delivery detail moved to health, one click away.
 *
 * **Summaries compress volume, never valence.** The impaired and unexamined counts appear here
 * whenever they exist, at every age, however small against the total.
 */

/**
 * The wire's status-count keys, in render order: the measured good first, then the reasons that
 * qualify it. The chip mark's honest-state hue is a painting choice this side owns; the words
 * are the server's.
 */
const ORDER = ['active', 'silent', 'stopped', 'ungraded'] as const;

const CHIP_STATE: Readonly<Record<string, HonestState>> = {
  active: 'fine',
  silent: 'impaired',
  stopped: 'unobserved',
  ungraded: 'indeterminate',
};

const MEANING: Readonly<Record<string, string>> = {
  active: 'active',
  silent: 'silent: heartbeats missed, no stop record',
  stopped: 'stopped cleanly',
  ungraded: 'never declared',
};

export function TrustSection({
  coverage,
  roster,
  health,
  holdersCovered,
}: {
  coverage: Resource<Stamped<CoverageData>>;
  roster: Resource<Stamped<RosterData>>;
  health: Resource<Stamped<HealthData>>;
  /** Ranks a pass covered, from the holders page total. Named for what it counts. */
  holdersCovered: number;
}): ReactNode {
  const all = combine(coverage, roster, health);

  return (
    <Section name="Trust" id="trust" definition="trust">
      <Block head="roster and coverage">
        {all.status === 'failed' ? (
          all.error.isNotYetMeasured ? (
            <p className={styles['awaiting']}>
              Coverage is measured over an analysis, so it has nothing to state yet. The tap
              roster is observed continuously and fills as taps report.
            </p>
          ) : (
            <Refusal
              refusal={{
                cause: all.error.cause ?? 'engine_unavailable',
                message: all.error.message,
                ...(all.error.bound === undefined ? {} : { bound: all.error.bound }),
              }}
            />
          )
        ) : all.status === 'ready' ? (
          <TrustBody
            coverage={all.value[0].data}
            roster={all.value[1].data}
            health={all.value[2].data}
            holdersCovered={holdersCovered}
          />
        ) : null}
      </Block>
    </Section>
  );
}

function TrustBody({
  coverage,
  roster,
  health,
  holdersCovered,
}: {
  coverage: CoverageData;
  roster: RosterData;
  health: HealthData;
  holdersCovered: number;
}): ReactNode {
  // Instance-time: was telemetry present at all. Covered time over window time, fleet-wide.
  const covered = coverage.rows.reduce((a, r) => a + r.covered_ms, 0);
  const windowMs = coverage.rows.reduce((a, r) => a + r.window_ms, 0);
  const counts = roster.state_counts ?? {};
  const runs = roster.producer_runs ?? 0;
  const engines = health.models.observed + health.models.undeclared;

  const ordered = ORDER.filter((state) => (counts[state] ?? 0) > 0).map(
    (state) => [state, counts[state] as number] as const,
  );
  // A count key this bundle does not know still renders, marked, rather than being dropped
  // from a summary that claims to be complete.
  const unknown = Object.entries(counts).filter(([state]) => !(ORDER as readonly string[]).includes(state));

  return (
    <>
      <div className={styles['tiles']}>
        {(
          [
            [
              windowMs > 0 ? percent(covered / windowMs, 1) : 'none yet',
              'instance-time coverage',
              'covered time ÷ window time · was telemetry present. The token-weighted basis renders on the anchor line, beside the mass it qualifies.',
            ],
            [
              integer(holdersCovered),
              `ranks observed · ${stopLabel(DEFAULT_WINDOW)}`,
              'one rank = instance × data-parallel rank × cache group · the denominator of every figure above',
            ],
            [integer(engines), 'engines', 'physical engines the taps sit beside'],
            [
              integer(runs),
              'tap processes',
              'a restarted engine is a new tap process · staleness is judged per process',
            ],
          ] as const
        ).map(([value, unit, tip]) => (
          <div key={unit} title={tip}>
            <div className={`${styles['tileValue']} tabular`}>{value}</div>
            <div className={styles['tileUnit']}>{unit}</div>
          </div>
        ))}
      </div>

      <div className={styles['chips']}>
        {ordered.map(([state, count]) => (
          <WireStateChip
            key={state}
            raw={CHIP_STATE[state] ?? state}
            provenance="at read time"
            value={`${integer(count)} ${MEANING[state] ?? state}`}
            size="small"
          />
        ))}
        {/* A state word this bundle does not know still renders, marked, rather than being
            dropped from a summary that claims to be complete. */}
        {unknown.map(([state, count]) => (
          <WireStateChip
            key={state}
            raw={state}
            provenance="unrecognised"
            value={integer(count)}
            size="small"
          />
        ))}
        <span className={styles['detail']}>
          detail on <Link to="/health">health ›</Link>
        </span>
      </div>

      {/* What the roster cannot see, it says itself: the honest render of a population this
          console has no basis to count. */}
      <p className={styles['bound']}>{roster.cannot_tell_you}</p>
    </>
  );
}
