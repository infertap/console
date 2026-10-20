// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type ReactNode } from 'react';
import { percent } from '../../design-system/format/numbers';
import { ChartTip, Crosshair, viewBoxX } from './ChartHover';
import styles from './Entity.module.css';

/**
 * One rate over time, against the fleet's median rate as a faint band behind it.
 *
 * This single panel answers the two questions a peer paragraph used to spend itself on: is
 * this node different, and is it getting worse. The line is the node; the band is the middle
 * of the fleet; the reader judges. No trend words.
 *
 * Hover draws a crosshair snapped to the nearest bucket and annotates both series at that
 * instant, so the comparison the chart implies is readable point by point.
 */

const W = 1000;
const H = 170;
const PAD = { t: 12, b: 22, l: 52, r: 8 } as const;

export function RateChart({
  values,
  median,
  refLabel = 'fleet median',
  labelOf,
  tipLabelOf,
  tickEvery,
  title,
}: {
  /** The subject's rate per bucket, 0..1. */
  values: readonly number[];
  /** The reference series drawn as the faint band, or null where unserved. */
  median: readonly number[] | null;
  /** What the reference series IS, e.g. "fleet median" or "fleet". */
  refLabel?: string;
  labelOf: (i: number) => string;
  /** The annotation's instant, fuller than the axis tick. Falls back to the tick label. */
  tipLabelOf?: (i: number) => string;
  tickEvery: number;
  title: string;
}): ReactNode {
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  if (n === 0) {
    return (
      <p className={styles['awaiting']}>
        No classified stores for this node over the window. Looked, and found nothing.
      </p>
    );
  }
  const yMax = Math.max(...values, ...(median ?? []), 1e-6) * 1.15;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (i: number): number => PAD.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number): number => PAD.t + plotH - (v / yMax) * plotH;
  const line = (vs: readonly number[]): string => vs.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const fmt = (v: number): string => percent(v, v < 0.02 ? 2 : 1);

  const hoverMedian = hover !== null && median !== null ? median[hover] : undefined;

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
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <title>{title}</title>
        <text x={PAD.l - 6} y={PAD.t + 4} textAnchor="end" fontSize="11" fill="var(--graphite)">
          {percent(yMax, yMax < 0.02 ? 2 : 1)}
        </text>
        <text x={PAD.l - 6} y={PAD.t + plotH + 4} textAnchor="end" fontSize="11" fill="var(--graphite)">
          0%
        </text>
        <line x1={PAD.l} y1={PAD.t + plotH} x2={W - PAD.r} y2={PAD.t + plotH} stroke="var(--rule)" />
        {Array.from({ length: n }, (_, i) => i)
          .filter((i) => i % tickEvery === 0)
          .map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--graphite)">
              {labelOf(i)}
            </text>
          ))}
        {median !== null && median.length === n && (
          <polyline
            points={line(median)}
            fill="none"
            stroke="var(--seq-2)"
            strokeWidth="7"
            strokeLinejoin="round"
            opacity="0.55"
          />
        )}
        <polyline points={line(values)} fill="none" stroke="var(--seq-7)" strokeWidth="2" />
        {hover !== null && (
          <Crosshair
            x={x(hover)}
            top={PAD.t}
            bottom={PAD.t + plotH}
            dots={[
              ...(hoverMedian !== undefined ? [{ y: y(hoverMedian), tone: 'var(--seq-2)' }] : []),
              { y: y(values[hover] ?? 0), tone: 'var(--seq-7)' },
            ]}
          />
        )}
      </svg>
      {hover !== null && (
        <ChartTip
          fracX={x(hover) / W}
          head={(tipLabelOf ?? labelOf)(hover)}
          lines={[
            { swatch: 'var(--seq-7)', label: 'this node', value: fmt(values[hover] ?? 0) },
            ...(hoverMedian !== undefined
              ? [
                  {
                    swatch: 'var(--seq-2)',
                    label: refLabel,
                    value: fmt(hoverMedian),
                    muted: true,
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
