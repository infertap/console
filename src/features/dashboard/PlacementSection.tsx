// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource, type Resource } from '../../data/react';
import type { MarkerJson, PlacementData, Stamped, WhalesData } from '../../domain/contract';
import { COPY_BANDS, type ScenarioKey } from '../../domain/lens';
import {
  DAY_MS,
  WINDOW_STOPS,
  bucketLabel,
  markerFrac,
  msToRangeInput,
  perDay,
  servedWindow,
  spanFracs,
  stopGrain,
  stopLabel,
} from '../../domain/windows';
import { usePanelWindow } from '../../design-system/controls/panelWindow';
import { BandStack, type Band, type ChartMarker } from '../../design-system/chart/BandStack';
import { BandLegend, CompositionBar, RowStrip } from '../../design-system/chart/Bands';
import { CutBar } from '../../design-system/controls/CutBar';
import { RangeRow } from '../../design-system/controls/RangeRow';
import { AnchorLine } from '../../design-system/figure/AnchorLine';
import { KpiRow } from '../../design-system/figure/KpiRow';
import { compact, integer, multiplier, percent } from '../../design-system/format/numbers';
import { InfoHover } from '../../design-system/info/InfoHover';
import { Block, BlockRow, Section, SubBlock } from '../../design-system/layout/Block';
import { Link, useQueryParam } from '../../design-system/navigation/router';
import { Refusal } from '../../design-system/refusal/Refusal';
import table from '../../design-system/table/Table.module.css';
import { Attribution, daggerOf, markerAtLabel } from './Attribution';
import { PlacementMatrix } from './PlacementMatrix';
import styles from './RepeatCompute.module.css';

/**
 * Section 2: placement, with the replication histogram as its headline.
 *
 * **Token-hours by copy band supersede the max-k daily figure**: a time integral merges across
 * days, workloads and fleets and never refuses a window total, which is the comparable,
 * attributable form of the same phenomenon. The anchor states the fleet's daily rates; the
 * copies panel is the working surface; the pair matrix and the whale drill sit beside it as
 * independent blocks, because they do not follow the panel's cut and its controls must not
 * touch them.
 *
 * **One code path per figure.** The pairs, weakest-cell and cross-engine gauges compute from
 * the placement read in both modes; only the band decomposition, the anchor's cached
 * denominator and the whales ride the pre-contract lens, and each states its absence in live
 * mode rather than borrowing a stand-in from the wrong register.
 */

const HOUR_MS = 3_600_000;

/** The capacity register's own ramp. Darkest is two copies. */
const COPY_TONES = ['var(--cap-4)', 'var(--cap-3)', 'var(--cap-2)', 'var(--cap-1)'] as const;

const BANDS: readonly Band[] = COPY_BANDS.map((band, i) => ({
  ...band,
  tone: COPY_TONES[i] ?? 'var(--pencil)',
}));

export function PlacementSection({
  placement,
  markers,
}: {
  placement: Resource<Stamped<PlacementData>>;
  markers: readonly MarkerJson[];
}): ReactNode {
  // One read powers the anchor and the whale table: the window totals and the rows they were
  // cut from arrive together, so the fraction and its worst contributors cannot disagree.
  const whales = useResource('whales:14d', (ds) => ds.whales({ window: '14d', limit: 8 }));
  return (
    <Section name="Placement" id="placement" definition="replication" hoverTitle="replication">
      <PlacementAnchor />
      <CopiesPanel placement={placement} markers={markers} />
      <BlockRow>
        <PairsBlock placement={placement} />
        <WhalesBlock whales={whales} />
      </BlockRow>
    </Section>
  );
}

/**
 * Fleet status is its own anchor block, stamped: never mixed into a cut-scoped gauge row.
 *
 * One replication read at the stamped window serves the whole line: the duplicated share over
 * ALL cached mass (k=1 in the denominator), the daily rates, the cross-engine share from the
 * remedy split, and the mean-copies hover from the exact pair the wire carries: a real summed
 * measure, never a midpoint approximation.
 */
function PlacementAnchor(): ReactNode {
  const anchor = useResource('replication:anchor', (ds) => ds.replication({ window: '14d' }));

  if (anchor.status === 'failed') {
    return (
      <Block head="fleet · daily rates">
        {anchor.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>
            The anchor fills with the first analysis pass. Nothing here is a zero.
          </p>
        ) : (
          <Refusal
            refusal={{
              cause: anchor.error.cause ?? 'engine_unavailable',
              message: anchor.error.message,
              ...(anchor.error.bound === undefined ? {} : { bound: anchor.error.bound }),
            }}
          />
        )}
      </Block>
    );
  }
  if (anchor.status === 'loading') {
    return <Block head="fleet · daily rates">{null}</Block>;
  }

  const d = anchor.value.data;
  const days = Math.max(1, Math.round((d.end_ms - d.start_ms) / DAY_MS));
  // One derivation for every daily rate on the glass: the response's own span, never a
  // rounded day count or a per-panel divisor.
  const dupPerDay = perDay(d.window_dup_token_ms, d.end_ms - d.start_ms);
  const heldPerDay = perDay(d.window_held_token_ms, d.end_ms - d.start_ms);
  // The three-way remedy split's whole: cross-engine (routing), within-engine across ranks
  // (placement), cache-group (a hybrid model's architecture, never rendered as waste).
  const split = d.cross_engine_token_ms + d.within_engine_token_ms + d.cache_group_token_ms;

  return (
    <Block head={`fleet · stamped ${integer(days)} d · daily rates`}>
      <AnchorLine
        headline={
          d.window_held_token_ms > 0
            ? percent(d.window_dup_token_ms / d.window_held_token_ms, 1)
            : 'none yet'
        }
        unit={`of ${compact(heldPerDay)} tok-h/day cached held more than once`}
        {...(d.window_held_token_ms > 0
          ? {
              tip: `mean copies ${multiplier(d.copies_token_ms / d.window_held_token_ms)} per cached token-hour`,
            }
          : {})}
        items={[
          { label: 'duplicated', value: `${compact(dupPerDay)} tok-h/day` },
          ...(split > 0
            ? [
                {
                  label: 'cross-engine',
                  value: percent(d.cross_engine_token_ms / split, 0),
                },
              ]
            : []),
          // Stated so a hybrid fleet's remainder does not read as placement waste. Zero on
          // every single-group model, and silent there: conformity is silent.
          ...(d.cache_group_token_ms > 0 && split > 0
            ? [
                {
                  label: 'cache-group, architectural',
                  value: percent(d.cache_group_token_ms / split, 0),
                },
              ]
            : []),
        ]}
      />
    </Block>
  );
}

/** Per-member day-grain stats from the placement read: one code path, both modes. */
interface CutStats {
  readonly tokenHours: number;
  readonly crossShare: number;
  readonly pairs: number;
  readonly weakest: number;
  readonly days: number;
}

function cutStats(d: PlacementData, member: string): CutStats {
  const rows = member === 'fleet' ? d.rows : d.rows.filter((r) => r.workload === member);
  const within =
    member === 'fleet' ? d.within_engine : d.within_engine.filter((r) => r.workload === member);
  const cross = rows.reduce((a, r) => a + r.token_ms.value, 0);
  const inside = within.reduce((a, r) => a + r.token_ms.value, 0);
  const pairs = new Set(rows.map((r) => `${r.engine_a}|${r.engine_b}`)).size;
  const weakest = [...rows, ...within].reduce((a, r) => Math.min(a, r.token_ms.coverage), 1);
  const days = new Set([...rows, ...within].map((r) => r.day)).size;
  return {
    tokenHours: (cross + inside) / HOUR_MS,
    crossShare: cross + inside > 0 ? cross / (cross + inside) : 0,
    pairs,
    weakest,
    days,
  };
}

function CopiesPanel({
  placement,
  markers,
}: {
  placement: Resource<Stamped<PlacementData>>;
  markers: readonly MarkerJson[];
}): ReactNode {
  const [rawSel, setSel] = useQueryParam('psel');
  const [rawMk, setMk] = useQueryParam('pmk');
  const [rawSc] = useQueryParam('sc');
  // This panel's window, under its own prefix: the same stops and the same default as the
  // thrash lens above it, moved independently, as containment requires.
  const pw = usePanelWindow('p');
  const { win } = pw;
  const scenario: ScenarioKey = rawSc === 'reg' ? 'reg' : 'win';

  // One grammar and one grain vocabulary (landing 2): the same window and the same explicit
  // tier per stop as the thrash lens asks, so the two charts on this page draw the same
  // buckets over the same hours. A custom range lets the server choose and states why.
  const copies = useResource(`replication:${rawSel ?? ''}:${pw.ask}`, (ds) =>
    ds.replication({
      window: pw.ask,
      grain: win === 'custom' ? ('auto' as const) : stopGrain(win),
      ...(rawSel ? { workload: rawSel } : {}),
    }),
  );

  const placementData = placement.status === 'ready' ? placement.value.data : null;
  const memberKey = rawSel ?? 'fleet';
  const stats = placementData ? cutStats(placementData, memberKey) : null;
  const hover = <InfoHover of="replication" label="the copies histogram" />;

  if (copies.status === 'failed') {
    return (
      <Block head={`copies · ${memberKey}`} extras={hover}>
        {copies.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>
            The histogram fills with the first analysis pass over the producer's copy-count
            bands.
          </p>
        ) : (
          <Refusal
            refusal={{
              cause: copies.error.cause ?? 'engine_unavailable',
              message: copies.error.message,
              ...(copies.error.bound === undefined ? {} : { bound: copies.error.bound }),
            }}
          />
        )}
      </Block>
    );
  }
  if (copies.status === 'loading') {
    return (
      <Block head={`copies · ${memberKey}`} extras={hover}>
        {null}
      </Block>
    );
  }

  const data = copies.value.data;
  const desc = servedWindow(data, win === 'custom' ? undefined : stopLabel(win));
  const member =
    data.members.find((m) => m.key === (data.workload ?? 'fleet')) ?? data.members[0];
  const rows = data.rows.map((row) => [
    row.k2 / HOUR_MS,
    row.k34 / HOUR_MS,
    row.k58 / HOUR_MS,
    row.k9 / HOUR_MS,
  ]);
  // The same daily-rate derivation the anchor uses, over the served span.
  const dupPerDay = perDay(data.window_dup_token_ms, desc.spanMs);
  const split =
    data.cross_engine_token_ms + data.within_engine_token_ms + data.cache_group_token_ms;

  const chartMarkers: ChartMarker[] = markers
    .map((m) => {
      const frac = markerFrac(m.at_ms, desc);
      if (frac === null) return null;
      return {
        id: m.id,
        dagger: daggerOf(markers, m.id),
        atLabel: markerAtLabel(m),
        frac,
        breaks: m.breaks,
      };
    })
    .filter((m): m is ChartMarker => m !== null);
  const selectedMarker = markers.find((m) => m.id === rawMk) ?? null;

  return (
    <Block
      head={`copies · ${member?.key ?? 'fleet'} · ${desc.rangeLabel} · ${desc.grainLabel}`}
      extras={hover}
    >
      <CutBar
        groups={[
          {
            label: 'cut',
            options: data.members.map((m) => ({ id: m.key, label: m.label })),
            current: member?.key ?? 'fleet',
            onSelect: (id) => setSel(id === 'fleet' ? null : id),
          },
          {
            label: 'window',
            options: WINDOW_STOPS.map((s) => ({ id: s.key, label: s.label })),
            current: win,
            onSelect: (id) => pw.select(id, desc),
          },
        ]}
      />

      {win === 'custom' && (
        <RangeRow
          from={pw.from ?? msToRangeInput(desc.startMs)}
          to={pw.to ?? msToRangeInput(desc.startMs + desc.spanMs)}
          min="2021-08-04T00:00"
          max={msToRangeInput(desc.startMs + desc.spanMs + 366 * DAY_MS)}
          onFrom={(v) => pw.setFrom(v, desc)}
          onTo={(v) => pw.setTo(v, desc)}
          desc={desc}
        />
      )}

      {/* Every gauge follows the cut; the first two follow the window too. */}
      <KpiRow
        kpis={[
          {
            value: compact(data.window_dup_token_ms / HOUR_MS),
            label: 'tok-h duplicated',
            wide: true,
          },
          ...(split > 0
            ? [
                {
                  value: percent(data.cross_engine_token_ms / split, 0),
                  label: 'cross-engine',
                  tip: 'of the duplicated mass; the rest sits inside single engines, across ranks or across a hybrid model’s cache groups (the group share is architecture, not waste)',
                },
              ]
            : []),
          ...(stats
            ? [
                { value: integer(stats.pairs), label: 'pairs' },
                {
                  value: percent(stats.weakest, 0),
                  label: 'weakest cell',
                  tip: "lowest pair-observed time in this cut's pairs",
                },
              ]
            : []),
        ]}
      />

      <SubBlock>
        <BandStack
          rows={rows}
          bands={BANDS}
          labelOf={(i) => bucketLabel(desc, i)}
          tickEvery={desc.tickEvery}
          unit={`token-hours/${desc.unitName}`}
          unitShort="token-hours"
          bucketNoun={
            desc.unitName === 'h' ? 'hour' : desc.unitName === '5 min' ? 'bucket' : desc.unitName
          }
          height={200}
          markers={chartMarkers}
          selectedMarker={rawMk}
          spans={selectedMarker ? spanFracs(selectedMarker, desc) : null}
          title="Duplicated token-hours per bucket, stacked by simultaneous copy count. Darkest is two copies."
        />
        <BandLegend
          bands={BANDS}
          titles={(member?.profile ?? []).map(
            (p) => `${integer(Math.round(dupPerDay * p))} tok-h/day · ${percent(p, 1)}`,
          )}
        />
        <CompositionBar
          label={`composition · ${member?.key ?? 'fleet'} · ${desc.rangeLabel}`}
          shares={member?.profile ?? []}
          bands={BANDS}
          titles={(member?.profile ?? []).map(
            (p) => `${integer(Math.round(dupPerDay * p))} tok-h/day`,
          )}
        />
      </SubBlock>

      <Attribution
        markers={markers}
        selectedId={rawMk}
        onSelect={(id) => setMk(id)}
        scope={member?.key ?? 'fleet'}
        scopeLabel={member?.key ?? 'fleet'}
        primary="du"
        scenario={scenario}
      />

      <SubBlock head="breakdown · by workload">
        <div className="table-scroll">
          <table className={`${table['table']} ${styles['working']}`}>
            <thead>
              <tr>
                <th>workload</th>
                <th>copies</th>
                <th className={table['num']}>tok-h/day</th>
                <th className={table['num']}>share</th>
                <th className={table['num']}>cross-engine</th>
                <th className={table['num']}>pairs</th>
                <th className={table['num']}>weakest cell</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.members
                .filter((m) => m.key !== 'fleet')
                .map((m) => {
                  const s = placementData ? cutStats(placementData, m.key) : null;
                  // The fleet's daily rate, from the selected member's own total and share, so
                  // every row scales from the one figure the response actually stated.
                  const fleetPerDay =
                    member && member.share > 0 ? dupPerDay / member.share : dupPerDay;
                  return (
                    <tr
                      key={m.key}
                      className={table['row']}
                      aria-pressed={m.key === member?.key}
                      tabIndex={0}
                      onClick={() => setSel(m.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSel(m.key);
                      }}
                    >
                      <td className={m.key === 'undeclared' ? table['undeclared'] : undefined}>
                        {m.label}
                      </td>
                      <td>
                        <RowStrip shares={m.profile} bands={BANDS} />
                      </td>
                      <td className={table['num']}>
                        {integer(Math.round(fleetPerDay * m.share))}
                      </td>
                      <td className={table['num']}>{percent(m.share, 1)}</td>
                      <td className={table['num']}>{s ? percent(s.crossShare, 0) : '·'}</td>
                      <td className={table['num']}>{s ? integer(s.pairs) : '·'}</td>
                      <td className={table['num']}>{s ? percent(s.weakest, 0) : '·'}</td>
                      <td className={table['chev']}>
                        <Link
                          className={table['link']}
                          to={`/workload/${encodeURIComponent(m.key)}`}
                          title={`open ${m.label}'s page`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          ›
                        </Link>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </SubBlock>
    </Block>
  );
}

/** The pair matrix: independent of the copies cut, so an independent block whose controls the
 * panel above cannot touch. Day grain deliberately: pairs are quadratic in fleet. */
function PairsBlock({ placement }: { placement: Resource<Stamped<PlacementData>> }): ReactNode {
  const extras = <InfoHover of="pairs" label="engine pairs" />;
  if (placement.status === 'failed') {
    return (
      <Block head="engine pairs · day grain" extras={extras}>
        {placement.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>
            The matrix fills once a pass has derived the pair overlaps.
          </p>
        ) : (
          <Refusal
            refusal={{
              cause: placement.error.cause ?? 'engine_unavailable',
              message: placement.error.message,
              ...(placement.error.bound === undefined ? {} : { bound: placement.error.bound }),
            }}
          />
        )}
      </Block>
    );
  }
  if (placement.status === 'loading') {
    return (
      <Block head="engine pairs · day grain" extras={extras}>
        {null}
      </Block>
    );
  }

  const d = placement.value.data;

  return (
    <Block head="engine pairs · day grain" extras={extras}>
      {d.rows.length === 0 ? (
        <p className={styles['awaiting']}>No analysis has covered a day yet.</p>
      ) : (
        <PlacementMatrix placement={d} />
      )}
    </Block>
  );
}

/**
 * The whale drill: the heaviest duplicated identities.
 *
 * The bound is by identities, worst first, and a whale is whole or absent. No coverage figure,
 * by statement rather than omission: the integrals are exact through the producer's emission
 * frontier, so the stamp renders that edge as the unproven edge.
 */
function WhalesBlock({ whales }: { whales: Resource<Stamped<WhalesData>> }): ReactNode {
  if (whales.status === 'failed') {
    return (
      <Block head="heaviest identities">
        {whales.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>The table fills with the first analysis pass.</p>
        ) : (
          <Refusal
            refusal={{
              cause: whales.error.cause ?? 'engine_unavailable',
              message: whales.error.message,
              ...(whales.error.bound === undefined ? {} : { bound: whales.error.bound }),
            }}
          />
        )}
      </Block>
    );
  }
  if (whales.status === 'loading') {
    return <Block head="heaviest identities">{null}</Block>;
  }

  const data = whales.value.data;
  return (
    <Block head="heaviest identities">
      <div className="table-scroll">
        <table className={table['table']} style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th>identity</th>
              <th className={table['num']} title="token-hours held at two or more simultaneous copies">
                duplicated tok-h
              </th>
              <th
                className={table['num']}
                title="of the token-hours this identity was held at any copy count: the row's own denominator"
              >
                of its held
              </th>
              <th className={table['num']} title="the identity's token mass">
                tokens
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((whale) => (
              <tr key={whale.identity} className={table['row']}>
                <td>
                  <Link
                    className={table['link']}
                    to={`/block/${encodeURIComponent(whale.identity)}`}
                  >
                    {whale.identity}
                  </Link>
                </td>
                <td
                  className={table['num']}
                  title={
                    whale.dup_token_ms_bound > 0
                      ? `in ${integer(whale.days_in_cut)} days' cuts; at most ${integer(whale.dup_token_ms_bound / HOUR_MS)} tok-h more on the days it was left out`
                      : `in every stated day's cut: exact`
                  }
                >
                  {whale.dup_token_ms_bound > 0 ? '≥ ' : ''}
                  {integer(whale.dup_token_ms / HOUR_MS)}
                </td>
                <td className={table['num']}>
                  {whale.held_token_ms > 0
                    ? percent(whale.dup_token_ms / whale.held_token_ms, 0)
                    : '·'}
                </td>
                <td className={table['num']}>{integer(whale.n_tokens)}</td>
                <td className={table['chev']}>›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles['stamp']}>
        top <b>{integer(data.rows.length)}</b> over <b>{integer(data.days_stated)}</b> settled
        days, each day cut at its heaviest <b>{integer(data.cut)}</b> ·{' '}
        <b>{integer(data.duplicated_identity_days)}</b> identity-days with duplicated time ·
        today is stated once it settles
      </p>
    </Block>
  );
}
