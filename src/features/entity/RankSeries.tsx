// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type ReactNode } from 'react';
import { compact } from '../../design-system/format/numbers';
import { Link } from '../../design-system/navigation/router';
import { ChartTip, Crosshair, viewBoxX } from './ChartHover';
import styles from './Entity.module.css';

/**
 * Few members, drawn as series: one line per member across the window.
 *
 * The member-count rule (entity-page amendment, 2026-09-01): at eight members draw eight
 * series; at three hundred draw a distribution. The ranked columns answer WHO; the series
 * answers who, when, and whether it is a step change or has always been like that, which is
 * the diagnostic question. "Rank 3 diverged at 14:20" is a thing you can see and cannot say.
 *
 * Show, don't say: no trend words, no divergence claims. The lines are the claim.
 */

/** One line of the rank series: its key, its label, its values per bucket and its total. */
export interface SeriesMember {
  readonly key: string;
  readonly label: string;
  /** One value per bucket, oldest first, on the shared axis. */
  readonly values: readonly number[];
  readonly total: number;
}

/** The recompute register's own ramp, interleaved for line-vs-line legibility up to
 * dp_size 8. Never the capacity ramp: a hue is a register claim. */
const TONES = [
  'var(--seq-7)',
  'var(--seq-4)',
  'var(--seq-2)',
  'var(--seq-6)',
  'var(--seq-3)',
  'var(--seq-1)',
  'var(--seq-5)',
  'var(--pencil)',
] as const;

const W = 1000;
const H = 200;
const PAD = { t: 10, b: 22, l: 46, r: 8 } as const;

/** One line per rank over the window, each a link to its drill. */
export function RankSeries({
  members,
  labelOf,
  tipLabelOf,
  tickEvery,
  unit,
  linkTo,
  title,
  fmt = compact,
}: {
  /** Any order in; drawn and listed worst first so tone assignment is stable. */
  members: readonly SeriesMember[];
  labelOf: (i: number) => string;
  /** The annotation's instant, fuller than the axis tick. Falls back to the tick label. */
  tipLabelOf?: (i: number) => string;
  tickEvery: number;
  /** The axis unit, e.g. "tokens/day" or "share of the node's recompute". */
  unit: string;
  linkTo: (key: string) => string | null;
  title: string;
  /** How a value renders on the axis and in the legend. */
  fmt?: (v: number) => string;
}): ReactNode {
  const [hover, setHover] = useState<string | null>(null);
  const [bucket, setBucket] = useState<number | null>(null);
  const sorted = [...members].sort((a, b) => b.total - a.total);
  const n = sorted[0]?.values.length ?? 0;
  if (sorted.length === 0 || n === 0) {
    return (
      <p className={styles['awaiting']}>
        No classified mass in this slice over the window. Looked, and found nothing.
      </p>
    );
  }
  const yMax = Math.max(1, ...sorted.flatMap((m) => [...m.values]));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (i: number): number => PAD.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number): number => PAD.t + plotH - (v / yMax) * plotH;

  return (
    <div className={styles['chartWrap']}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onPointerMove={(e) => {
          const vx = viewBoxX(e, W);
          if (vx === null) return;
          const i = Math.round(((vx - PAD.l) / plotW) * (n - 1));
          setBucket(Math.max(0, Math.min(n - 1, i)));
        }}
        onPointerLeave={() => setBucket(null)}
      >
        <title>{title}</title>
        {/* The y axis: zero and the max, both real values, nothing invented between. */}
        <text x={PAD.l - 6} y={PAD.t + 4} textAnchor="end" fontSize="11" fill="var(--graphite)">
          {fmt(yMax)}
        </text>
        <text x={PAD.l - 6} y={PAD.t + plotH + 4} textAnchor="end" fontSize="11" fill="var(--graphite)">
          0
        </text>
        <line x1={PAD.l} y1={PAD.t + plotH} x2={W - PAD.r} y2={PAD.t + plotH} stroke="var(--rule)" />
        {Array.from({ length: n }, (_, i) => i)
          .filter((i) => i % tickEvery === 0)
          .map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--graphite)">
              {labelOf(i)}
            </text>
          ))}
        {sorted.map((m, mi) => (
          <polyline
            key={m.key}
            points={m.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={TONES[mi % TONES.length]}
            strokeWidth={hover === m.key ? 3 : 1.8}
            opacity={hover === null || hover === m.key ? 1 : 0.25}
            onMouseEnter={() => setHover(m.key)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{`${m.label} · last ${fmt(m.values[m.values.length - 1] ?? 0)} · max ${fmt(Math.max(...m.values, 0))}`}</title>
          </polyline>
        ))}
        {bucket !== null && (
          <Crosshair
            x={x(bucket)}
            top={PAD.t}
            bottom={PAD.t + plotH}
            dots={sorted.map((m, mi) => ({
              y: y(m.values[bucket] ?? 0),
              tone: TONES[mi % TONES.length] ?? 'var(--pencil)',
            }))}
          />
        )}
      </svg>
      {bucket !== null && (
        <ChartTip
          fracX={x(bucket) / W}
          head={(tipLabelOf ?? labelOf)(bucket)}
          lines={sorted
            .map((m, mi) => ({
              swatch: TONES[mi % TONES.length] ?? 'var(--pencil)',
              label: m.label,
              value: fmt(m.values[bucket] ?? 0),
              at: m.values[bucket] ?? 0,
            }))
            .sort((a, b) => b.at - a.at)
            .map(({ swatch, label, value }) => ({ swatch, label, value }))}
        />
      )}
      <p className={styles['stamp']}>{unit}</p>
      <p className={`${styles['stamp']} ${styles['distList']}`}>
        {sorted.map((m, mi) => {
          const href = linkTo(m.key);
          return (
            <span
              key={m.key}
              onMouseEnter={() => setHover(m.key)}
              onMouseLeave={() => setHover(null)}
            >
              {mi > 0 && ' · '}
              <i
                className={styles['swatch']}
                style={{ background: TONES[mi % TONES.length] }}
                aria-hidden="true"
              />{' '}
              {href === null ? (
                m.label
              ) : (
                <Link to={href}>{m.label}</Link>
              )}{' '}
              last <b>{fmt(m.values[m.values.length - 1] ?? 0)}</b> · max{' '}
              <b>{fmt(Math.max(...m.values, 0))}</b>
            </span>
          );
        })}
      </p>
    </div>
  );
}
