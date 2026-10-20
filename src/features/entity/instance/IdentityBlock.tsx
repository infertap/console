// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { Resource } from '../../../data/react';
import type { RosterData, RunRow, Stamped } from '../../../domain/contract';
import { clock, day, integer } from '../../../design-system/format/numbers';
import { InfoHover } from '../../../design-system/info/InfoHover';
import { Block } from '../../../design-system/layout/Block';
import { Refusal } from '../../../design-system/refusal/Refusal';
import styles from '../Entity.module.css';

/**
 * The status words, exactly as the Ranks column paints them: state painted verbatim, the
 * reason's alarm level owned by the glass. Judged by the server at read time against real
 * now, one platform threshold, no client thresholds ever.
 */
const REASONS: Readonly<Record<string, { tone: 'faulted' | 'stopped' | 'unheard'; sentence: string }>> = {
  silent: {
    tone: 'faulted',
    sentence: 'silent: past the platform threshold with no stop record. The absence of the goodbye is the signal',
  },
  stopped: {
    tone: 'stopped',
    sentence: 'stopped cleanly: an announced departure, a deploy rather than a fault',
  },
  ungraded: {
    tone: 'unheard',
    sentence: 'never declared itself: a coverage gap rather than a health claim',
  },
};

function StatusWord({ row }: { row: RunRow }): ReactNode {
  if (row.state === 'active') {
    return (
      <span
        className={styles['status']}
        data-tone="active"
        title="heartbeating · judged by the server at read time against real now, one platform threshold"
      >
        <i className={styles['statusMark']} aria-hidden="true" />
        active
      </span>
    );
  }
  const detail = (row.reason != null && REASONS[row.reason]) || {
    tone: 'unheard' as const,
    sentence: 'inactive for a reason this bundle does not know, rendered rather than dropped',
  };
  return (
    <span
      className={styles['status']}
      data-tone={detail.tone}
      title={`${detail.sentence} · judged by the server at read time against real now, one platform threshold`}
    >
      <i className={styles['statusMark']} aria-hidden="true" />
      inactive
    </span>
  );
}

/** The slot's identity and state: its newest run, its pod, model, engine and last word. */
export function IdentityBlock({
  roster,
  instance,
}: {
  roster: Resource<Stamped<RosterData>>;
  instance: string;
}): ReactNode {
  const head = 'identity and state';
  const hover = <InfoHover of="status" label="status" />;
  if (roster.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        {null}
      </Block>
    );
  }
  if (roster.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        <Refusal
          refusal={{
            cause: roster.error.cause ?? 'engine_unavailable',
            message: roster.error.message,
          }}
        />
      </Block>
    );
  }

  const rows = (roster.value.data.rows ?? []).filter((r) => r.instance === instance);
  // A slot can carry several observed runs in the window; the newest word wins the head,
  // because a rolling deploy reads as a departure and an arrival.
  const newest = [...rows].sort((a, b) => b.last_seen_ms - a.last_seen_ms)[0];

  if (!newest) {
    return (
      <Block head={head} extras={hover}>
        <p className={styles['awaiting']}>
          No run for this slot among the roster rows this page read. The roster is observed: a
          tap that never reported leaves no trace there, and this page claims nothing about
          whether the slot exists.
        </p>
      </Block>
    );
  }

  return (
    <Block head={head} extras={hover}>
      <div className={styles['identity']}>
        <span>
          <StatusWord row={newest} />
        </span>
        <span title="the slot's current occupant, relayed by the chart; a slot outlives its pods">
          pod{' '}
          {newest.pod != null ? (
            <b>{newest.pod}</b>
          ) : (
            <i className={styles['undeclared']}>unobserved</i>
          )}
        </span>
        <span>
          model{' '}
          {newest.model != null ? (
            <b>{newest.model}</b>
          ) : (
            <i className={styles['undeclared']}>undeclared</i>
          )}
        </span>
        <span>
          engine <b>{newest.engine_version}</b>
        </span>
        <span title="a run is an incarnation: a restarted instance is a new run">
          run <b>{newest.incarnation}</b>
        </span>
        <span>
          last heard{' '}
          <b>
            {day(newest.last_seen_ms)} {clock(newest.last_seen_ms)}
          </b>
        </span>
        {newest.state === 'inactive' && newest.silent_for_ms != null && (
          <span>
            silent for <b>{integer(Math.round(newest.silent_for_ms / 60_000))} min</b>
            {newest.threshold_ms != null && (
              <> · threshold {integer(Math.round(newest.threshold_ms / 60_000))} min</>
            )}
          </span>
        )}
      </div>
      {rows.length > 1 && (
        <p className={styles['stamp']}>
          {integer(rows.length)} observed runs for this slot in the window; the newest word is
          above and staleness is judged per run, never per slot.
        </p>
      )}
    </Block>
  );
}
