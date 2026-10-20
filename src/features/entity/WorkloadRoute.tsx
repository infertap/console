// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource, type Resource } from '../../data/react';
import type { BandsData, FiguresData, ReplicationData, Stamped } from '../../domain/contract';
import { COPY_BANDS } from '../../domain/lens';
import {
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
import { KpiRow } from '../../design-system/figure/KpiRow';
import {
  clock,
  compact,
  day,
  integer,
  multiplier,
  percent,
} from '../../design-system/format/numbers';
import { InfoHover } from '../../design-system/info/InfoHover';
import { Block } from '../../design-system/layout/Block';
import { Drill } from '../../design-system/layout/Drill';
import { useQueryParam, type RouteProps } from '../../design-system/navigation/router';
import { Refusal } from '../../design-system/refusal/Refusal';
import { GapOverTime } from './GapOverTime';
import { median, memberRates, rate, ratePoints } from './rates';
import { MemberDistribution } from './MemberDistribution';
import { RateChart } from './RateChart';
import { StatRow, type Tile } from './Tiles';
import styles from './Entity.module.css';

/**
 * Level 1: one workload, the middle facet — the instance page's grammar, one dim over.
 *
 * **A facet, not a container.** `workload_class` is declared per producer run, so it is a
 * time-varying label one instance can wear twice in a window; this page asserts no
 * containment the data cannot guarantee. Every headline is a ratio or a multiplier; the
 * masses live in the hovers; the workload's rate draws against the fleet's own rate, since
 * four workloads are too few for a median to mean anything.
 *
 * The `undeclared` page is a first-class member: most deployments declare no workload
 * labels, so the absent bucket is often the whole fleet, and a page that treated it as a
 * corner case would treat the default first-run state as one.
 */

export default function WorkloadRoute({ params }: RouteProps): ReactNode {
  const id = params['id'] ?? '';
  const [rawWin, setWin] = useQueryParam('win');
  // The entity stops, from the one stop list: the dashboard's three, since a workload is a
  // key column on every rollup including the minute tables.
  const win = windowKey(rawWin, ENTITY_STOPS) as '14d' | '48h' | '3h';
  const winLabel = stopLabel(win);
  const grain = stopGrain(win);
  // One grammar, one anchor: every read takes the stop itself.
  const relWindow = win;
  const bandsAsk = { window: win, grain } as const;

  // The rate's two halves from one read, scoped; the fleet's own from the same read unscoped.
  const figures = useResource(`wl:${id}:figures:${win}`, (ds) =>
    ds.figures({ window: relWindow, grain, dims: ['class'], workload: id }),
  );
  const fleet = useResource(`wl:fleet:${win}`, (ds) =>
    ds.figures({ window: relWindow, grain, dims: ['class'] }),
  );
  // The members and the peers: the same read one entity dim over. The instance cut serves at
  // minute from the rank-grain cells, so the members read takes the page's grain
  // like every other read here.
  const members = useResource(`wl:${id}:members:${win}`, (ds) =>
    ds.figures({ window: relWindow, grain, dims: ['instance', 'class'], workload: id }),
  );
  const peers = useResource(`wl:peers:${win}`, (ds) =>
    ds.figures({ window: relWindow, grain, dims: ['workload', 'class'] }),
  );
  const scopedByClass = useResource(`wl:${id}:${win}:cls`, (ds) =>
    ds.figureBands({ ...bandsAsk, workload: id, dims: 'class' }),
  );
  // The copies histogram cut to this workload: the same read the dashboard's copies panel
  // makes, at this page's window and tier, so the two agree bucket for bucket.
  const copies = useResource(`wl:${id}:copies:${win}`, (ds) =>
    ds.replication({ window: win, grain, workload: id }),
  );

  return (
    <Drill
      title={`workload · ${id}`}
      crumbs={[
        { to: '/', label: 'Dashboard' },
        { to: '/fleet', label: 'Fleet' },
      ]}
      stamp={
        id === 'undeclared' ? (
          <>
            the absent bucket as a named slice: runs that declared no workload label. Where
            nothing is declared this is the whole fleet, which is the default first-run state
            rather than a corner case.
          </>
        ) : (
          <>
            a declared label, per producer run: a time-varying facet one instance can wear
            twice in a window, not a container. Nothing above the rank is derivable.
          </>
        )
      }
    >
      <HeadlineBlock
        figures={figures}
        fleet={fleet}
        members={members}
        scoped={scopedByClass}
        workload={id}
        win={win}
        winLabel={winLabel}
        onWin={(w) => setWin(w === '14d' ? null : w)}
      />

      <GapOverTime scopedByClass={scopedByClass} win={win} />

      <CopiesBlock copies={copies} workload={id} winLabel={winLabel} />

      <MembersBlock members={members} winLabel={winLabel} />

      <PeersBlock peers={peers} subject={id} winLabel={winLabel} />
    </Drill>
  );
}

/** The dashboard's copy-band tones, in band order. The same four the copies panel paints. */
const COPY_TONES = ['var(--cap-4)', 'var(--cap-3)', 'var(--cap-2)', 'var(--cap-1)'] as const;
const COPY_BAND_ROWS: readonly Band[] = COPY_BANDS.map((band, i) => ({
  ...band,
  tone: COPY_TONES[i] ?? 'var(--pencil)',
}));

/**
 * This workload's duplicated mass over time, by simultaneous copy count — the dashboard's
 * copies panel cut to one workload, on this page's own window.
 *
 * Duplication does not scope like the other figures: it is a property of a content identity
 * ACROSS holders, so below the fleet it reads as "how much of what this workload holds is
 * also held elsewhere", and the remedy split (cross-engine / within-engine / cache-group) is
 * a fleet scalar that stays on the dashboard. What this block states is the mass, its share
 * of the fleet's duplicated mass, and its band profile.
 */
function CopiesBlock({
  copies,
  workload,
  winLabel,
}: {
  copies: Resource<Stamped<ReplicationData>>;
  workload: string;
  winLabel: string;
}): ReactNode {
  const hover = <InfoHover of="replication" label="the copies histogram" />;
  if (copies.status === 'failed') {
    return (
      <Block head={`held more than once · ${workload} · ${winLabel}`} extras={hover}>
        {copies.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>
            The histogram fills with the producer's first emission over this workload.
          </p>
        ) : (
          <Refusal
            refusal={{
              cause: copies.error.cause ?? 'engine_unavailable',
              message: copies.error.message,
            }}
          />
        )}
      </Block>
    );
  }
  if (copies.status === 'loading') {
    return (
      <Block head={`held more than once · ${workload} · ${winLabel}`} extras={hover}>
        {null}
      </Block>
    );
  }
  const data = copies.value.data;
  const desc = servedWindow(data, winLabel);
  const member = data.members.find((m) => m.key === workload);
  const rows = data.rows.map((row) => [
    row.k2 / HOUR_MS,
    row.k34 / HOUR_MS,
    row.k58 / HOUR_MS,
    row.k9 / HOUR_MS,
  ]);
  const dup = data.window_dup_token_ms / HOUR_MS;
  return (
    <Block
      head={`held more than once · ${workload} · ${desc.rangeLabel} · ${desc.grainLabel}`}
      extras={hover}
    >
      <KpiRow
        kpis={[
          { value: compact(dup), label: 'tok-h duplicated', wide: true },
          ...(member
            ? [
                {
                  value: percent(member.share, 1),
                  label: "of the fleet's duplicated mass",
                  tip: 'its weight among the workloads, not its rate',
                },
              ]
            : []),
        ]}
      />
      <BandStack
        rows={rows}
        bands={COPY_BAND_ROWS}
        labelOf={(i) => bucketLabel(desc, i)}
        tickEvery={desc.tickEvery}
        unit={`token-hours/${desc.unitName}`}
        unitShort="token-hours"
        bucketNoun={desc.unitName === 'h' ? 'hour' : desc.unitName === 'min' ? 'minute' : desc.unitName}
        height={160}
        title="This workload's duplicated token-hours per bucket, stacked by simultaneous copy count. Darkest is two copies."
      />
      <BandLegend
        bands={COPY_BAND_ROWS}
        titles={(member?.profile ?? []).map((p) => `${integer(Math.round(dup * p))} tok-h · ${percent(p, 1)}`)}
      />
      <p className={styles['stamp']}>
        {data.emitted_to_ms != null ? (
          <>
            complete through <b>{day(data.emitted_to_ms)} {clock(data.emitted_to_ms)}</b> ·
            unstated beyond it ·{' '}
          </>
        ) : null}
        the remedy split is a fleet figure and stays on the dashboard
      </p>
    </Block>
  );
}

function HeadlineBlock({
  figures,
  fleet,
  members,
  scoped,
  workload,
  win,
  winLabel,
  onWin,
}: {
  figures: Resource<Stamped<FiguresData>>;
  fleet: Resource<Stamped<FiguresData>>;
  members: Resource<Stamped<FiguresData>>;
  scoped: Resource<Stamped<BandsData>>;
  workload: string;
  win: WindowKey;
  winLabel: string;
  onWin: (id: string) => void;
}): ReactNode {
  const head = `recompute rate · ${workload} · ${winLabel}`;
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

  const fleetPoints = fleet.status === 'ready' ? ratePoints(fleet.value.data) : null;
  const fleetRecompute = fleetPoints?.reduce((a, p) => a + p.recompute, 0) ?? 0;
  const fleetTotal = fleetPoints?.reduce((a, p) => a + p.total, 0) ?? 0;

  const nodeCells = members.status === 'ready' ? memberRates(members.value.data, 'instance') : null;
  const nodeMasses = nodeCells === null ? [] : [...nodeCells.values()].map((c) => c.recompute);
  const busiest = Math.max(...nodeMasses, 0);
  const medianNode = median(nodeMasses);

  const gapUnobserved = scoped.status === 'ready' ? scoped.value.data.gap_unobserved.value : null;

  const tiles: Tile[] = [
    {
      value: total > 0 ? rate(recompute / total) : 'none',
      unit: 'of its cache work recomputed',
      ...(fleetTotal > 0 ? { sub: `fleet ${rate(fleetRecompute / fleetTotal)}` } : {}),
      spark: points.map((p) => (p.total > 0 ? p.recompute / p.total : 0)),
      tip: `≥ ${integer(recompute)} recomputed of ≥ ${integer(total)} stored tokens${coverage === null ? '' : ` · ${percent(coverage, 1)} token-weighted coverage`}`,
    },
    {
      value: fleetRecompute > 0 ? percent(recompute / fleetRecompute, 1) : '·',
      unit: "of the fleet's recompute",
      sub: 'its weight, not its rate',
      ...(fleetRecompute > 0
        ? { tip: `≥ ${integer(recompute)} of the fleet's ≥ ${integer(fleetRecompute)} recomputed tokens` }
        : {}),
    },
    {
      value:
        nodeMasses.length < 2 || medianNode <= 0 ? '·' : multiplier(busiest / medianNode),
      unit: 'busiest ÷ median instance',
      sub: 'balanced is 1×',
      ...(nodeCells !== null && medianNode > 0
        ? {
            tip: `busiest instance ≥ ${integer(busiest)} recomputed tokens, median ≥ ${integer(Math.round(medianNode))}, over the window`,
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

  // The fleet's own per-bucket rate as the reference band: four workloads are too few for a
  // median to mean anything, and the fleet rate is the number the operator already knows.
  const fleetByBucket = new Map(fleetPoints?.map((p) => [p.key, p]) ?? []);
  const refSeries =
    fleetPoints === null
      ? null
      : points.map((p) => {
          const f = fleetByBucket.get(p.key);
          return f !== undefined && f.total > 0 ? f.recompute / f.total : 0;
        });

  return (
    <Block head={head} extras={hover}>
      {control}
      <StatRow tiles={tiles} />
      <RateChart
        values={points.map((p) => (p.total > 0 ? p.recompute / p.total : 0))}
        median={refSeries}
        refLabel="fleet"
        labelOf={(i) => {
          const key = points[i]?.key ?? '';
          return key.length > 10 ? `${key.slice(11, 16)}` : key.slice(5, 10);
        }}
        tipLabelOf={(i) => {
          const key = points[i]?.key ?? '';
          return key.length > 10 ? `${key.slice(0, 10)} ${key.slice(11, 16)}Z` : key;
        }}
        tickEvery={Math.max(1, Math.ceil(points.length / 8))}
        title="This workload's recompute rate per bucket, the fleet's own rate as the faint band behind it."
      />
    </Block>
  );
}

/** The instances carrying this workload, ranked by RATE: busy and wasteful separate. */
function MembersBlock({
  members,
  winLabel,
}: {
  members: Resource<Stamped<FiguresData>>;
  winLabel: string;
}): ReactNode {
  const head = `its instances · recompute rate · ${winLabel}`;
  const hover = <InfoHover of="entity_scope" label="scope" />;
  if (members.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        {members.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>The members fill with the first analysis pass.</p>
        ) : (
          <Refusal
            refusal={{
              cause: members.error.cause ?? 'engine_unavailable',
              message: members.error.message,
            }}
          />
        )}
      </Block>
    );
  }
  if (members.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        {null}
      </Block>
    );
  }
  const cells = memberRates(members.value.data, 'instance');
  return (
    <Block head={head} extras={hover}>
      <MemberDistribution
        members={[...cells.entries()]
          .filter(([, c]) => c.total > 0)
          .map(([key, c]) => ({
            key,
            label: key,
            total: c.recompute / c.total,
            detail: `≥ ${compact(c.recompute)} recomputed of ≥ ${compact(c.total)} stored`,
          }))}
        noun="instance"
        linkTo={(key) => `/instance/${encodeURIComponent(key)}`}
        fmt={rate}
      />
    </Block>
  );
}

/** The other workloads, as rates, each a link; the subject inked. */
function PeersBlock({
  peers,
  subject,
  winLabel,
}: {
  peers: Resource<Stamped<FiguresData>>;
  subject: string;
  winLabel: string;
}): ReactNode {
  const head = `among the workloads · recompute rate · ${winLabel}`;
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
  const cells = memberRates(peers.value.data, 'workload');
  return (
    <Block head={head} extras={hover}>
      <MemberDistribution
        members={[...cells.entries()]
          .filter(([, c]) => c.total > 0)
          .map(([key, c]) => ({
            key,
            label: key,
            total: c.recompute / c.total,
            detail: `≥ ${compact(c.recompute)} recomputed of ≥ ${compact(c.total)} stored`,
          }))}
        noun="workload"
        subjectKey={subject}
        linkTo={(key) => (key === subject ? null : `/workload/${encodeURIComponent(key)}`)}
        fmt={rate}
      />
    </Block>
  );
}
