// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource } from '../../data/react';
import { DEFAULT_WINDOW } from '../../domain/windows';
import { clock } from '../../design-system/format/numbers';
import { PlacementSection } from './PlacementSection';
import { RepeatCompute } from './RepeatCompute';
import { TrustSection } from './Trust';
import styles from './Document.module.css';

/**
 * Level 0: the document.
 *
 * **Three sections: repeat compute, placement, trust.** The anchor line is the hero; the
 * thrash lens is the repeat-compute meter's face, with its curve a drill beneath it; markers
 * sit on every metric chart with attribution as an interaction; blocks by mass and the rank
 * table are drills behind the breakdown; duplication is measured in token-hours. Words on
 * glass are labels, units, provenance and hover definitions; the gauges tell the story.
 *
 * One layout at every age still holds: sections resolve, never reflow.
 */
export default function DocumentRoute(): ReactNode {
  const stamp = useResource('stamp:document', (ds) => ds.stamp());
  // The stamped window's figures, class-dimensioned: the anchor line's whole diet.
  const windowFigures = useResource('figures:window', (ds) =>
    ds.figures({ window: DEFAULT_WINDOW, grain: 'day', dims: ['class'] }),
  );
  // The full marker index, window-wide: chips, chart marks and the breaking-marker refusals all
  // read this one list, so daggers agree everywhere by construction.
  const markers = useResource('markers:90d', (ds) => ds.markers({ window: '90d' }));

  const placement = useResource('placement', (ds) => ds.placement({}));
  // The window stated, not defaulted: the trust tile names it, so it must be the one asked for.
  const holders = useResource('holders:top', (ds) =>
    ds.holders({ window: DEFAULT_WINDOW, limit: 10 }),
  );
  const coverage = useResource('coverage:fleet', (ds) => ds.coverage({ by: 'fleet' }));
  const roster = useResource('roster', (ds) => ds.roster({}));
  const health = useResource('health', (ds) => ds.health({}));

  return (
    <main className={styles['document']}>
      {stamp.status === 'ready' && (
        <>
          {/* The ctxbar: the document's canonical stamp, stated once. Sections that match it
              stay silent, so a panel that deviates is visible by contrast. */}
          <p className={styles['canon']}>
            {stamp.value.stamp.window ? (
              <>
                window{' '}
                <b>
                  {stamp.value.stamp.window.start_day} to {stamp.value.stamp.window.end_day}
                </b>
              </>
            ) : (
              <>window not yet stamped</>
            )}
            {' · last analysis '}
            {stamp.value.stamp.tick.at_ms ? (
              <b>{clock(stamp.value.stamp.tick.at_ms)}</b>
            ) : (
              <b>none yet</b>
            )}
            {' · analysis '}
            <b title={`analysis version ${stamp.value.stamp.discriminator}`}>
              {stamp.value.stamp.semantics_version}
            </b>
          </p>

          <RepeatCompute
            figures={windowFigures}
            markers={markers.status === 'ready' ? markers.value.data.markers : []}
          />

          <PlacementSection
            placement={placement}
            markers={markers.status === 'ready' ? markers.value.data.markers : []}
          />

          <TrustSection
            coverage={coverage}
            roster={roster}
            health={health}
            holdersCovered={
              holders.status === 'ready' ? (holders.value.data.page.total_rows ?? 0) : 0
            }
          />
        </>
      )}
    </main>
  );
}
