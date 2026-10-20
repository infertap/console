// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AnalyzeData, Stamp } from '../../domain/contract';
import type { IngestJson } from '../../domain/contract';
import { clock, duration } from '../format/numbers';
import styles from './Chrome.module.css';

/**
 * The one dark row.
 *
 * **It carries wall-clock-live facts only**: LIVE, the next tick, the last segment, ingest lag,
 * the raw horizon and the discriminator. Every pass-clock accounting figure lives on the light
 * canvas below, and a number never crosses that boundary. If it is on this strip it is ingest or
 * health; if it is on a plate it advances only when a pass completes.
 *
 * This also settles the motion law's boundary: the freshness clock may tick, because it is a
 * wall-clock surface. No accounting figure animates, ever.
 */

/**
 * What the strip shows: the fleet, the stamp, the ingest pulse, and the optional analyze-now kick.
 */
export interface StatusStripProps {
  fleet: string;
  stamp: Stamp;
  ingest: IngestJson;
  rawHorizonDays: number;
  /** Bumped on each ingest batch. Ingestion is bursty, so the indicator flashes per batch. */
  pulse: number;
  streamState: 'open' | 'retrying' | 'closed';
  /** Present when a pass has landed and the document has not been refetched onto it yet. */
  newDataThrough?: string | null;
  onTakeNewData?: () => void;
  /** The analyze-now kick. Absent hides the control (a page without the seam wired). */
  onAnalyzeNow?: () => Promise<{ data: AnalyzeData }>;
}

/** The one dark row: wall-clock-live facts and the controls, never an accounting figure. */
export function StatusStrip({
  fleet,
  stamp,
  ingest,
  rawHorizonDays,
  pulse,
  streamState,
  newDataThrough,
  onTakeNewData,
  onAnalyzeNow,
}: StatusStripProps): ReactNode {
  const idle = streamState !== 'open';
  // 'requested' holds until the pass it asked for lands as a new-data offer; 'declined'
  // is the serve-mode answer, held with its reason. Event-driven state only: nothing
  // here moves on a timer, per the strip's own motion law.
  const [kick, setKick] = useState<'idle' | 'requested' | 'declined'>('idle');
  const [declineNote, setDeclineNote] = useState('');
  // Reset during render, not in an effect: when the offer arrives, the request it
  // answers is over. The prev-value comparison is React's own sanctioned shape for
  // deriving state from a prop change without a cascading effect.
  const [prevOffer, setPrevOffer] = useState<string | null | undefined>(newDataThrough);
  if (newDataThrough !== prevOffer) {
    setPrevOffer(newDataThrough);
    if (newDataThrough && kick === 'requested') setKick('idle');
  }

  return (
    <header className={styles['topbar']}>
      <div className={styles['fleet']}>
        <span className={styles['mark']}>infertap</span>
        {/* Machine identifiers never wear the serif: its numeral makes usc1 read as uscl. */}
        <span className={styles['fleetName']}>{fleet}</span>
      </div>

      <div className={styles['statusline']}>
        <span className={styles['live']}>
          <Pulse pulse={pulse} idle={idle} />
          <span>{idle ? 'idle' : 'live'}</span>
          <NextTick atMs={ingest.next_tick_at_ms ?? null} />
        </span>

        {/* The segment TIME is the signal; the id is provenance, demoted to hover (v3). */}
        <Stat
          label="segment"
          value={
            ingest.last_segment
              ? ingest.last_segment_at_ms
                ? clock(ingest.last_segment_at_ms)
                : ingest.last_segment
              : 'none yet'
          }
          {...(ingest.last_segment ? { title: `segment ${ingest.last_segment}` } : {})}
        />
        {/* Absent rather than faked. A lag of "0" before anything arrived would be a claim. */}
        <Stat label="lag" value={ingest.lag_ms === null || ingest.lag_ms === undefined ? 'none' : duration(ingest.lag_ms)} />
        <Stat label="horizon" value={`${rawHorizonDays} d`} />
        {/* Classification rides the ingest cycle: the day the last tick classified through.
            Absent before the first tick, said so. */}
        <Stat label="classified through" value={stamp.tick.classified_day ?? 'none yet'} />
        <span className={styles['stat']}>
          <span className={styles['statKey']}>analysis version</span>
          <span className={`${styles['statValue']} ${styles['trunc']}`} title={stamp.discriminator}>
            {`${stamp.discriminator.slice(0, 8)}…`}
          </span>
        </span>
      </div>

      <div className={styles['right']}>
        {onAnalyzeNow && !newDataThrough && kick !== 'requested' && (
          <button
            type="button"
            className={styles['kick']}
            title={
              kick === 'declined'
                ? declineNote
                : 'run an analysis now instead of waiting for the next ingest cycle'
            }
            disabled={kick === 'declined'}
            onClick={() => {
              onAnalyzeNow()
                .then((r) => {
                  if (r.data.accepted) {
                    setKick('requested');
                  } else {
                    setKick('declined');
                    setDeclineNote(r.data.note);
                  }
                })
                .catch(() => setKick('idle'));
            }}
          >
            {kick === 'declined' ? 'no analysis loop' : 'analyze now'}
          </button>
        )}
        {kick === 'requested' && !newDataThrough && (
          // Not a spinner: the strip's only self-moving element is the clock. This holds
          // until the pass lands and the new-data offer replaces it.
          <span className={styles['stat']}>
            <span className={styles['statValue']}>analysis requested</span>
          </span>
        )}
        {newDataThrough && (
          // A pass landed. Nothing moves on the canvas until the reader asks: figures advance
          // through this affordance and nowhere else.
          <button type="button" className={styles['newData']} onClick={onTakeNewData}>
            <span className={styles['newDataDot']} />
            <span>{`new data to ${newDataThrough}`}</span>
          </button>
        )}
      </div>
    </header>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }): ReactNode {
  return (
    <span className={styles['stat']} {...(title ? { title } : {})}>
      <span className={styles['statKey']}>{label}</span>
      <span className={styles['statValue']}>{value}</span>
    </span>
  );
}

/** One flash per batch. Ingestion is bursty, so the strip renders bursts rather than a spinner. */
function Pulse({ pulse, idle }: { pulse: number; idle: boolean }): ReactNode {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useRef(pulse);

  useEffect(() => {
    if (pulse === seen.current) return;
    seen.current = pulse;
    const node = ref.current;
    if (!node) return;
    node.classList.remove(styles['burst'] as string);
    // Reading offsetWidth restarts the animation; without it a second batch inside one cycle
    // would not flash, and the strip would under-report activity.
    void node.offsetWidth;
    node.classList.add(styles['burst'] as string);
  }, [pulse]);

  return <span ref={ref} className={`${styles['dot']} ${idle ? styles['dotIdle'] : ''}`} />;
}

/**
 * The freshness clock: the only self-moving element in the product.
 *
 * It counts toward a time the daemon published rather than a duration this bundle invented, so
 * when the loop has published nothing the countdown is absent rather than guessed.
 */
function NextTick({ atMs }: { atMs: number | null }): ReactNode {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (atMs === null) return;
    // Guarded: `matchMedia` is standard but not universal, and a chrome element that takes the
    // whole page down because a media-query API is missing is a worse failure than a clock that
    // ticks when somebody asked it not to.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [atMs]);

  // Absent rather than faked when the loop has published nothing.
  if (atMs === null) return <span className={styles['clock']}>no tick published</span>;

  const left = Math.round((atMs - now) / 1000);
  if (left <= 0) {
    // The published tick has passed and no newer one arrived. Counting down to 0:00 and staying
    // there would read as perpetually about to fire, which is the opposite of what it means.
    return <span className={styles['clock']}>tick overdue</span>;
  }
  return (
    <span className={styles['clock']}>
      {`next tick ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
    </span>
  );
}
