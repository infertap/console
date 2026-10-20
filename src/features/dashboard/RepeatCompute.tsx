// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource, type Resource } from '../../data/react';
import type { FiguresData, MarkerJson, Stamped } from '../../domain/contract';
import { bandsView } from '../../domain/bands';
import { GAP_BANDS, type CutKey, type ScenarioKey } from '../../domain/lens';
import { RECOMPUTE_CLASSES } from '../../domain/trend';
import {
  WINDOW_STOPS,
  bucketLabel,
  markerFrac,
  msToRangeInput,
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
import { compact, integer, percent } from '../../design-system/format/numbers';
import { InfoHover } from '../../design-system/info/InfoHover';
import { Block, Section, SubBlock } from '../../design-system/layout/Block';
import { Link, useQueryParam } from '../../design-system/navigation/router';
import { Refusal } from '../../design-system/refusal/Refusal';
import table from '../../design-system/table/Table.module.css';
import { Attribution, daggerOf, markerAtLabel } from './Attribution';
import styles from './RepeatCompute.module.css';

/**
 * Section 1: the repeat-compute meter, with the thrash lens as its face.
 *
 * **The anchor is one line**: fraction, total, coverage. The v3.1 ruling demoted the aggregate
 * to denominator and warrant, and the lens below is the meter face: the same mass, decomposed
 * by how long the block had been gone, over a window the operator picks. No verdict words and
 * no declared-threshold chip: the threshold family is deferred, and with no declared line there
 * is no honest fine/impaired verdict to render.
 *
 * **Containment**: every control in the lens panel's head changes only what the panel contains.
 * Cut, window, member, marker all ride the URL, so any view is a link a reader can send.
 */

/** The recompute register borrows the seq scale; darkest is the shortest gap. */
const GAP_TONES = [
  'var(--seq-7)',
  'var(--seq-5)',
  'var(--seq-3)',
  'var(--seq-1)',
] as const;

const BANDS: readonly Band[] = GAP_BANDS.map((band, i) => ({
  ...band,
  tone: GAP_TONES[i] ?? 'var(--pencil)',
}));

const CUT_KEYS: readonly CutKey[] = ['fleet', 'workload', 'instance', 'model'];

/**
 * The wire dim each cut asks for. Fleet is the uncut read. "By instance" asks for the
 * INSTANCE dim: a node, every rank and cache group rolled up, the same entity the fleet index
 * lists and the instance page is about. It used to ask for the holder triple and render ranks
 * under the word "instance", one grain finer than the page beside it meant by the same word.
 */
const CUT_DIMS: Readonly<Record<CutKey, string | null>> = {
  fleet: null,
  workload: 'workload',
  instance: 'instance',
  model: 'model',
};

/** The instance cut's table is a top-N of the nodes the read returned, worst first. */
const INSTANCE_CUT_TOP = 8;

export function RepeatCompute({
  figures,
  markers,
}: {
  /** The stamped window's figures, class-dimensioned: the anchor's whole diet. */
  figures: Resource<Stamped<FiguresData>>;
  markers: readonly MarkerJson[];
}): ReactNode {
  return (
    <Section name="Repeat compute" id="waste" definition="repeat_compute" hoverTitle="repeat compute">
      <AnchorBlock figures={figures} />
      <ThrashLens markers={markers} />
    </Section>
  );
}

/** The anchor line: fleet, stamped window. Renders at every age; before the first pass it
 * states why there is no figure, in the position the figure holds forever. */
function AnchorBlock({ figures }: { figures: Resource<Stamped<FiguresData>> }): ReactNode {
  if (figures.status === 'loading') {
    return <Block head="fleet · stamped window">{null}</Block>;
  }
  if (figures.status === 'failed') {
    return (
      <Block head="fleet · stamped window">
        {figures.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>
            No analysis has classified a day yet. The anchor fills with the first analysis; nothing
            here is a zero.
          </p>
        ) : (
          <Refusal
            refusal={{
              cause: figures.error.cause ?? 'engine_unavailable',
              message: figures.error.message,
              ...(figures.error.bound === undefined ? {} : { bound: figures.error.bound }),
            }}
          />
        )}
      </Block>
    );
  }

  const { stamp, data } = figures.value;
  // The stamped segment: the newest with figures. Numerator and denominator from ONE read.
  const stamped = [...data.segments].reverse().find((s) => s.figures && s.figures.length > 0);
  let stored = 0;
  let recompute = 0;
  let weighted = 0;
  for (const bucket of stamped?.figures ?? []) {
    const cls = bucket.dims.find((d) => d.dim === 'class')?.value;
    stored += bucket.tokens.value;
    if (cls !== undefined && RECOMPUTE_CLASSES.includes(cls)) {
      recompute += bucket.tokens.value;
      weighted += bucket.tokens.coverage * bucket.tokens.value;
    }
  }
  const coverage = recompute > 0 ? weighted / recompute : 0;
  // The span the mass was summed over: the stamped SEGMENT's own window, so the numerator and
  // the days it is stated over come from the same read. The stamp's window is the widened
  // request, which a generation seam can leave wider than the segment that carried figures.
  const span = stamped?.window ?? stamp.window;
  const days = span ? Math.max(1, Math.round((span.end_ms - span.start_ms) / 86_400_000)) : 0;

  return (
    <Block head={`fleet · stamped ${integer(days)} d`}>
      <AnchorLine
        headline={stored > 0 ? percent(recompute / stored, 2) : 'none yet'}
        unit={stored > 0 ? `of ${compact(stored)} stored` : 'nothing stored in the window'}
        items={[
          {
            label: 'repeat compute',
            value: `≥ ${integer(recompute)} tokens · ${integer(days)} d`,
          },
          { label: 'coverage', value: `${percent(coverage, 1)} token-weighted` },
        ]}
      />
    </Block>
  );
}

/** A cut member's wire value, as the glass shows it. Every cut's key is its own name now. */
function memberLabel(key: string): string {
  return key;
}

/**
 * Where a member's entity page lives, or null where no facet page exists for the cut. The
 * navigation model is facets, not a tree: a workload member opens the workload's page, an
 * instance member opens the node's page.
 */
function memberPage(key: string, cut: CutKey): string | null {
  if (cut === 'workload') return `/workload/${encodeURIComponent(key)}`;
  if (cut === 'instance') return `/instance/${encodeURIComponent(key)}`;
  return null;
}

function ThrashLens({ markers }: { markers: readonly MarkerJson[] }): ReactNode {
  const [rawCut, setCut] = useQueryParam('cut');
  const [rawSel, setSel] = useQueryParam('sel');
  const [rawMk, setMk] = useQueryParam('mk');
  const [rawSc] = useQueryParam('sc');
  // This panel's window, under the bare prefix: the address this panel always had.
  const pw = usePanelWindow('');
  const { win } = pw;

  const cut: CutKey = CUT_KEYS.find((k) => k === rawCut) ?? 'fleet';
  const scenario: ScenarioKey = rawSc === 'reg' ? 'reg' : 'win';
  const dim = CUT_DIMS[cut];

  // The bands read, in the wire's grammar. The panel stops travel as their own tokens since
  // pin `eb511e6`: `14d`/`48h`/`3h` resolve through the SAME window resolver as the copies
  // read, against the producer's emission frontier, so this chart and the copies chart
  // cannot disagree about which three hours exist. A stop fixes its tier; a custom range
  // rides the absolute form and lets the server choose.
  const bands = useResource(`bands:${cut}:${pw.ask}`, (ds) =>
    ds.figureBands({
      window: pw.ask,
      grain: win === 'custom' ? ('auto' as const) : stopGrain(win),
      ...(dim === null ? {} : { dims: dim }),
    }),
  );

  const head = (scope: string): string => `how soon it comes back · ${scope}`;
  const hover = <InfoHover of="thrash" label="time since eviction" />;

  if (bands.status === 'failed') {
    return (
      <Block head={head('fleet')} extras={hover}>
        {bands.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>
            The lens fills with the first analysis pass. Bands are banked at classify time, so
            history back to the install appears with it.
          </p>
        ) : (
          <Refusal
            refusal={{
              cause: bands.error.cause ?? 'engine_unavailable',
              message: bands.error.message,
              ...(bands.error.bound === undefined ? {} : { bound: bands.error.bound }),
            }}
          />
        )}
      </Block>
    );
  }

  if (bands.status === 'loading') {
    return (
      <Block head={head('fleet')} extras={hover}>
        {null}
      </Block>
    );
  }

  const data = bands.value.data;
  const view = bandsView(data, dim);
  const member = view.members.find((m) => m.key === rawSel) ?? view.members[0];
  if (!member || view.bucketsMs.length === 0) {
    return (
      <Block head={head('fleet')} extras={hover}>
        <p className={styles['awaiting']}>
          No classified stores fall in this window. Not a zero mass measured over nothing: there
          is nothing here to decompose.
        </p>
      </Block>
    );
  }

  // The served window, dressed for the chart straight off the response's own echo.
  const desc = servedWindow(data, win === 'custom' ? undefined : stopLabel(win));

  const total = member.total;
  const fleetTotal = view.members.reduce((a, m) => a + m.total, 0);
  // The instance cut lists the worst nodes and says how many it was cut from; every other cut
  // is a partition small enough to list whole.
  const shown = cut === 'instance' ? view.members.slice(0, INSTANCE_CUT_TOP) : view.members;
  const shortMass = (member.bandTotals[0] ?? 0) + (member.bandTotals[1] ?? 0);
  const scopeLabel = cut === 'fleet' ? 'fleet' : member.key;
  // Scope is the operator's lens, and the card's scopes are the fleet and the workloads: an
  // instance or model cut reads the fleet card, exactly as the mock scoped it.
  const cardScope = cut === 'workload' ? member.key : 'fleet';

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
    <Block head={`${head(scopeLabel)} · ${desc.rangeLabel} · ${desc.grainLabel}`} extras={hover}>
      <CutBar
        groups={[
          {
            label: 'cut',
            options: [
              { id: 'fleet', label: 'fleet' },
              { id: 'workload', label: 'by workload' },
              { id: 'instance', label: 'by instance' },
              { id: 'model', label: 'by model' },
            ],
            current: cut,
            onSelect: (id) => {
              setCut(id === 'fleet' ? null : id);
              setSel(null, { replace: true });
            },
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
          max={msToRangeInput(desc.startMs + desc.spanMs + 366 * 86_400_000)}
          onFrom={(v) => pw.setFrom(v, desc)}
          onTo={(v) => pw.setTo(v, desc)}
          desc={desc}
        />
      )}

      <KpiRow
        kpis={[
          { value: `≥ ${integer(total)}`, label: 'repeat compute', wide: true },
          {
            value: percent(total > 0 ? shortMass / total : 0, 1),
            label: 'under 10 min',
            tip: `≥ ${integer(shortMass)} tokens`,
          },
          {
            value: `≥ ${integer(data.gap_unobserved.value)}`,
            label: 'gap unobserved',
            tip: `${integer(data.gap_unobserved_events)} stores. First stored in the window, or gone longer than an hour: indistinguishable by construction. Beside the bands, never in the stack.`,
          },
          { value: percent(member.coverage, 1), label: 'coverage' },
        ]}
      />

      <SubBlock>
        <BandStack
          rows={member.rows}
          bands={BANDS}
          labelOf={(i) => bucketLabel(desc, i)}
          tickEvery={desc.tickEvery}
          unit={`tokens/${desc.unitName}`}
          unitShort="tokens"
          bucketNoun={desc.unitName === 'h' ? 'hour' : desc.unitName === 'min' ? 'minute' : desc.unitName}
          height={250}
          markers={chartMarkers}
          selectedMarker={rawMk}
          spans={selectedMarker ? spanFracs(selectedMarker, desc) : null}
          // The day drill's door: a day-grain bucket is a day, and clicking it opens the
          // day. Sub-day buckets stay unlinked here, since fleet-grain evidence has no
          // subject to scope to.
          bucketLink={
            desc.bucketMs === 86_400_000
              ? (i) =>
                  `/day/${new Date(desc.startMs + i * desc.bucketMs).toISOString().slice(0, 10)}`
              : null
          }
          title="Repeat compute per bucket, stacked by time-since-eviction band. Darkest is the shortest gap. At day grain, a bucket opens its day."
        />
        <BandLegend
          bands={BANDS}
          titles={member.bandTotals.map(
            (v) => `≥ ${integer(v)} tokens · ${percent(total > 0 ? v / total : 0, 1)}`,
          )}
        />
      </SubBlock>

      <Attribution
        markers={markers}
        selectedId={rawMk}
        onSelect={(id) => setMk(id)}
        scope={cardScope}
        scopeLabel={cut === 'workload' ? member.key : 'fleet'}
        primary="rc"
        scenario={scenario}
      />

      <SubBlock head={`breakdown · ${cut === 'fleet' ? 'fleet' : `by ${cut}`}`}>
        <CompositionBar
          label={`composition · ${scopeLabel} · ${desc.rangeLabel}`}
          shares={member.bandTotals.map((v) => (total > 0 ? v / total : 0))}
          bands={BANDS}
          titles={member.bandTotals.map((v) => `≥ ${integer(v)} tokens`)}
        />

        {cut !== 'fleet' && (
          <>
            <div className="table-scroll">
              <table className={`${table['table']} ${styles['working']}`}>
                <thead>
                  <tr>
                    <th>{cut}</th>
                    <th>shape</th>
                    <th className={table['num']}>repeat compute</th>
                    <th className={table['num']}>share</th>
                    <th className={table['num']}>under 10 min</th>
                    <th className={table['num']}>coverage</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((m) => (
                    <tr
                      key={m.key}
                      className={table['row']}
                      aria-pressed={m.key === member.key}
                      tabIndex={0}
                      onClick={() => setSel(m.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSel(m.key);
                      }}
                    >
                      <td className={m.key === 'undeclared' ? table['undeclared'] : undefined}>
                        {memberLabel(m.key)}
                      </td>
                      <td>
                        <RowStrip
                          shares={m.bandTotals.map((v) => (m.total > 0 ? v / m.total : 0))}
                          bands={BANDS}
                        />
                      </td>
                      <td className={table['num']}>{`≥ ${integer(m.total)}`}</td>
                      <td className={table['num']}>
                        {percent(fleetTotal > 0 ? m.total / fleetTotal : 0, 1)}
                      </td>
                      <td className={table['num']}>
                        {percent(
                          m.total > 0
                            ? ((m.bandTotals[0] ?? 0) + (m.bandTotals[1] ?? 0)) / m.total
                            : 0,
                          1,
                        )}
                      </td>
                      <td className={table['num']}>{percent(m.coverage, 1)}</td>
                      <td className={table['chev']}>
                        {(() => {
                          const page = memberPage(m.key, cut);
                          // A row click retargets the chart; the chevron opens the member's
                          // own page. Two verbs, two targets, and containment holds: the
                          // panel's control stays a control of this panel.
                          return page === null ? (
                            '›'
                          ) : (
                            <Link
                              className={table['link']}
                              to={page}
                              title={`open ${memberLabel(m.key)}'s page`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              ›
                            </Link>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cut === 'instance' && (
              <p className={styles['stamp']}>
                top {integer(shown.length)} of <b>{integer(view.members.length)}</b> nodes with
                repeat compute in the window · worst first · the fleet index is{' '}
                <Link to="/fleet">Fleet ›</Link> · each node&#8217;s page holds its ranks
              </p>
            )}
          </>
        )}
      </SubBlock>
    </Block>
  );
}
