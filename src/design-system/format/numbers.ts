// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Number formatting. **The only module allowed to format a number**, lint-enforced.
 *
 * The rule looks fussy and is not. A number formatted inside a feature is a number that was
 * pulled out of its `Covered<T>` to be formatted, which means it reached the page without its
 * coverage, its register and its basis. Keeping the formatters here means the only route from a
 * figure to glass runs through `<Figure>`, which cannot be constructed without all three.
 *
 * Formats are ported from `mockups/assets/console-v2.js` so the rendered output matches the
 * design that was reviewed.
 */

/**
 * A count, grouped. `en-US` explicitly rather than the browser's locale.
 *
 * A meter that renders 4.187.266 to one reader and 4,187,266 to another has made the same figure
 * two figures, and screenshots stop being comparable across a team. Locale is a presentation
 * choice this product makes once.
 */
export function integer(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** A fraction as a percentage. One decimal by default, which is the mock's density. */
export function percent(fraction: number, decimals = 1): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}

/**
 * A multiplier, as in copies per cached token.
 *
 * Here rather than at the call site because the law is that a number formatted outside the design
 * system is a number that left its coverage behind, and the lint enforces it. Two decimals,
 * because the interesting range sits just above 1.00 on a fleet that is mostly unique content and
 * one decimal would round 1.05 and 1.04 into the same figure.
 */
export function multiplier(value: number): string {
  return `${value.toFixed(2)}\u00d7`;
}

/**
 * A large count, shortened.
 *
 * For the odometer and the status strip, where the exact digit is not the point and the width
 * is. Never for an accounting figure: a token mass renders in full, because rounding a lower
 * bound upward would state something the meter did not measure.
 */
export function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}

/**
 * Milliseconds in the unit an operator holds them in.
 *
 * Seconds up to ten minutes, because ingest lag is a seconds quantity to the person watching it:
 * "112 s" is a number they compare against a heartbeat interval, and "1.9 min" is the same fact
 * rounded into a unit nobody configured anything in.
 */
export function duration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 600) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${minutes.toFixed(0)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

/**
 * Milliseconds as hours, for observed-telemetry tiles.
 *
 * Time, never a percentage: a day-old install reads as its real hours instead of a damning
 * share of a window it was not installed for.
 */
export function hours(ms: number): string {
  const h = ms / 3_600_000;
  return h >= 100 ? `${integer(Math.round(h))} h` : `${h.toFixed(1)} h`;
}

/** A UTC instant as a wall clock, for the dark strip only. */
export function clock(atMs: number): string {
  return `${new Date(atMs).toISOString().slice(11, 16)}Z`;
}

/** A UTC day. Dates render as `YYYY-MM-DD` everywhere: sortable, unambiguous, one format. */
export function day(atMs: number): string {
  return new Date(atMs).toISOString().slice(0, 10);
}

/**
 * A signed delta, in neutral ink with its sign.
 *
 * Deltas never carry valence colour. A rising token mass mostly tracks rising traffic, and
 * colouring it would be a conclusion the meter has no basis for; magnitude is carried
 * geometrically by whatever renders beside this.
 */
export function delta(value: number, sign: string): string {
  return `${sign === '-' ? '−' : '+'}${integer(Math.abs(value))}`;
}

/**
 * A rate or small quantity, at a stated precision. For hover base rates, where "8.1 → 4.9
 * tok-h/min" is the claim behind a percentage and the decimal carries real information.
 */
export function decimal(value: number, places = 1): string {
  return value.toFixed(places);
}

/**
 * A relative movement, in neutral ink with its sign.
 *
 * Movements smaller than the series' own noise render as `±0` rather than as a sign: a delta
 * the meter cannot distinguish from wobble must not read as a direction. The floor is the
 * scripted noise amplitude of the attribution series.
 */
export function signedPercent(fraction: number): string {
  if (Math.abs(fraction) < 0.03) return '±0';
  return `${fraction > 0 ? '+' : '−'}${percent(Math.abs(fraction), 1)}`;
}

/**
 * A bar's width, as a CSS percentage of the widest value beside it.
 *
 * Geometry rather than a figure, and it lives here for the same reason the figures do: the lint
 * that keeps numbers out of features cannot tell a proportion from a token mass, and it should
 * not try. Anything that turns a number into characters belongs in one place.
 *
 * Magnitude carried geometrically is the product's preferred device for deltas, which colour is
 * forbidden from expressing.
 */
export function barWidth(value: number, max: number): string {
  if (max <= 0) return '0%';
  return `${((Math.abs(value) / max) * 100).toFixed(1)}%`;
}

/**
 * A count with its noun agreeing.
 *
 * Small, and it earns its place: "1 holders not listable" reads as a bug in the meter rather
 * than a fact about the fleet, and a product whose whole argument is precision cannot afford to
 * look careless at the exact moment it reports a degraded count.
 */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${integer(n)} ${n === 1 ? singular : plural}`;
}
