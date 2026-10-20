// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  barWidth,
  clock,
  compact,
  count,
  day,
  decimal,
  delta,
  duration,
  hours,
  integer,
  multiplier,
  percent,
  signedPercent,
} from './numbers';

/**
 * The one module allowed to format a number. Each formatter states one rule; these pin the
 * rule, not the implementation, so a change here is a change to what every panel renders.
 */
describe('the number formatters', () => {
  it('groups a count in one locale, whatever the browser says', () => {
    expect(integer(4_187_266)).toBe('4,187,266');
    expect(integer(2.6)).toBe('3');
  });

  it('renders a fraction as a percentage at the asked density', () => {
    expect(percent(0.1234)).toBe('12.3%');
    expect(percent(0.5, 0)).toBe('50%');
  });

  it('shortens a large count by magnitude and rounds a small one', () => {
    expect(compact(999)).toBe('999');
    expect(compact(1_234)).toBe('1.2K');
    expect(compact(2_500_000)).toBe('2.50M');
    expect(compact(3e9)).toBe('3.00B');
  });

  it('keeps two decimals on a multiplier, where 1.05 and 1.04 differ', () => {
    expect(multiplier(1.05)).toBe('1.05×');
  });

  it('holds a duration in the unit an operator compares it in', () => {
    expect(duration(5_500)).toBe('5.5 s');
    expect(duration(112_000)).toBe('112 s');
    expect(duration(600_000)).toBe('10 min');
    expect(duration(90 * 60_000)).toBe('1.5 h');
  });

  it('renders observed time as hours, never a share of a window', () => {
    expect(hours(5_400_000)).toBe('1.5 h');
    expect(hours(250 * 3_600_000)).toBe('250 h');
  });

  it('renders instants as UTC, one format each', () => {
    const at = Date.UTC(2026, 0, 2, 13, 7);
    expect(clock(at)).toBe('13:07Z');
    expect(day(at)).toBe('2026-01-02');
  });

  it('signs a delta with a true minus and no colour', () => {
    expect(delta(1_234, '-')).toBe('−1,234');
    expect(delta(5, '+')).toBe('+5');
  });

  it('floors a movement inside the noise to ±0', () => {
    expect(signedPercent(0.02)).toBe('±0');
    expect(signedPercent(0.125)).toBe('+12.5%');
    expect(signedPercent(-0.5)).toBe('−50.0%');
  });

  it('states a rate at the asked precision', () => {
    expect(decimal(8.14)).toBe('8.1');
    expect(decimal(8.14159, 3)).toBe('8.142');
  });

  it('turns a value into a bar width against the widest beside it', () => {
    expect(barWidth(25, 100)).toBe('25.0%');
    expect(barWidth(-25, 100)).toBe('25.0%');
    expect(barWidth(1, 0)).toBe('0%');
  });

  it('agrees the noun with the count', () => {
    expect(count(1, 'holder')).toBe('1 holder');
    expect(count(2, 'holder')).toBe('2 holders');
    expect(count(0, 'day', 'days')).toBe('0 days');
  });
});
