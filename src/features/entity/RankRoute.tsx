// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource, type Resource } from '../../data/react';
import type { FiguresData, Stamped, TimelineData } from '../../domain/contract';
import { classLabel, rankLabel, readFromLabel } from '../../domain/language';
import {
  ENTITY_STOPS,
  stopGrain,
  stopLabel,
  windowKey,
  type WindowKey,
} from '../../domain/windows';
import { CutBar } from '../../design-system/controls/CutBar';
import { integer, percent } from '../../design-system/format/numbers';
import { InfoHover } from '../../design-system/info/InfoHover';
import { Block } from '../../design-system/layout/Block';
import { Drill } from '../../design-system/layout/Drill';
import { Plate } from '../../design-system/layout/Plate';
import { Link, useQueryParam, type RouteProps } from '../../design-system/navigation/router';
import { Refusal } from '../../design-system/refusal/Refusal';
import table from '../../design-system/table/Table.module.css';
import { GapOverTime } from './GapOverTime';
import { StatRow, type Tile } from './Tiles';
import { rate, ratePoints } from './rates';
import styles from './Entity.module.css';

/**
 * One rank: the drill beneath the instance page's rank section, thin on purpose.
 *
 * The URL nests under the instance (`/instance/:id/rank/:dp_rank/:group_idx`) because this is
 * the one containment the model guarantees: a rank's identity IS (instance, dp_rank, group).
 *
 * **Aggregates before events.** A rank has thousands of store events, so the page leads with
 * what they sum to — the rank's own recompute rate, its share of the node, its gap mix, all
 * `holder=`-scoped reads — and only then offers the store timeline, honestly framed as a
 * window into the event stream. The timeline is the provenance spot-check: what exactly this
 * rank stored and when, each row a record the analysis wrote, each block a door, the terminal
 * records one link beneath. It draws no conclusion about why.
 *
 * **One window rules the page**, the entity stops. At the 3 h stop the reads serve from the
 * rank-grain minute cells, where a holder IS a rank: the cache group rolls up, and
 * the headline says so at that stop rather than letting the address above claim a group the
 * minute cells do not keep.
 */

/** Level 1: one rank of one instance, where a holder is a rank. */
export default function RankRoute({ params }: RouteProps): ReactNode {
  const holder = {
    instance: params['id'] ?? '',
    dp_rank: Number(params['dp_rank'] ?? 0),
    group_idx: Number(params['group_idx'] ?? 0),
  };
  const triple = `${holder.instance}/${holder.dp_rank}/${holder.group_idx}`;
  const id = `${holder.instance} / ${holder.dp_rank} / g${holder.group_idx}`;

  const [rawWin, setWin] = useQueryParam('win');
  // The entity stops, from the one stop list (`domain/windows.ts`): a holder scope serves at
  // minute from the rank-grain cells, so the page zooms like the instance page.
  const win = windowKey(rawWin, ENTITY_STOPS) as '14d' | '48h' | '3h';
  const winLabel = stopLabel(win);
  // One grammar, one anchor: every read takes the stop itself.
  const grain = stopGrain(win);
  const relWindow = win;

  // The rank's own rate, and the node's, from the same read at two scopes: the share tile's
  // numerator and denominator cannot come from different questions.
  const figures = useResource(`rank:${triple}:figures:${win}`, (ds) =>
    ds.figures({ window: relWindow, grain, dims: ['class'], holder: triple }),
  );
  const nodeFigures = useResource(`rank:${holder.instance}:node:${win}`, (ds) =>
    ds.figures({ window: relWindow, grain, dims: ['class'], instance: holder.instance }),
  );
  // The gap mix at the page's grain: the class dim rides every minute table, the rank cells
  // included, so a holder scope answers there without a tier of its own.
  const scopedByClass = useResource(`rank:${triple}:bands:${win}`, (ds) =>
    ds.figureBands({ window: relWindow, grain, holder: triple, dims: 'class' }),
  );
  const timeline = useResource(`timeline:${id}`, (ds) => ds.holderTimeline(holder, { limit: 5 }));

  return (
    <Drill
      title={rankLabel(holder, holder.group_idx > 0)}
      crumbs={[
        { to: '/', label: 'Dashboard' },
        { to: '/fleet', label: 'Fleet' },
        { to: `/instance/${encodeURIComponent(holder.instance)}`, label: holder.instance },
      ]}
      stamp={
        <>
          one rank of one engine: instance, data-parallel rank, cache group. The one
          containment the model guarantees, so the address reads{' '}
          <b>{holder.instance}</b> / rank {holder.dp_rank} / group {holder.group_idx}. Its
          siblings sit on{' '}
          <Link to={`/instance/${encodeURIComponent(holder.instance)}`}>
            the instance page&#8217;s rank section ›
          </Link>
        </>
      }
    >
      <RankHeadline
        figures={figures}
        nodeFigures={nodeFigures}
        id={id}
        dpRank={holder.dp_rank}
        win={win}
        winLabel={winLabel}
        onWin={(w) => setWin(w === '14d' ? null : w)}
      />

      <GapOverTime
        scopedByClass={scopedByClass}
        win={win}
        // A clicked bucket asks a question, not a scroll: the identities drill answers
        // one-block-or-many over the whole span, with the raw records one level beneath it.
        bucketLink={(startMs, endMs) =>
          `/identities?holder=${encodeURIComponent(triple)}&window=${startMs},${endMs}`
        }
      />

      <TimelineBlock timeline={timeline} triple={triple} />
    </Drill>
  );
}

function RankHeadline({
  figures,
  nodeFigures,
  id,
  dpRank,
  win,
  winLabel,
  onWin,
}: {
  figures: Resource<Stamped<FiguresData>>;
  nodeFigures: Resource<Stamped<FiguresData>>;
  id: string;
  dpRank: number;
  win: WindowKey;
  winLabel: string;
  onWin: (id: string) => void;
}): ReactNode {
  const head = `recompute rate · ${id} · ${winLabel}`;
  const hover = <InfoHover of="entity_scope" label="scope" />;
  const control = (
    <CutBar
      groups={[
        {
          label: 'window',
          options: ENTITY_STOPS.map((s) => ({ id: s.key, label: s.label })),
          current: win,
          onSelect: onWin,
        },
      ]}
    />
  );
  if (figures.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        {control}
        {figures.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>The page fills with the first analysis pass.</p>
        ) : (
          <Refusal
            refusal={{
              cause: figures.error.cause ?? 'engine_unavailable',
              message: figures.error.message,
            }}
          />
        )}
      </Block>
    );
  }
  if (figures.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        {null}
      </Block>
    );
  }

  const points = ratePoints(figures.value.data);
  const recompute = points.reduce((a, p) => a + p.recompute, 0);
  const total = points.reduce((a, p) => a + p.total, 0);
  const weighted = points.reduce((a, p) => a + p.weighted, 0);
  // Coverage of nothing is unstated, not zero: with no classified stores in the window there
  // is no mass to weight, and a tile that printed 0.0% would state a figure nothing measured.
  const coverage = recompute > 0 ? weighted / recompute : null;
  // Read off the response, never the stop: at minute grain the cells are kept per rank, so a
  // holder scope answers about the rank with its cache groups summed. The address above names
  // a group, so the glass says which one the numbers are for at that tier.
  const perRank = figures.value.data.grain === 'minute';

  const nodePoints = nodeFigures.status === 'ready' ? ratePoints(nodeFigures.value.data) : null;
  const nodeRecompute = nodePoints?.reduce((a, p) => a + p.recompute, 0) ?? 0;
  const nodeTotal = nodePoints?.reduce((a, p) => a + p.total, 0) ?? 0;

  const tiles: Tile[] = [
    {
      value: total > 0 ? rate(recompute / total) : 'none',
      unit: 'of its cache work recomputed',
      ...(nodeTotal > 0 ? { sub: `its node ${rate(nodeRecompute / nodeTotal)}` } : {}),
      spark: points.map((p) => (p.total > 0 ? p.recompute / p.total : 0)),
      tip: `≥ ${integer(recompute)} recomputed of ≥ ${integer(total)} stored tokens`,
    },
    {
      value: nodeRecompute > 0 ? percent(recompute / nodeRecompute, 0) : '·',
      unit: "of the node's recompute",
      sub: 'its weight among the siblings',
      ...(nodeRecompute > 0
        ? { tip: `≥ ${integer(recompute)} of the node's ≥ ${integer(nodeRecompute)} recomputed tokens` }
        : {}),
    },
    {
      value: coverage === null ? '·' : percent(coverage, 1),
      unit: 'token-weighted coverage',
      spark: points.map((p) => (p.recompute > 0 ? p.weighted / p.recompute : 0)),
    },
  ];

  return (
    <Block head={head} extras={hover}>
      {control}
      <StatRow tiles={tiles} />
      {perRank && (
        <p className={styles['stamp']}>
          at this stop the minute cells are kept per rank, so the page&#8217;s figures are rank{' '}
          {dpRank}&#8217;s with its cache groups summed; the 48 h and 14 d stops carry this cache
          group alone
        </p>
      )}
    </Block>
  );
}

function TimelineBlock({
  timeline,
  triple,
}: {
  timeline: Resource<Stamped<TimelineData>>;
  triple: string;
}): ReactNode {
  if (timeline.status !== 'ready') return null;
  const rows = timeline.value.data.rows ?? [];
  // Where the rows came from: the newest events are the box's own, and a
  // pulse that had to reach the bucket says so, the way the headline says which cells it read.
  const origin = readFromLabel(timeline.value.data.read_from);
  return (
    <Plate
      name="Pulse"
      definition="evidence"
      lead={`the newest ${integer(rows.length)} store events: a liveness check, not a browse. At production traffic this is the last few seconds`}
      footer={
        <>
          Event grain, each row a record the analysis wrote. A rank stores thousands of
          events, so the way IN to them is a clicked bucket on the chart above, which answers
          one-block-or-many for that span; event grain reaches back to{' '}
          <b>{timeline.value.data.bound.raw_from_day ?? 'no records'}</b>.{' '}
          <Link to={`/evidence?holder=${encodeURIComponent(triple)}`}>
            records behind this ›
          </Link>
        </>
      }
    >
      {timeline.value.data.refused ? (
        <Refusal refusal={timeline.value.data.refused} density="inline" />
      ) : (
        <table className={table['table']}>
          <thead>
            <tr>
              <th>at</th>
              <th>block</th>
              <th>class</th>
              <th className={table['num']}>tokens</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr className={table['row']} key={`${row.block_id}-${i}`}>
                <td>{new Date(row.at_ms).toISOString().slice(0, 16).replace('T', ' ')}Z</td>
                <td>
                  <Link className={table['link']} to={`/block/${encodeURIComponent(row.block_id)}`}>
                    {row.block_id}
                  </Link>
                </td>
                <td>{classLabel(row.class)}</td>
                <td className={table['num']}>{integer(row.n_tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {origin !== null && <p className={styles['stamp']}>{origin}</p>}
    </Plate>
  );
}
