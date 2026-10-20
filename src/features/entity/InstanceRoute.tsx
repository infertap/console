// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource } from '../../data/react';
import { ENTITY_STOPS, stopGrain, stopLabel, windowKey } from '../../domain/windows';
import { Drill } from '../../design-system/layout/Drill';
import { useQueryParam, type RouteProps } from '../../design-system/navigation/router';
import { GapOverTime } from './GapOverTime';
import { DuplicationBlock } from './instance/DuplicationBlock';
import { HeadlineBlock } from './instance/HeadlineBlock';
import { IdentityBlock } from './instance/IdentityBlock';
import { PeersBlock } from './instance/PeersBlock';
import { RanksBlock } from './instance/RanksBlock';

/**
 * Level 1: one instance, the load-bearing facet — a dashboard, not a document.
 *
 * **The instance is a slot somebody named, and the pod is who fills it.** The id is a label
 * the operator typed into the tap's command line, never discovered; a slot outlives its pods.
 *
 * **Every headline is a ratio or a multiplier; absolute masses live in the hover.** A mass
 * needs a paragraph to interpret; a rate needs nothing, so fixing the figures retires the
 * prose. Words-on-glass holds: register and coverage ride the unit lines and hovers, the
 * explanations sit behind the i, and the one action lives in one line there too.
 *
 * The denominator is the recompute figures read one dim wide (`dims=class`): recompute is
 * exactly [ETR, post_clear], the siblings are the rest of cache work, and segments are never
 * blended — a bucket belongs to one segment, and refused segments stay unstatable.
 *
 * **One window rules the page**, and the member-count rule picks each panel's form: series at
 * eight members, a distribution at three hundred.
 */
export default function InstanceRoute({ params }: RouteProps): ReactNode {
  const id = params['id'] ?? '';
  const [rawWin, setWin] = useQueryParam('win');
  // The entity stops, from the one stop list (`domain/windows.ts`): an instance scope serves
  // at minute from the rank-grain cells, so the page zooms like the dashboard.
  const win = windowKey(rawWin, ENTITY_STOPS) as '14d' | '48h' | '3h';
  const winLabel = stopLabel(win);
  // One grammar, one anchor: every read takes the stop itself.
  const grain = stopGrain(win);
  const relWindow = win;
  const bandsAsk = { window: win, grain } as const;
  // The ranks read groups by holder, and the minute cells are kept per rank with cache groups
  // rolled up: a holder cut has no minute table. At the 3 h stop that one read asks the hour
  // tier and says so on its head rather than quietly downgrading.
  const ranksGrain = grain === 'minute' ? ('hour' as const) : grain;
  const ranksLabel = grain === 'minute' ? `${winLabel} · hour` : winLabel;

  const roster = useResource('inst:roster', (ds) => ds.roster({ limit: 200 }));
  // The rate's two halves from ONE read: recompute classes over all classes, scoped.
  const figures = useResource(`inst:${id}:figures:${win}`, (ds) =>
    ds.figures({ window: relWindow, grain, dims: ['class'], instance: id }),
  );
  // The same read one dim wider and unscoped: every node's rate, for the median and the peers.
  const peers = useResource(`inst:peers:${win}`, (ds) =>
    ds.figures({ window: relWindow, grain, dims: ['instance', 'class'] }),
  );
  const scoped = useResource(`inst:${id}:${win}`, (ds) =>
    ds.figureBands({ ...bandsAsk, instance: id }),
  );
  const scopedByClass = useResource(`inst:${id}:${win}:cls`, (ds) =>
    ds.figureBands({ ...bandsAsk, instance: id, dims: 'class' }),
  );
  const ranks = useResource(`inst:${id}:ranks:${win}`, (ds) =>
    ds.figureBands({ window: relWindow, grain: ranksGrain, instance: id, dims: 'holder' }),
  );
  // The duplication read serves two grains: the minute cut inside the minute
  // tier's reach, the hourly cut otherwise. The 3 h stop asks minute; the two longer stops
  // ask hour, and the 14 d stop sums those hours into days before drawing. An explicit ask
  // is honored verbatim or refused by name, never quietly downgraded.
  const dupGrain = grain === 'minute' ? ('minute' as const) : ('hour' as const);
  const duplication = useResource(`inst:${id}:dup:${win}`, (ds) =>
    ds.instanceDuplication(id, { window: relWindow, grain: dupGrain }),
  );

  return (
    <Drill
      title={`instance · ${id}`}
      crumbs={[
        { to: '/', label: 'Dashboard' },
        { to: '/fleet', label: 'Fleet' },
      ]}
      stamp={
        <>
          a slot the operator named, not a discovered identity; the pod is its current
          occupant, and a slot outlives its pods. Nothing about topology may be inferred from
          the id.
        </>
      }
    >
      <IdentityBlock roster={roster} instance={id} />

      <HeadlineBlock
        figures={figures}
        peers={peers}
        ranks={ranks}
        duplication={duplication}
        scoped={scoped}
        instance={id}
        win={win}
        winLabel={winLabel}
        onWin={(w) => setWin(w === '14d' ? null : w)}
      />

      <GapOverTime scopedByClass={scopedByClass} win={win} />

      <RanksBlock ranks={ranks} winLabel={ranksLabel} />

      <DuplicationBlock
        duplication={duplication}
        winLabel={winLabel}
        asked={dupGrain}
        atFourteen={win === '14d'}
      />


      <PeersBlock peers={peers} subject={id} winLabel={winLabel} />
    </Drill>
  );
}
