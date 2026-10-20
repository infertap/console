// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { Resource } from '../../../data/react';
import type { InstanceDuplicationData, Stamped } from '../../../domain/contract';
import { DAY_MS, HOUR_MS, bucketLabel, servedWindow } from '../../../domain/windows';
import { BandStack } from '../../../design-system/chart/BandStack';
import { BandLegend } from '../../../design-system/chart/Bands';
import { CutBar } from '../../../design-system/controls/CutBar';
import { KpiRow, type Kpi } from '../../../design-system/figure/KpiRow';
import { compact, multiplier, percent } from '../../../design-system/format/numbers';
import { InfoHover } from '../../../design-system/info/InfoHover';
import { Block } from '../../../design-system/layout/Block';
import { useQueryParam } from '../../../design-system/navigation/router';
import { Refusal } from '../../../design-system/refusal/Refusal';
import { rate } from '../rates';
import styles from '../Entity.module.css';
import {
  COPY_BAND_ROWS,
  LOCALITIES,
  copiesBandIndex,
  heldTwiceShare,
  localityWords,
  type Locality,
} from './duplication';

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
export function DuplicationBlock({
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
