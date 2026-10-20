// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type ReactNode } from 'react';
import type { SpanFracs } from '../../domain/windows';
import { compact, percent } from '../format/numbers';
import { navigate } from '../navigation/router';
import styles from './BandStack.module.css';

/**
 * The banded time series: mass per bucket, stacked by a fixed band vocabulary.
 *
 * This is the v3 chart grammar for both metric surfaces: the thrash lens stacks repeat-compute
 * mass by time-since-eviction band, and the copies chart stacks duplicated token-hours by
 * simultaneous copy count. Fixed bands, mass integrated per band per bucket: sums, so any cut
 * and any window merge exactly, and the figure compares fleet to fleet.
 *
 * **Markers ride every metric chart.** A marker is drawn at its instant; the selected one is
 * emphasised and, where it does not break the series, its equal before/after spans shade behind
 * the bars. A breaking marker widens into a seam band instead: rows either side are not one
 * quantity, and the shading that implies comparability never draws across it.
 *
 * **Hover teaches.** The hovered segment states its bucket, band, mass and share in a reserved
 * readout line under the chart, so the layout never jumps and the bars never carry text.
 */

export interface Band {
  readonly key: string;
  readonly label: string;
  /** A CSS color, from the register's own ramp. Never the other register's hue. */
  readonly tone: string;
}

export interface ChartMarker {
  readonly id: string;
  readonly dagger: string;
  /** The instant, as a raw UTC label. Rendered beside the dagger when selected. */
  readonly atLabel: string;
  readonly frac: number;
  readonly breaks: boolean;
}

const W = 1000;
const PAD = { t: 18, b: 22, l: 46, r: 8 } as const;

export function BandStack({
  rows,
  bands,
  labelOf,
  tickEvery,
  unit,
  unitShort,
  bucketNoun,
  height = 230,
  fmt = compact,
  markers = [],
  selectedMarker = null,
  spans = null,
  guide = null,
  capValue = null,
  bucketLink = null,
  title,
}: {
  /** One entry per bucket, each `bands.length` long, oldest first. */
  rows: readonly (readonly number[])[];
  bands: readonly Band[];
  labelOf: (i: number) => string;
  tickEvery: number;
  /** The axis unit, e.g. "tokens/day". */
  unit: string;
  unitShort: string;
  /** The bucket noun the hover readout shares against, e.g. "day". */
  bucketNoun: string;
  height?: number;
  fmt?: (value: number) => string;
  markers?: readonly ChartMarker[];
  selectedMarker?: string | null;
  spans?: SpanFracs | null;
  /** A reference level drawn through the stack, e.g. the halfway line on a percent-stacked
   * mix: whichever band straddles it holds that bucket's weighted median. */
  guide?: { readonly value: number; readonly label: string } | null;
  /** Fix the y axis to this value instead of the data's max: a percent-stacked mix caps at
   * one, and headroom over a bounded axis prints gridlines like 108%. */
  capValue?: number | null;
  /** Where a bucket's column leads on click, or null for an unlinked bucket. Event grain as
   * an index lookup: a clicked instant beats a paged scroll at any real traffic. */
  bucketLink?: ((i: number) => string | null) | null;
  /** The accessible description of what the stack shows. */
  title: string;
}): ReactNode {
  const [hover, setHover] = useState<{ t: number; k: number } | null>(null);

  const H = height;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const iw = plotW / Math.max(1, rows.length);
  const totals = rows.map((r) => r.reduce((a, x) => a + x, 0));
  const max = capValue ?? (Math.max(...totals, 0) * 1.08 || 1);
  const sy = (v: number): number => plotH * (v / max);
  const fx = (f: number): number => PAD.l + f * plotW;

  const hovered = hover ? (rows[hover.t]?.[hover.k] ?? 0) : 0;
  const hoveredTotal = hover ? (totals[hover.t] ?? 0) : 0;

  return (
    <>
      <div className={styles['box']}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {/* The y axis: two gridlines and the unit, small caps, out of the data's way. */}
          {[0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={H - PAD.b - plotH * f}
                y2={H - PAD.b - plotH * f}
                stroke="var(--rule-2)"
                strokeWidth={1}
              />
              <text
                x={PAD.l - 6}
                y={H - PAD.b - plotH * f + 3}
                textAnchor="end"
                className={styles['axis']}
              >
                {fmt(max * f)}
              </text>
            </g>
          ))}
          <text x={2} y={PAD.t - 6} className={styles['unit']}>
            {unit.toUpperCase()}
          </text>

          {/* The selected marker's equal spans, behind the bars. */}
          {spans && (
            <>
              <rect
                x={fx(spans.b0)}
                y={PAD.t}
                width={fx(spans.m) - fx(spans.b0)}
                height={plotH}
                fill="var(--graphite)"
                fillOpacity={0.1}
              />
              <rect
                x={fx(spans.m)}
                y={PAD.t}
                width={fx(spans.a1) - fx(spans.m)}
                height={plotH}
                fill="var(--ink)"
                fillOpacity={0.06}
              />
            </>
          )}

          {rows.map((row, t) => {
            let y = H - PAD.b;
            const x = PAD.l + t * iw;
            return (
              <g key={t}>
                {row.map((v, k) => {
                  const hgt = Math.max(0, sy(v) - 1.5);
                  y -= sy(v);
                  const isHover = hover?.t === t && hover?.k === k;
                  const link = bucketLink?.(t) ?? null;
                  return (
                    <rect
                      key={bands[k]?.key ?? k}
                      x={x + 1}
                      y={y + 0.75}
                      width={Math.max(1, iw - 2.5)}
                      height={hgt}
                      fill={bands[k]?.tone ?? 'var(--pencil)'}
                      fillOpacity={hover && hover.k !== k ? 0.5 : 1}
                      stroke={isHover ? 'var(--ink)' : undefined}
                      strokeWidth={isHover ? 1.25 : undefined}
                      onMouseEnter={() => setHover({ t, k })}
                      onMouseLeave={() => setHover(null)}
                      {...(link === null
                        ? {}
                        : {
                            onClick: () => navigate(link),
                            style: { cursor: 'pointer' },
                            'data-bucket-link': link,
                          })}
                    />
                  );
                })}
                {t % tickEvery === 0 && (
                  <text x={x + iw / 2} y={H - 6} textAnchor="middle" className={styles['tick']}>
                    {labelOf(t)}
                  </text>
                )}
              </g>
            );
          })}

          {/* The guide level, drawn over the stack: on a percent-stacked mix, whichever band
              straddles it holds that bucket's weighted median. */}
          {guide !== null && guide.value <= max && (
            <g pointerEvents="none">
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={H - PAD.b - sy(guide.value)}
                y2={H - PAD.b - sy(guide.value)}
                stroke="var(--ink)"
                strokeWidth={1.25}
                strokeDasharray="6 4"
                opacity={0.8}
              />
              <text
                x={W - PAD.r - 2}
                y={H - PAD.b - sy(guide.value) - 4}
                textAnchor="end"
                className={styles['axis']}
              >
                {guide.label}
              </text>
            </g>
          )}

          {/* Markers ride the chart. A breaking one widens into a seam band. */}
          {markers.map((marker) => {
            const x = fx(marker.frac);
            const selected = marker.id === selectedMarker;
            return (
              <g key={marker.id}>
                {marker.breaks && (
                  <rect
                    x={x - 2}
                    y={PAD.t}
                    width={4}
                    height={plotH}
                    fill="var(--pencil)"
                    fillOpacity={0.5}
                  />
                )}
                <line
                  x1={x}
                  x2={x}
                  y1={PAD.t - 4}
                  y2={H - PAD.b}
                  stroke="var(--ink)"
                  strokeWidth={selected ? 1.5 : 1}
                  strokeDasharray="1 3"
                />
                <text
                  x={x + 4}
                  y={PAD.t + 4}
                  className={selected ? styles['daggerSelected'] : styles['dagger']}
                >
                  {selected ? `${marker.dagger} ${marker.atLabel}` : marker.dagger}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {/* The reserved readout: hover fills it, and the layout never jumps. */}
      <p className={styles['readout']} aria-live="polite">
        {hover && bands[hover.k] ? (
          <>
            {labelOf(hover.t)} · <b>{bands[hover.k]?.label}</b> · <b>{fmt(hovered)}</b>{' '}
            {unitShort} ·{' '}
            <b>{percent(hoveredTotal > 0 ? hovered / hoveredTotal : 0, 1)}</b> of the {bucketNoun}
          </>
        ) : (
          ' '
        )}
      </p>
    </>
  );
}
