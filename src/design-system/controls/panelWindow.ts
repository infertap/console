// SPDX-License-Identifier: AGPL-3.0-only
import { useMemo } from 'react';
import {
  DEFAULT_WINDOW,
  WINDOW_STOPS,
  customSeed,
  parseRangeInput,
  windowKey,
  type WindowDesc,
  type WindowKey,
  type WindowStop,
} from '../../domain/windows';
import { useQueryParams } from '../navigation/router';

/**
 * A panel's window control, as state: the stop, the custom bounds, and the `window` value the
 * panel asks its read for.
 *
 * **Containment holds.** Each panel owns its own window under its own parameter prefix, so two
 * panels on one page move independently. What they share is the
 * VOCABULARY: the same stops, the same default, the same parameter shape, from one place. Four
 * panels each declaring their own stop list is how "3 h" came to mean two things on one page.
 *
 * **A custom stop is always a complete ask.** Selecting "custom" seeds both bounds from the
 * window the panel was showing, in the same navigation as the stop, so the first custom
 * request restates that window in the absolute form. Editing one bound fills the other from
 * the seed. The read never sees `0,0`.
 */
export interface PanelWindow {
  readonly win: WindowKey;
  /** The custom bounds as typed, datetime-local values, or null where not set. */
  readonly from: string | null;
  readonly to: string | null;
  /** The `window` value to ask for: the stop's token, or `start_ms,end_ms` for a custom range. */
  readonly ask: string;
  /** Pick a stop. Passing "custom" needs the window the panel is showing, to seed the bounds. */
  readonly select: (id: string, showing: WindowDesc) => void;
  readonly setFrom: (value: string, showing: WindowDesc) => void;
  readonly setTo: (value: string, showing: WindowDesc) => void;
}

/**
 * A panel's window state under its own parameter prefix: the stop, the custom bounds, and the ask.
 */
export function usePanelWindow(
  prefix: string,
  offered: readonly WindowStop[] = WINDOW_STOPS,
): PanelWindow {
  const keys = useMemo(
    () => ({ win: `${prefix}win`, from: `${prefix}from`, to: `${prefix}to` }),
    [prefix],
  );
  const keyList = useMemo(() => [keys.win, keys.from, keys.to], [keys]);
  const [raw, set] = useQueryParams(keyList);
  const win = windowKey(raw[keys.win] ?? null, offered);
  const from = raw[keys.from] ?? null;
  const to = raw[keys.to] ?? null;

  // A custom stop with a bound missing is an incomplete address (hand-typed, or an old link):
  // it renders the default window with the range row open, never a request about nothing.
  const ask =
    win === 'custom'
      ? from && to
        ? `${parseRangeInput(from)},${parseRangeInput(to)}`
        : DEFAULT_WINDOW
      : win;

  return {
    win,
    from,
    to,
    ask,
    select: (id, showing) => {
      if (id === 'custom') {
        const seed = customSeed(showing);
        set({ [keys.win]: 'custom', [keys.from]: from ?? seed.from, [keys.to]: to ?? seed.to });
      } else {
        set({ [keys.win]: id === DEFAULT_WINDOW ? null : id, [keys.from]: null, [keys.to]: null });
      }
    },
    setFrom: (value, showing) =>
      set({ [keys.from]: value, [keys.to]: to ?? customSeed(showing).to }),
    setTo: (value, showing) =>
      set({ [keys.to]: value, [keys.from]: from ?? customSeed(showing).from }),
  };
}
