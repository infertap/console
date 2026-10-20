// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { type Resource } from '../../data/react';
import type { BandsData, Stamped } from '../../domain/contract';
import { bandsView } from '../../domain/bands';
import { GAP_BANDS } from '../../domain/lens';
import { bucketLabel, servedWindow, stopLabel, type WindowKey } from '../../domain/windows';
import { BandStack, type Band } from '../../design-system/chart/BandStack';
import { BandLegend } from '../../design-system/chart/Bands';
import { CutBar } from '../../design-system/controls/CutBar';
import { integer, percent } from '../../design-system/format/numbers';
import { InfoHover } from '../../design-system/info/InfoHover';
import { Block } from '../../design-system/layout/Block';
import { useQueryParam } from '../../design-system/navigation/router';
import { Refusal } from '../../design-system/refusal/Refusal';
import styles from './Entity.module.css';

/**
 * The gap-over-time panel, shared by the entity pages: percent-stacked bands with the median
 * guide, a class cut whose stack normalises to the class itself while the strip beneath
 * carries the class's share of each bucket, and a basis toggle (tokens weigh the bill,
 * events the typical block), all from one class-dimensioned bands read.
 */

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

/** The panel: the gap over time. Percent-stacked, because the diagnosis is the mix shifting
 * toward short gaps and absolute stacking hides that behind volume changes. The halfway
 * guide makes the weighted median readable per bucket; the class cut splits what the
 * distribution panel below separates; the basis toggle answers the bill (tokens) or the
 * typical block (events), from the same served rows. */
export function GapOverTime({
  scopedByClass,
  win,
  bucketLink,
}: {
  scopedByClass: Resource<Stamped<BandsData>>;
  win: WindowKey;
  /** Where a bucket's column leads, from its served bounds: the records at that instant. */
  bucketLink?: (startMs: number, endMs: number) => string | null;
}): ReactNode {
  const [rawCls, setCls] = useQueryParam('gcls');
  const [rawBasis, setBasis] = useQueryParam('gbasis');
  const cls = rawCls === 'ETR' || rawCls === 'post_clear' ? rawCls : 'all';
  const basis: 'tokens' | 'events' = rawBasis === 'events' ? 'events' : 'tokens';
  // One class-dimensioned read serves every toggle state: summing the class rows reproduces
  // the uncut read to the token, because the split partitions each value exactly.
  const resource = scopedByClass;

  const winLabel = stopLabel(win);
  const head = `the gap over time · ${cls === 'all' ? 'both classes' : cls} · ${winLabel}`;
  const hover = <InfoHover of="thrash" label="time since eviction" />;
  const control = (
    <CutBar
      groups={[
        {
          label: 'class',
          options: [
            { id: 'all', label: 'both' },
            { id: 'ETR', label: 'ETR' },
            { id: 'post_clear', label: 'post_clear' },
          ],
          current: cls,
          onSelect: (id) => setCls(id === 'all' ? null : id),
        },
        {
          label: 'basis',
          options: [
            { id: 'tokens', label: 'tokens · the bill' },
            { id: 'events', label: 'events · the typical block' },
          ],
          current: basis,
          onSelect: (id) => setBasis(id === 'tokens' ? null : id),
        },
      ]}
    />
  );

  if (resource.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        {control}
        {resource.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>The panel fills with the first analysis pass.</p>
        ) : (
          <Refusal
            refusal={{
              cause: resource.error.cause ?? 'engine_unavailable',
              message: resource.error.message,
            }}
          />
        )}
      </Block>
    );
  }
  if (resource.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        {null}
      </Block>
    );
  }
  const data = resource.value.data;
  const classView = bandsView(data, 'class', basis);
  const view = bandsView(data, cls === 'all' ? null : 'class', basis);
  const member =
    cls === 'all' ? view.members[0] : view.members.find((m) => m.key === cls);
  if (!member || member.total === 0) {
    return (
      <Block head={head} extras={hover}>
        {control}
        <p className={styles['awaiting']}>
          No classified stores for this slice over the window. Looked, and found nothing.
        </p>
      </Block>
    );
  }
  const desc = servedWindow(data, winLabel);
  // Two normalisations, two questions, both on the glass. The STACK normalises each bucket
  // to the selected slice's own total, so it always answers "what is the mix" at full
  // height and the median guide is a median of the thing shown. The STRIP beneath a class
  // cut answers "how much of the bucket was this class": that is where an episodic class
  // shows its slivers and towers, so neither normalisation has to lie for the other.
  const bucketTotals =
    classView.members[0]?.rows.map((_, i) =>
      classView.members.reduce((a, m) => a + (m.rows[i]?.reduce((x, y) => x + y, 0) ?? 0), 0),
    ) ?? [];
  const shares = member.rows.map((bands) => {
    const t = bands.reduce((a, b) => a + b, 0);
    return t > 0 ? bands.map((v) => v / t) : bands.map(() => 0);
  });
  const classShares =
    cls === 'all'
      ? null
      : member.rows.map((bands, i) => {
          const t = bucketTotals[i] ?? 0;
          return t > 0 ? bands.reduce((a, b) => a + b, 0) / t : 0;
        });
  const noun = basis === 'tokens' ? 'recompute' : 'recomputed stores';
  return (
    <Block head={head} extras={hover}>
      {control}
      <BandStack
        rows={shares}
        bands={BANDS}
        labelOf={(i) => bucketLabel(desc, i)}
        tickEvery={desc.tickEvery}
        unit={
          cls === 'all'
            ? `share of the bucket's ${noun}`
            : `the mix within ${cls}, per bucket`
        }
        unitShort="share"
        bucketNoun={desc.unitName === 'h' ? 'hour' : desc.unitName}
        height={160}
        fmt={(v) => percent(v, 0)}
        guide={{ value: 0.5, label: 'median' }}
        capValue={1}
        bucketLink={
          bucketLink === undefined
            ? null
            : (i) =>
                bucketLink(desc.startMs + i * desc.bucketMs, desc.startMs + (i + 1) * desc.bucketMs)
        }
        title={
          cls === 'all'
            ? `Each bucket's ${noun} split by time-since-eviction band, as shares. A mix shifting toward the dark short bands is churn; whichever band straddles the halfway guide holds that bucket's ${basis === 'tokens' ? 'token-weighted' : 'event'} median gap.`
            : `The mix of ${cls}'s ${noun} by time-since-eviction band, each bucket normalised to the class itself; the strip beneath shows how much of the bucket's ${noun} the class was. A bucket where the class had nothing stays empty.`
        }
      />
      {classShares !== null && (
        <ShareStrip
          values={classShares}
          label={`${cls}'s share of the bucket's ${noun}`}
          labelOf={(i) => bucketLabel(desc, i)}
        />
      )}
      <BandLegend
        bands={BANDS}
        titles={member.bandTotals.map(
          (v) =>
            `≥ ${integer(v)} ${basis === 'tokens' ? 'tokens' : 'stores'} · ${percent(member.total > 0 ? v / member.total : 0, 1)} of the window`,
        )}
      />
      <p className={styles['stamp']}>
        the distribution panel below is this measure with time merged out: per class, per
        store, with resolution inside these bands
      </p>
    </Block>
  );
}

/**
 * The volume strip under a class-cut mix: one thin bar per bucket, the class's share of the
 * bucket's whole recompute. The mix above answers "of what gaps"; this answers "how much",
 * which is the half an episodic class lives in. Geometry mirrors the stack's so the columns
 * align bucket for bucket.
 */
function ShareStrip({
  values,
  label,
  labelOf,
}: {
  values: readonly number[];
  label: string;
  labelOf: (i: number) => string;
}): ReactNode {
  const W = 1000;
  const H = 34;
  const PAD = { l: 46, r: 8, t: 4, b: 4 } as const;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const iw = plotW / Math.max(1, values.length);
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}, per bucket`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--rule)" />
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={PAD.t}
          y2={PAD.t}
          stroke="var(--rule-2, var(--rule))"
          strokeDasharray="2 4"
        />
        <text x={PAD.l - 6} y={PAD.t + 4} textAnchor="end" fontSize="9" fill="var(--graphite)">
          100%
        </text>
        {values.map((v, i) => (
          <rect
            key={i}
            x={PAD.l + i * iw + 1}
            y={PAD.t + plotH * (1 - Math.min(1, v))}
            width={Math.max(1, iw - 2.5)}
            height={Math.max(v > 0 ? 1 : 0, plotH * Math.min(1, v))}
            fill="var(--seq-5)"
          >
            <title>{`${labelOf(i)} · ${percent(v, v < 0.02 ? 1 : 0)}`}</title>
          </rect>
        ))}
      </svg>
      <p className={styles['stamp']}>{label}</p>
    </>
  );
}
