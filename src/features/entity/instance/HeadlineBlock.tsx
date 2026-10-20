// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { Resource } from '../../../data/react';
import type {
  BandsData,
  FiguresData,
  InstanceDuplicationData,
  Stamped,
} from '../../../domain/contract';
import { bandsView } from '../../../domain/bands';
import { ENTITY_STOPS, HOUR_MS, type WindowKey } from '../../../domain/windows';
import { CutBar } from '../../../design-system/controls/CutBar';
import { compact, integer, multiplier, percent } from '../../../design-system/format/numbers';
import { InfoHover } from '../../../design-system/info/InfoHover';
import { Block } from '../../../design-system/layout/Block';
import { Refusal } from '../../../design-system/refusal/Refusal';
import { median, rate, ratePoints } from '../rates';
import { RateChart } from '../RateChart';
import { StatRow, type Tile } from '../Tiles';
import styles from '../Entity.module.css';
import { heldTwiceShare } from './duplication';
import { peerCells } from './peers';

/** The stat row and the rate line: the page's verdict surface, all ratios. */
export function HeadlineBlock({
  figures,
  peers,
  ranks,
  duplication,
  scoped,
  instance,
  win,
  winLabel,
  onWin,
}: {
  figures: Resource<Stamped<FiguresData>>;
  peers: Resource<Stamped<FiguresData>>;
  ranks: Resource<Stamped<BandsData>>;
  duplication: Resource<Stamped<InstanceDuplicationData>>;
  scoped: Resource<Stamped<BandsData>>;
  instance: string;
  win: WindowKey;
  winLabel: string;
  onWin: (id: string) => void;
}): ReactNode {
  const head = `recompute rate · ${instance} · ${winLabel}`;
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

  const peerData = peers.status === 'ready' ? peerCells(peers.value.data) : null;
  const fleetMedianRate = peerData
    ? median(
        [...peerData.windowByInstance.values()]
          .filter((c) => c.total > 0)
          .map((c) => c.recompute / c.total),
      )
    : null;

  const rankView = ranks.status === 'ready' ? bandsView(ranks.value.data, 'holder') : null;
  const rankTotals = rankView?.members.map((m) => m.total) ?? [];
  const busiest = Math.max(...rankTotals, 0);
  // Against the MEDIAN rank, not the quietest: a rank that just came up or is draining
  // through a deploy sits near zero, and busiest over quietest reads a healthy mid-rollout
  // node as a four-digit multiplier. The median keeps "balanced is 1×" without crying wolf.
  const medianRank = median(rankTotals);

  const dup = duplication.status === 'ready' ? duplication.value.data : null;
  const dupTotal = dup === null ? 0 : dup.within_ranks_token_ms + dup.cache_groups_token_ms;
  const dupShare = dup === null ? null : heldTwiceShare(dup);

  const gapUnobserved = scoped.status === 'ready' ? scoped.value.data.gap_unobserved.value : null;

  const tiles: Tile[] = [
    {
      value: total > 0 ? rate(recompute / total) : 'none',
      unit: 'of cache work recomputed',
      ...(fleetMedianRate !== null ? { sub: `fleet median ${rate(fleetMedianRate)}` } : {}),
      spark: points.map((p) => (p.total > 0 ? p.recompute / p.total : 0)),
      tip: `≥ ${integer(recompute)} recomputed of ≥ ${integer(total)} stored tokens${coverage === null ? '' : ` · ${percent(coverage, 1)} token-weighted coverage`}`,
    },
    {
      value:
        rankTotals.length < 2 || medianRank <= 0 ? '·' : multiplier(busiest / medianRank),
      unit: 'busiest ÷ median rank',
      sub: 'balanced is 1×',
      ...(rankView && rankView.members[0]
        ? {
            spark: rankView.members[0].rows.map((_, i) => {
              const at = rankView.members.map((m) => m.rows[i]?.reduce((a, b) => a + b, 0) ?? 0);
              const mid = median(at);
              return mid > 0 ? Math.max(...at) / mid : 0;
            }),
            tip: `busiest rank ≥ ${integer(busiest)} tokens, median rank ≥ ${integer(Math.round(medianRank))}, over the window`,
          }
        : {}),
    },
    {
      // The ratified fraction, servable since the wire carries the denominator: the share of
      // what this node HOLDS that it holds twice across its own ranks. One derivation
      // (`heldTwiceShare`), shared with the panel below. No spark: the wire carries no
      // per-bucket denominator, and the locality mix it used to draw is the wrong axis.
      value:
        dup === null
          ? '·'
          : dupShare !== null
            ? rate(dupShare)
            : dupTotal > 0
              ? '·'
              : 'none',
      unit: 'of held mass duplicated across ranks',
      ...(dup === null
        ? {}
        : { sub: dupTotal > 0 ? 'the half a prefix-affinity gateway removes' : 'a measured zero' }),
      ...(dup !== null && dupTotal > 0
        ? {
            tip: `≥ ${compact(dup.within_ranks_token_ms / HOUR_MS)} tok-h across ranks, ≥ ${compact(dup.cache_groups_token_ms / HOUR_MS)} tok-h across cache groups, of ≥ ${compact(dup.held_token_ms / HOUR_MS)} tok-h held · mean copies ${multiplier(dup.copies_token_ms / dupTotal)} over the duplicated mass`,
          }
        : {}),
    },
    {
      value: coverage === null ? '·' : percent(coverage, 1),
      unit: 'token-weighted coverage',
      ...(gapUnobserved !== null
        ? {
            sub: `caveat: ≥ ${compact(gapUnobserved)} gap-unobserved`,
            tip: 'gap-unobserved mass has no observed prior close: first stored in the window, or gone longer than 72 h, indistinguishable by construction. A classification caveat, not a metric.',
          }
        : {}),
      spark: points.map((p) => (p.recompute > 0 ? p.weighted / p.recompute : 0)),
    },
  ];

  // The rate line rides the same buckets; the fleet median draws behind it where served.
  const medianSeries =
    peerData === null ? null : points.map((p) => peerData.medianByBucket.get(p.key) ?? 0);

  return (
    <Block head={head} extras={hover}>
      {control}
      <StatRow tiles={tiles} />
      <RateChart
        values={points.map((p) => (p.total > 0 ? p.recompute / p.total : 0))}
        median={medianSeries}
        labelOf={(i) => {
          const key = points[i]?.key ?? '';
          return key.length > 10 ? `${key.slice(11, 16)}` : key.slice(5, 10);
        }}
        tipLabelOf={(i) => {
          const key = points[i]?.key ?? '';
          return key.length > 10 ? `${key.slice(0, 10)} ${key.slice(11, 16)}Z` : key;
        }}
        tickEvery={Math.max(1, Math.ceil(points.length / 8))}
        title="This node's recompute rate per bucket, the fleet's per-bucket median rate as the faint band behind it."
      />
    </Block>
  );
}
