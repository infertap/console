// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { Figure as CoveredFigure } from '../../domain/contract';
import type { HonestState } from '../../domain/state';
import { compact, integer, percent } from '../format/numbers';
import styles from './Figure.module.css';

/**
 * A measured quantity, on glass.
 *
 * **This component is the law made structural.** Its props cannot be satisfied by a number: it
 * takes the whole `Covered<T>`, so the coverage, the basis and the bound arrive with the value or
 * nothing renders. Add to that a required `unit` and a required `register` and the four questions
 * a reader has about any figure on this page are answered by the type system rather than by
 * whoever wrote the panel.
 *
 * The rule it enforces: a number without its coverage is unrepresentable
 * in the Rust type, and nothing here may reconstruct one by pulling `.value` out and rendering it
 * alone. A lint blocks the other route, which is formatting a number outside the design system.
 *
 * **Two things are called "register" and they are not the same thing**, which is a collision in
 * the contract rather than here:
 *
 * - `figure.register` is the BOUND, always `>=`. Every figure this product states is a lower
 *   bound, because unobserved mass is not counted and is not estimated.
 * - the `register` prop is the ACCOUNTING register, recompute or capacity. They never share an
 *   axis and never share a hue family, so that the separation of the registers holds by construction.
 */

/** The two registers a figure can belong to. They never share an axis or a hue. */
export type AccountingRegister = 'recompute' | 'capacity';
/** The size tier a figure renders at. */
export type FigureTier = 'hero' | 'panel' | 'cell';
/** How a figure's value is written. */
export type FigureFormat = 'integer' | 'percent' | 'compact';

/** A figure's inputs: the whole covered value, its unit, its register, and how to render it. */
export interface FigureProps {
  /** The whole covered value. There is deliberately no way to pass a bare number. */
  value: CoveredFigure;
  /** Real units: tokens, events, fraction of stored mass, ms. Never omitted. */
  unit: string;
  /** Which accounting register this belongs to. Drives the hue, and the hue means this. */
  register: AccountingRegister;
  tier?: FigureTier;
  format?: FigureFormat;
  /** Rendered instead of the coverage line where a section already states it once. */
  provenance?: 'full' | 'coverage-only' | 'none';
}

function render(value: number, format: FigureFormat): string {
  if (format === 'percent') return percent(value, 2);
  if (format === 'compact') return compact(value);
  return integer(value);
}

/** `>=` reads as code. The glyph reads as a bound, which is what it is. */
function boundGlyph(register: string): string {
  return register === '>=' ? '≥' : register;
}

/**
 * A covered figure on the glass: the bound, the value, the unit, and the coverage with its basis.
 */
export function Figure({
  value,
  unit,
  register,
  tier = 'panel',
  format = 'integer',
  provenance = 'full',
}: FigureProps): ReactNode {
  const classes = [styles['figure'], styles[tier], styles[register]].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <div className={styles['line']}>
        <span className={styles['bound']} aria-label="lower bound">
          {boundGlyph(value.register)}
        </span>
        <span className={styles['value']}>{render(value.value, format)}</span>
        <span className={styles['unit']}>{unit}</span>
      </div>
      {provenance !== 'none' && (
        <p className={styles['provenance']}>
          {provenance === 'full' ? (
            <>
              coverage <b>{percent(value.coverage, 1)}</b>, {value.coverage_kind}
            </>
          ) : (
            <>
              coverage <b>{percent(value.coverage, 1)}</b>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The designed absence's inputs: why there is no number, the unit it will carry, and the register.
 */
export interface UnmeasuredProps {
  /** Why there is no number. Never `fine`, which would be a contradiction. */
  state: Exclude<HonestState, 'fine'>;
  /** The unit the figure will carry once it exists. Stated now, so the axis is legible now. */
  unit: string;
  register: AccountingRegister;
  tier?: FigureTier;
  /** One sentence: what would have to happen for this to become a number. */
  reason: string;
}

/**
 * The designed absence, at the same size and in the same place.
 *
 * **It never renders as zero and it never collapses.** On day one the document wears this
 * everywhere and looks intentional doing it: the verdict figure occupies the position it holds
 * forever, and before the first pass that position states why it is not yet a number. Nothing
 * appears that was not always there, nothing relocates after filling, and sections resolve
 * rather than reflow.
 */
export function Unmeasured({
  state,
  unit,
  register,
  tier = 'panel',
  reason,
}: UnmeasuredProps): ReactNode {
  const classes = [styles['figure'], styles[tier], styles[register], styles['unmeasured']]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <div className={styles['line']}>
        {/* Unexamined regions hatch. A dash would read as a value of nothing. */}
        <span className={styles['hatch']} role="img" aria-label={state} />
        <span className={styles['unit']}>{unit}</span>
      </div>
      <p className={styles['reason']}>{reason}</p>
    </div>
  );
}
