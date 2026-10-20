// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource, type Resource } from '../../data/react';
import type {
  BandsData,
  FiguresData,
  InstanceDuplicationData,
  RosterData,
  RunRow,
  Stamped,
} from '../../domain/contract';
import { bandsView } from '../../domain/bands';
import { COPY_BANDS } from '../../domain/lens';
import {
  DAY_MS,
  ENTITY_STOPS,
  HOUR_MS,
  bucketLabel,
  servedWindow,
  stopGrain,
  stopLabel,
  windowKey,
  type WindowKey,
} from '../../domain/windows';
import { BandStack, type Band } from '../../design-system/chart/BandStack';
import { BandLegend } from '../../design-system/chart/Bands';
import { CutBar } from '../../design-system/controls/CutBar';
import { KpiRow, type Kpi } from '../../design-system/figure/KpiRow';
import { clock, compact, day, integer, multiplier, percent } from '../../design-system/format/numbers';
import { InfoHover } from '../../design-system/info/InfoHover';
import { Block } from '../../design-system/layout/Block';
import { Drill } from '../../design-system/layout/Drill';
import { useQueryParam, type RouteProps } from '../../design-system/navigation/router';
import { Refusal } from '../../design-system/refusal/Refusal';
import { GapOverTime } from './GapOverTime';
import { median, rate, ratePoints } from './rates';
import { RECOMPUTE_CLASSES } from '../../domain/trend';
import { MemberDistribution } from './MemberDistribution';
import { RankSeries } from './RankSeries';
import { RateChart } from './RateChart';
import { StatRow, type Tile } from './Tiles';
import styles from './Entity.module.css';

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

/** The dashboard's copy-band tones, in band order: the same four the workload page paints. */
const COPY_TONES = ['var(--cap-4)', 'var(--cap-3)', 'var(--cap-2)', 'var(--cap-1)'] as const;
const COPY_BAND_ROWS: readonly Band[] = COPY_BANDS.map((band, i) => ({
  ...band,
  tone: COPY_TONES[i] ?? 'var(--pencil)',
}));

/**
 * The wire's copies band folded onto the panel's four. The analyzer emits `2`, `3`, `4`,
 * `5-8`, `9-16` and `17+`, never `1`; the leading count places a row, so `3-4` lands where
 * `3` and `4` do and everything from nine up lands in the top band. A row this cannot place
 * is dropped rather than guessed.
 */
function copiesBandIndex(band: string): number {
  const n = Number.parseInt(band, 10);
  if (!Number.isFinite(n) || n < 2) return -1;
  if (n === 2) return 0;
  if (n <= 4) return 1;
  if (n <= 8) return 2;
  return 3;
}

/** The duplication panel's secondary axis: where the copies sat. */
type Locality = 'within' | 'group' | 'both';
const LOCALITIES: readonly { id: Locality; label: string; words: string }[] = [
  { id: 'within', label: 'within ranks', words: 'across its ranks' },
  { id: 'group', label: 'across cache groups', words: 'across its cache groups' },
  { id: 'both', label: 'both', words: 'across ranks and cache groups' },
];
const localityWords = (locality: Locality): string =>
  LOCALITIES.find((l) => l.id === locality)?.words ?? '';

/**
 * The ratified fraction, computed in ONE place: the share of what this node holds that it
 * holds twice across its own ranks. Null when the node held nothing over the window, since
 * a share of nothing is unstated rather than zero.
 */
function heldTwiceShare(d: InstanceDuplicationData): number | null {
  return d.held_token_ms > 0 ? d.within_ranks_token_ms / d.held_token_ms : null;
}


/** Per-instance rate cells from the peers read (`dims=instance,class`, unscoped). */
function peerCells(data: FiguresData): {
  windowByInstance: Map<string, { recompute: number; total: number }>;
  medianByBucket: Map<string, number>;
} {
  const windowByInstance = new Map<string, { recompute: number; total: number }>();
  const perBucket = new Map<string, Map<string, { recompute: number; total: number }>>();
  for (const segment of data.segments) {
    for (const bucket of segment.figures ?? []) {
      const inst = bucket.dims.find((d) => d.dim === 'instance')?.value;
      if (inst === undefined) continue;
      const cls = bucket.dims.find((d) => d.dim === 'class')?.value;
      const isRecompute = cls !== undefined && RECOMPUTE_CLASSES.includes(cls);
      const win = windowByInstance.get(inst) ?? { recompute: 0, total: 0 };
      win.total += bucket.tokens.value;
      if (isRecompute) win.recompute += bucket.tokens.value;
      windowByInstance.set(inst, win);
      let cells = perBucket.get(bucket.bucket);
      if (!cells) {
        cells = new Map();
        perBucket.set(bucket.bucket, cells);
      }
      const cell = cells.get(inst) ?? { recompute: 0, total: 0 };
      cell.total += bucket.tokens.value;
      if (isRecompute) cell.recompute += bucket.tokens.value;
      cells.set(inst, cell);
    }
  }
  const medianByBucket = new Map<string, number>();
  for (const [key, cells] of perBucket) {
    const rates = [...cells.values()]
      .filter((c) => c.total > 0)
      .map((c) => c.recompute / c.total)
      .sort((a, b) => a - b);
    const mid = rates[Math.floor((rates.length - 1) / 2)];
    if (mid !== undefined) medianByBucket.set(key, mid);
  }
  return { windowByInstance, medianByBucket };
}


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

function IdentityBlock({
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

/** The stat row and the rate line: the page's verdict surface, all ratios. */
function HeadlineBlock({
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

/** Panel 3: the ranks as rate series, each rank's share of the node's recompute. */
function RanksBlock({
  ranks,
  winLabel,
}: {
  ranks: Resource<Stamped<BandsData>>;
  winLabel: string;
}): ReactNode {
  const head = `its ranks · share of the node's recompute · ${winLabel}`;
  const hover = <InfoHover of="entity_scope" label="scope" />;
  if (ranks.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        {ranks.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>The ranks fill with the first analysis pass.</p>
        ) : (
          <Refusal
            refusal={{
              cause: ranks.error.cause ?? 'engine_unavailable',
              message: ranks.error.message,
            }}
          />
        )}
      </Block>
    );
  }
  if (ranks.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        {null}
      </Block>
    );
  }
  const data = ranks.value.data;
  const view = bandsView(data, 'holder');
  const desc = servedWindow(data, winLabel);
  // Per bucket, each rank's share of the node's recompute: balanced ranks sit together at
  // 1/dp_size, and a rank hoarding the node's churn is a line nobody has to describe.
  const nodePerBucket = view.members[0]?.rows.map((_, i) =>
    view.members.reduce((a, m) => a + (m.rows[i]?.reduce((x, y) => x + y, 0) ?? 0), 0),
  ) ?? [];
  return (
    <Block head={head} extras={hover}>
      <RankSeries
        members={view.members.map((m) => {
          const [, rank, group] = m.key.split('/');
          return {
            key: m.key,
            label: `rank ${rank ?? '?'} / g${group ?? '?'}`,
            values: m.rows.map((bands, i) => {
              const node = nodePerBucket[i] ?? 0;
              const own = bands.reduce((a, b) => a + b, 0);
              return node > 0 ? own / node : 0;
            }),
            total: m.total,
          };
        })}
        labelOf={(i) => bucketLabel(desc, i)}
        tipLabelOf={(i) => {
          const at = desc.startMs + i * desc.bucketMs;
          return desc.bucketMs < 86_400_000 ? `${day(at)} ${clock(at)}` : day(at);
        }}
        tickEvery={desc.tickEvery}
        unit="share of the node's recompute per bucket · one line per rank · each rank opens its store timeline"
        fmt={(v) => percent(v, 0)}
        linkTo={(key) => {
          const [inst, rank, group] = key.split('/');
          if (inst === undefined || rank === undefined || group === undefined) return null;
          return `/instance/${encodeURIComponent(inst)}/rank/${rank}/${group}`;
        }}
        title="Each rank's share of this node's recompute per bucket, one line per rank. Balanced ranks sit together; a diverging line is the diagnosis."
      />
    </Block>
  );
}

/**
 * Panel 4: the mass this node held twice inside itself, over time, stacked by how many copies
 * it held at once — the workload page's copies panel cut to one node, in the same unit and
 * band vocabulary, so the two read bucket for bucket.
 *
 * Locality is the secondary axis, a toggle in the head of this one panel. It opens on the
 * across-ranks half because that is the half with a lever; the cache-groups half is a hybrid
 * model's architecture, shown on request so a hybrid node never appears to duplicate less than
 * it does. The panel used to percent-stack the two localities against each other, which on a
 * single-group node drew every bar at 100% and stated the duplication's character while
 * saying nothing about its size. The one action lives in the i hover.
 *
 * The bars take their width from the response's own `bucket_ms`:
 * minute-wide at the 3 h stop from the minute cut, hour-wide at 48 h, and at 14 d the hours
 * summed into days. The head states the width drawn, the way the other panels do.
 */
function DuplicationBlock({
  duplication,
  winLabel,
  asked,
  atFourteen,
}: {
  duplication: Resource<Stamped<InstanceDuplicationData>>;
  winLabel: string;
  /** The grain the page asked for, so a response served at another can say so. */
  asked: 'minute' | 'hour';
  atFourteen: boolean;
}): ReactNode {
  const [rawLocality, setLocality] = useQueryParam('dloc');
  const locality: Locality =
    rawLocality === 'group' || rawLocality === 'both' ? rawLocality : 'within';
  const words = localityWords(locality);
  // The span alone before a response arrives; the served grain joins it once stated.
  const head = `held twice inside this node · ${winLabel}`;
  const hover = <InfoHover of="internal_duplication" label="internal duplication" />;
  const control = (
    <CutBar
      groups={[
        {
          label: 'locality',
          options: LOCALITIES.map((l) => ({ id: l.id, label: l.label })),
          current: locality,
          onSelect: (id) => setLocality(id === 'within' ? null : id),
        },
      ]}
    />
  );
  if (duplication.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        {duplication.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>The panel fills with the first analysis pass.</p>
        ) : (
          <Refusal
            refusal={{
              cause: duplication.error.cause ?? 'engine_unavailable',
              message: duplication.error.message,
            }}
          />
        )}
      </Block>
    );
  }
  if (duplication.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        {null}
      </Block>
    );
  }

  const d = duplication.value.data;
  // The served width, off the response's own `bucket_ms`: minute-wide rows from the minute
  // cut at the 3 h stop, hour-wide from the hourly cut otherwise. At the 14 d stop the hours
  // are summed into days before drawing, a monoid-legal display grouping, so the chart draws
  // 14 columns and not 336 in the same width. The head states the width drawn.
  const groupMs = atFourteen ? DAY_MS : d.bucket_ms;
  const startMs = Math.floor(d.start_ms / groupMs) * groupMs;
  const desc = servedWindow({ bucket_ms: groupMs, start_ms: startMs, end_ms: d.end_ms }, winLabel);
  const servedHead = `${head} · ${desc.grainLabel}`;
  const noun = desc.grain === 'day' ? 'day' : desc.grain === 'hour' ? 'hour' : 'minute';
  const stamp = (
    <p className={styles['stamp']}>
      {d.grain !== asked && (
        <>
          asked at {asked} grain, served at {d.grain}: the bars are drawn at the served width ·{' '}
        </>
      )}
      {atFourteen && (
        <>
          hour rows summed to days · the per-instance table retains fourteen days, so the
          earliest hours may thin ·{' '}
        </>
      )}
      cannot tell you: {d.cannot_tell_you}
    </p>
  );
  if (d.rows.length === 0) {
    return (
      <Block head={servedHead} extras={hover}>
        <p className={styles['awaiting']}>
          A measured zero: the read looked at this node and found no internal duplication.
        </p>
        {stamp}
      </Block>
    );
  }

  // Each column is duplicated token-hours by copies band, the selected locality only, in the
  // unit the workload panel draws.
  const rows: number[][] = Array.from({ length: desc.n }, () => COPY_BAND_ROWS.map(() => 0));
  const byBand: number[] = COPY_BAND_ROWS.map(() => 0);
  for (const row of d.rows) {
    if (locality !== 'both' && row.locality !== locality) continue;
    const k = copiesBandIndex(row.copies_band);
    if (k < 0) continue;
    const cell = rows[Math.floor((row.bucket_ms - startMs) / groupMs)];
    if (cell === undefined) continue;
    const tokenHours = row.token_ms / HOUR_MS;
    cell[k] = (cell[k] ?? 0) + tokenHours;
    byBand[k] = (byBand[k] ?? 0) + tokenHours;
  }
  const shown = byBand.reduce((a, b) => a + b, 0);
  const dupTotal = d.within_ranks_token_ms + d.cache_groups_token_ms;
  const share = heldTwiceShare(d);

  // The headline pair: the ratified fraction, the same derivation as the tile above, and the
  // duplicated mass the chart below sums to. Absolutes and the mean ride the hovers.
  const kpis: Kpi[] = [
    {
      value: share === null ? '·' : rate(share),
      label: 'of held mass duplicated across ranks',
      wide: true,
      tip:
        share === null
          ? 'the node held nothing over the window, so the share is unstated'
          : `≥ ${compact(d.within_ranks_token_ms / HOUR_MS)} tok-h across ranks of ≥ ${compact(d.held_token_ms / HOUR_MS)} tok-h held over the window · the half a prefix-affinity gateway removes`,
    },
    {
      value: compact(shown),
      label: `tok-h duplicated ${words}`,
      tip: `≥ ${compact(d.within_ranks_token_ms / HOUR_MS)} tok-h across ranks, ≥ ${compact(d.cache_groups_token_ms / HOUR_MS)} tok-h across cache groups, over the window${dupTotal > 0 ? ` · mean copies ${multiplier(d.copies_token_ms / dupTotal)} over the duplicated mass` : ''}`,
    },
  ];

  if (shown === 0) {
    return (
      <Block head={servedHead} extras={hover}>
        {control}
        <KpiRow kpis={kpis} />
        <p className={styles['awaiting']}>
          A measured zero: the read looked at this node and found no duplication {words} over
          the window.
        </p>
        {stamp}
      </Block>
    );
  }

  return (
    <Block head={servedHead} extras={hover}>
      {control}
      <KpiRow kpis={kpis} />
      <BandStack
        rows={rows}
        bands={COPY_BAND_ROWS}
        labelOf={(i) => bucketLabel(desc, i)}
        tickEvery={desc.tickEvery}
        unit={`token-hours/${desc.unitName}`}
        unitShort="token-hours"
        bucketNoun={noun}
        height={160}
        title={`This node's duplicated token-hours per ${noun} ${words}, stacked by how many copies it held at once. Darkest is two copies.`}
      />
      <BandLegend
        bands={COPY_BAND_ROWS}
        titles={byBand.map(
          (v) => `≥ ${compact(v)} tok-h over the window · ${percent(v / shown, 1)} of the duplicated mass ${words}`,
        )}
      />
      {stamp}
    </Block>
  );
}

/** Panel 6: peers as a RATE. Ranked by mass, a busy node looks like an offender when it is
 * proportionate; ranked by rate, busy and wasteful separate, which is the question. */
function PeersBlock({
  peers,
  subject,
  winLabel,
}: {
  peers: Resource<Stamped<FiguresData>>;
  subject: string;
  winLabel: string;
}): ReactNode {
  const head = `among its peers · recompute rate · ${winLabel}`;
  const hover = <InfoHover of="entity_scope" label="scope" />;
  if (peers.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        {peers.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>The comparison fills with the first analysis pass.</p>
        ) : (
          <Refusal
            refusal={{
              cause: peers.error.cause ?? 'engine_unavailable',
              message: peers.error.message,
            }}
          />
        )}
      </Block>
    );
  }
  if (peers.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        {null}
      </Block>
    );
  }
  const { windowByInstance } = peerCells(peers.value.data);
  const members = [...windowByInstance.entries()]
    .filter(([, c]) => c.total > 0)
    .map(([key, c]) => ({
      key,
      label: key,
      total: c.recompute / c.total,
      detail: `≥ ${compact(c.recompute)} recomputed of ≥ ${compact(c.total)} stored`,
    }));
  return (
    <Block head={head} extras={hover}>
      <MemberDistribution
        members={members}
        noun="instance"
        subjectKey={subject}
        linkTo={(key) => (key === subject ? null : `/instance/${encodeURIComponent(key)}`)}
        fmt={rate}
      />
    </Block>
  );
}
