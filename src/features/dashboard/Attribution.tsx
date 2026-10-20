// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useDataSource, useResource } from '../../data/react';
import type { MarkerJson } from '../../domain/contract';
import { duplicationSpans, recomputeSpans, type ScenarioKey } from '../../domain/lens';
import { RECOMPUTE_CLASSES } from '../../domain/trend';
import { MIN_MS } from '../../domain/windows';
import { SubBlock } from '../../design-system/layout/Block';
import { clock, day, decimal, integer, signedPercent } from '../../design-system/format/numbers';
import { InfoHover } from '../../design-system/info/InfoHover';
import { KpiRow, type Kpi } from '../../design-system/figure/KpiRow';
import { StateChip } from '../../design-system/state/StateChip';
import styles from './Attribution.module.css';

/**
 * The attribution interaction a metric panel carries: the marker index, and the selected
 * marker's before/after card.
 *
 * **Not a standalone section**: a second recompute series violated "the trend
 * renders exactly once", so markers render on every metric chart and attribution rides the
 * panels as an interaction. Both registers appear on the card as numbers, beside and never on
 * one axis, the panel's own register leading; a breaking marker refuses its comparison instead
 * of computing one, because rows either side of it are not one quantity.
 *
 * The card reads through the seam's pre-contract lens: the v0 story is windowed sums over
 * `classified_stores`, and the card computes at the ledger's own grain, which is why it answers
 * the same on every window the chart happens to show.
 */

/** Footnote daggers, assigned by index in the markers read, matching the chart. */
export const DAGGERS = ['†', '‡', '§', '‖', '¶'] as const;

export function daggerOf(markers: readonly MarkerJson[], id: string): string {
  const i = markers.findIndex((m) => m.id === id);
  return DAGGERS[i % DAGGERS.length] ?? '†';
}

/** A marker instant on glass: the day for a day-grain marker, day and clock for a finer one. */
export function markerAtLabel(marker: MarkerJson): string {
  return marker.at_ms % 86_400_000 === 0
    ? day(marker.at_ms)
    : `${day(marker.at_ms).slice(5)} ${clock(marker.at_ms)}`;
}

export function Attribution({
  markers,
  selectedId,
  onSelect,
  scope,
  scopeLabel,
  primary,
  scenario,
}: {
  /** The full marker index, in read order, so daggers agree with the chart. */
  markers: readonly MarkerJson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The operator's scope lens: the panel's current cut member. */
  scope: string;
  scopeLabel: string;
  /** Which register leads the card: the panel's own. */
  primary: 'rc' | 'du';
  scenario: ScenarioKey;
}): ReactNode {
  const lens = useDataSource().lens;
  const selected =
    markers.find((m) => m.id === selectedId) ??
    [...markers].sort((a, b) => b.at_ms - a.at_ms).find((m) => !m.breaks) ??
    null;

  const card = useResource(
    `attribution:${scope}:${selected?.id ?? 'none'}:${scenario}`,
    (ds) =>
      ds.lens && selected
        ? ds.lens.attribution({ scope, atMs: selected.at_ms, scenario })
        : Promise.resolve(null),
  );

  // The live path: with no lens, the card computes from two contract reads. The recompute
  // register comes from minute-grain figures (explicit minute, so a coarser answer refuses by
  // name rather than arriving silently downgraded), workload-cut when the scope is one; the
  // duplication register rides the replication read at the same custom window. Same spans,
  // same arithmetic, no bespoke endpoint.
  const liveV0 = !lens && selected !== null && !selected.breaks;
  const spanWindow = selected
    ? `${selected.at_ms - 60 * MIN_MS},${selected.at_ms + 60 * MIN_MS}`
    : '';
  const figures = useResource(
    `attribution:v0:rc:${scope}:${selected?.id ?? 'none'}`,
    (ds) =>
      liveV0 && selected
        ? ds.figures({
            window: spanWindow,
            grain: 'minute',
            dims: scope === 'fleet' ? ['class'] : ['class', 'workload'],
          })
        : Promise.resolve(null),
  );
  const duplication = useResource(
    `attribution:v0:du:${scope}:${selected?.id ?? 'none'}`,
    (ds) =>
      liveV0 && selected
        ? ds.replication({
            window: spanWindow,
            ...(scope === 'fleet' ? {} : { workload: scope }),
          })
        : Promise.resolve(null),
  );

  return (
    <SubBlock
      head={`around each deploy · ${scopeLabel}`}
      extras={<InfoHover of="ledger" label="marker attribution" />}
    >
      <div className={styles['index']}>
        {[...markers]
          .sort((a, b) => b.at_ms - a.at_ms)
          .map((marker) => (
            <button
              key={marker.id}
              type="button"
              className={styles['marker']}
              aria-pressed={marker.id === selected?.id}
              onClick={() => onSelect(marker.id)}
            >
              <b>{daggerOf(markers, marker.id)}</b> {markerAtLabel(marker)} · {marker.label}
            </button>
          ))}
      </div>

      {selected === null ? (
        <p className={styles['note']}>No marker in this window and none declared.</p>
      ) : selected.breaks ? (
        // A breaking marker splits the series and refuses its comparison. This is a designed
        // result, not an error: the two eras are different quantities.
        <div className={styles['chips']}>
          <StateChip
            state="indeterminate"
            provenance="not one quantity"
            value={`series breaks at ${daggerOf(markers, selected.id)}`}
          />
          <StateChip state="unexamined" provenance="separate eras" value="before/after refused" />
        </div>
      ) : lens ? (
        card.status === 'ready' && card.value?.data ? (
          <AttributionKpis card={card.value.data} primary={primary} />
        ) : card.status === 'failed' ? (
          <p className={styles['note']}>
            {card.error.isNotYetMeasured
              ? 'The before/after card fills once an analysis pass has covered the marker.'
              : card.error.message}
          </p>
        ) : (
          <p className={styles['note']}> </p>
        )
      ) : figures.status === 'ready' && figures.value ? (
        <LiveV0Kpis
          spans={recomputeSpans(
            figures.value.data,
            RECOMPUTE_CLASSES,
            selected.at_ms,
            scope === 'fleet' ? undefined : scope,
          )}
          duplication={
            duplication.status === 'ready' && duplication.value
              ? duplicationSpans(duplication.value.data, selected.at_ms)
              : null
          }
          primary={primary}
        />
      ) : figures.status === 'failed' ? (
        <p className={styles['note']}>
          {figures.error.isNotYetMeasured
            ? 'The before/after card fills once an analysis pass has covered the marker.'
            : figures.error.message}
        </p>
      ) : (
        <p className={styles['note']}> </p>
      )}
    </SubBlock>
  );
}

/**
 * The live card: the recompute register from the minute figures, the duplication register from
 * the replication read at the same window, and the panel's own register leading. Where the
 * duplication read has not answered, its tile states the absence rather than standing another
 * register in.
 */
function LiveV0Kpis({
  spans,
  duplication,
  primary,
}: {
  spans: ReturnType<typeof recomputeSpans>;
  duplication: ReturnType<typeof duplicationSpans>;
  primary: 'rc' | 'du';
}): ReactNode {
  if (spans === null) {
    return (
      <p className={styles['note']}>
        No classified bucket falls before the marker, so there is no before span to compare.
      </p>
    );
  }
  if (duplication !== null) {
    // Both registers answered: the full card, computed from the reads.
    return (
      <AttributionKpis
        card={{
          rcBefore: spans.rcBefore,
          rcAfter: spans.rcAfter,
          duBefore: duplication.duBefore,
          duAfter: duplication.duAfter,
          afterMinutes: Math.min(spans.afterMinutes, duplication.afterMinutes),
        }}
        primary={primary}
      />
    );
  }
  const rcDelta = spans.rcBefore > 0 ? (spans.rcAfter - spans.rcBefore) / spans.rcBefore : 0;
  return (
    <>
      <KpiRow
        kpis={[
          {
            value: signedPercent(rcDelta),
            label: 'recompute · after vs before',
            wide: true,
            tip: `${integer(spans.rcBefore)} → ${integer(spans.rcAfter)} tok/min`,
          },
          { value: '60 min', label: 'before span' },
          {
            value: `${integer(spans.afterMinutes)} min`,
            label: spans.afterMinutes < 60 ? 'after span · still filling' : 'after span',
          },
        ]}
      />
      <div className={styles['chips']}>
        <StateChip
          state="unexamined"
          provenance="no duplicated time in the spans"
          value="duplication"
          size="small"
        />
      </div>
    </>
  );
}

function AttributionKpis({
  card,
  primary,
}: {
  card: {
    rcBefore: number;
    rcAfter: number;
    duBefore: number;
    duAfter: number;
    afterMinutes: number;
  };
  primary: 'rc' | 'du';
}): ReactNode {
  const rcDelta = card.rcBefore > 0 ? (card.rcAfter - card.rcBefore) / card.rcBefore : 0;
  const duDelta = card.duBefore > 0 ? (card.duAfter - card.duBefore) / card.duBefore : 0;
  // A percent without its base is half a claim: the rates ride the hover.
  const rcTip = `${integer(card.rcBefore)} → ${integer(card.rcAfter)} tok/min`;
  const duTip = `${decimal(card.duBefore)} → ${decimal(card.duAfter)} tok-h/min`;
  const rc: Kpi = {
    value: signedPercent(rcDelta),
    label: primary === 'rc' ? 'recompute · after vs before' : 'recompute',
    wide: primary === 'rc',
    tip: rcTip,
  };
  const du: Kpi = {
    value: signedPercent(duDelta),
    label: primary === 'du' ? 'duplication · after vs before' : 'duplication',
    wide: primary === 'du',
    tip: duTip,
  };
  return (
    <KpiRow
      kpis={[
        ...(primary === 'du' ? [du, rc] : [rc, du]),
        { value: '60 min', label: 'before span' },
        {
          value: `${integer(card.afterMinutes)} min`,
          label: card.afterMinutes < 60 ? 'after span · still filling' : 'after span',
        },
      ]}
    />
  );
}
