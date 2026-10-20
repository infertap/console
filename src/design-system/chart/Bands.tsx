// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { Band } from './BandStack';
import { percent } from '../format/numbers';
import styles from './Bands.module.css';

/**
 * The band furniture around a stack: legend, composition register, row strip.
 *
 * The legend identifies and quantifies in one wrapping line; the chart carries the story. The
 * composition register is the window's band shares for the selected scope, as a 100%-stacked
 * strip with direct labels: it is the breakdown's summary row, not a color key. The row strip is
 * the same shape at table density, one per cut member.
 */

/** The bands' summary row: each band's swatch and label, with its hover title. */
export function BandLegend({
  bands,
  titles,
}: {
  bands: readonly Band[];
  /** Hover title per band: its mass and share, so the legend quantifies without spending glass. */
  titles?: readonly string[];
}): ReactNode {
  return (
    <div className={styles['legend']}>
      {bands.map((band, k) => (
        <span
          key={band.key}
          className={styles['legendItem']}
          {...(titles?.[k] ? { title: titles[k] } : {})}
        >
          <span className={styles['swatch']} style={{ background: band.tone }} />
          <span className={styles['legendName']}>{band.label}</span>
        </span>
      ))}
    </div>
  );
}

/** One cut member's share composition as a single labelled strip. */
export function CompositionBar({
  label,
  shares,
  bands,
  titles,
}: {
  label: string;
  /** Fractions summing to one, in band order. */
  shares: readonly number[];
  bands: readonly Band[];
  /** Hover title per band, carrying the absolute mass beside the share. */
  titles: readonly string[];
}): ReactNode {
  return (
    <div className={styles['comp']}>
      <p className={styles['compLabel']}>{label}</p>
      <div className={styles['compBar']}>
        {shares.map((share, k) => (
          <span
            key={bands[k]?.key ?? k}
            title={`${bands[k]?.label} · ${titles[k]} · ${percent(share, 1)}`}
            style={{ width: percent(share, 2), background: bands[k]?.tone }}
          />
        ))}
      </div>
      <div className={styles['compLine']}>
        {shares.map((share, k) => (
          <span
            key={bands[k]?.key ?? k}
            title={`${bands[k]?.label} · ${titles[k]} · ${percent(share, 1)}`}
            style={{ width: percent(share, 2) }}
          >
            {share >= 0.05 ? percent(share, 1) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A cut member's band shape at table density. Geometry only; the row carries the figures. */
export function RowStrip({
  shares,
  bands,
}: {
  shares: readonly number[];
  bands: readonly Band[];
}): ReactNode {
  return (
    <span className={styles['strip']} aria-hidden="true">
      {shares.map((share, k) => (
        <i
          key={bands[k]?.key ?? k}
          style={{ width: percent(share, 1), background: bands[k]?.tone }}
        />
      ))}
    </span>
  );
}
