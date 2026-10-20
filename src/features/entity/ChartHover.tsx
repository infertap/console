// SPDX-License-Identifier: AGPL-3.0-only
import type { PointerEvent, ReactNode } from 'react';
import styles from './Entity.module.css';

/**
 * The line charts' hover grammar: a crosshair snapped to the nearest bucket, a dot on every
 * series at that instant, and an annotation listing each series' value there — the reading an
 * operator would otherwise assemble by eye. The annotation floats beside the crosshair and
 * flips sides past the middle, so it never leaves the chart and never shifts the layout;
 * the stacked charts keep their own reserved readout line, which is the same rule in the
 * other register.
 *
 * Nothing here invents a figure: every value in the annotation is a served point (or, on the
 * CDF, a linear interpolation between two served quantiles, said as such by the caller).
 */

/** One line of a chart hover: an optional swatch, a label and the served value. */
export interface TipLine {
  /** The series' own tone, as the legend draws it. Absent renders no swatch. */
  readonly swatch?: string;
  readonly label: string;
  readonly value: string;
  /** A reference series (a median, a band) rather than the subject. */
  readonly muted?: boolean;
}

/**
 * Map a pointer event to viewBox x. Returns null where the chart has no measurable width,
 * which is jsdom and nothing else.
 */
export function viewBoxX(event: PointerEvent<SVGSVGElement>, viewBoxW: number): number | null {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0) return null;
  return ((event.clientX - rect.left) / rect.width) * viewBoxW;
}

/** The crosshair's SVG half: the tracker line and one dot per series. */
export function Crosshair({
  x,
  top,
  bottom,
  dots,
}: {
  x: number;
  top: number;
  bottom: number;
  dots: readonly { readonly y: number; readonly tone: string }[];
}): ReactNode {
  return (
    <g aria-hidden="true">
      <line x1={x} y1={top} x2={x} y2={bottom} stroke="var(--graphite)" strokeDasharray="2 3" opacity="0.7" />
      {dots.map((dot, i) => (
        <circle key={i} cx={x} cy={dot.y} r={3.5} fill={dot.tone} stroke="var(--canvas)" strokeWidth={1.5} />
      ))}
    </g>
  );
}

/** The annotation's HTML half, floated over the chart inside a `chartWrap` container. */
export function ChartTip({
  fracX,
  head,
  lines,
}: {
  /** The crosshair's horizontal position as a fraction of the chart's width. */
  fracX: number;
  /** The instant (or duration) the annotation describes, as a raw UTC label. */
  head: string;
  lines: readonly TipLine[];
}): ReactNode {
  const flip = fracX > 0.55;
  return (
    <div
      className={styles['tip']}
      data-flip={flip}
      style={flip ? { right: `${(1 - fracX) * 100}%` } : { left: `${fracX * 100}%` }}
    >
      <div className={styles['tipHead']}>{head}</div>
      {lines.map((line) => (
        <div key={line.label} className={styles['tipRow']} data-muted={line.muted === true}>
          {line.swatch !== undefined && (
            <i className={styles['tipSwatch']} style={{ background: line.swatch }} aria-hidden="true" />
          )}
          <span className={styles['tipLabel']}>{line.label}</span>
          <span className={styles['tipValue']}>{line.value}</span>
        </div>
      ))}
    </div>
  );
}
