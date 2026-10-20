// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { Cause, Refusal as WireRefusal } from '../../domain/contract';
import { narrow, type NarrowedRefusal } from '../../domain/refusal';
import styles from './Refusal.module.css';

/**
 * A refusal, rendered as the result it is.
 *
 * The read API's contract says a well-formed request whose answer a data bound prevents returns
 * **200 with `data.refused`**, not an error status: "no event grain past 14 days" is a fact about
 * the meter. So this is not an error component. It occupies the position the answer would have
 * occupied, says what the meter declines to state, and states the bound that produced it.
 *
 * **The copy below is keyed on the closed cause set and checked exhaustively.** `satisfies
 * Record<Cause, CauseCopy>` means a cause the analyzer adds fails this build rather than falling
 * through to a generic render, and one it removes fails too rather than leaving a designed state
 * nothing can reach. That is the whole value of the set being closed and generated upstream from
 * `error::Cause::all()`.
 *
 * The `message` is the server's sentence and renders verbatim: it is written where the bound is
 * known. What this file owns is the FRAMING, which is the part a console is allowed to have an
 * opinion about.
 */

interface CauseCopy {
  /** What kind of not-answer this is, in the reader's terms. */
  readonly title: string;
}

const COPY = {
  // Session. These reach the login flow rather than a panel, and are here for the gallery.
  unauthenticated: { title: 'Not signed in' },
  session_expired: { title: 'Session ended' },

  // Not yet measured. Never a zero, and never anybody's fault. "No pass has run" is no longer
  // a cause on the wire: it is a stamp fact (`pass.frontier_day` null), which the data layer
  // turns into the same not-yet-measured state the panels render.
  engine_unavailable: { title: 'The engine is not reachable' },

  // Retention and grain bounds.
  outside_raw_horizon: { title: 'Past the raw horizon' },
  grain_unavailable: { title: 'Not available at this grain' },

  // Generation and seam. The meaning of the number changed, so the number is not one number.
  superseded_semantics: { title: 'Superseded semantics' },
  unlinked_generation: { title: 'Unlinked generation' },

  // The request.
  request_invalid: { title: 'Request not readable' },
  window_invalid: { title: 'Window not readable' },
  limit_invalid: { title: 'Limit out of range' },
  dim_unknown: { title: 'Unknown dimension' },
  subject_missing: { title: 'No subject named' },
  cursor_stale: { title: 'The analysis moved under this page' },

  // The subject.
  unknown_holder: { title: 'No such holder' },
  unknown_block: { title: 'No such block' },
  unknown_marker: { title: 'No such marker' },
  unknown_route: { title: 'No such route' },

  // Declarations.
  annotation_invalid: { title: 'Declaration not recordable' },

  // Durability. The bucket is the durable form; without it a read that needs it refuses.
  bucket_unavailable: { title: 'The bucket is not reachable' },

  // Deployment and reservation.
  console_not_configured: { title: 'No console bundle configured' },
} satisfies Record<Cause, CauseCopy>;

/** Flatten a bound object into labelled rows. Arrays and nested values render readably. */
function boundRows(bound: unknown): [string, string][] {
  if (bound === null || bound === undefined) return [];
  if (typeof bound !== 'object') return [['bound', String(bound)]];
  return Object.entries(bound as Record<string, unknown>).map(([key, value]) => [
    key.replace(/_/g, ' '),
    Array.isArray(value) ? value.join(', ') : String(value),
  ]);
}

/** The refusal to render, wire-shaped or already narrowed, and the density of its position. */
export interface RefusalProps {
  refusal: WireRefusal | NarrowedRefusal;
  /** `inline` for a refused row inside a table; the default fills a section's position. */
  density?: 'section' | 'inline';
}

function toNarrowed(refusal: WireRefusal | NarrowedRefusal): NarrowedRefusal {
  return 'rawCause' in refusal ? refusal : narrow(refusal);
}

/**
 * A refusal in the answer's position: the cause in the reader's terms, the sentence verbatim, the bound.
 */
export function Refusal({ refusal, density = 'section' }: RefusalProps): ReactNode {
  const it = toNarrowed(refusal);
  const rows = boundRows(it.bound);
  const requested = boundRows(it.requested);
  const known = it.cause !== null;

  const classes = [
    styles['refusal'],
    density === 'inline' ? styles['inline'] : '',
    known ? '' : styles['unrecognised'],
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="note">
      <div className={styles['head']}>
        <p className={styles['title']}>
          {known ? COPY[it.cause as Cause].title : 'Unrecognised refusal'}
        </p>
        <span className={styles['cause']}>{it.rawCause}</span>
      </div>
      <p className={styles['message']}>{it.message}</p>
      {!known && (
        <p className={styles['message']}>
          This console does not know that cause. The analyzer is newer than this bundle, so the
          sentence above is shown as it arrived and nothing has been inferred from it.
        </p>
      )}
      {rows.length > 0 && (
        <dl className={styles['bound']}>
          {rows.map(([key, value]) => (
            <div className={styles['boundRow']} key={key}>
              <dt className={styles['boundKey']}>{key}</dt>
              <dd className={styles['boundValue']}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* What was asked for, beside what bounded it. Stating both means a reader can see the
          gap without re-deriving either side. */}
      {requested.length > 0 && (
        <dl className={styles['bound']}>
          {requested.map(([key, value]) => (
            <div className={styles['boundRow']} key={`requested-${key}`}>
              <dt className={styles['boundKey']}>requested {key}</dt>
              <dd className={styles['boundValue']}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Every cause, for the gallery. Exported so the catalogue cannot fall behind the set. */
export const ALL_CAUSES = Object.keys(COPY) as Cause[];
export { COPY as CAUSE_COPY };
