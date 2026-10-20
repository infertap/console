// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the instance page's two duplication renders share: the copies bands folded onto the
 * panel's four, the locality axis, and the one derivation of the held-twice share.
 */
import type { Band } from '../../../design-system/chart/BandStack';
import type { InstanceDuplicationData } from '../../../domain/contract';
import { COPY_BANDS } from '../../../domain/lens';

/** The dashboard's copy-band tones, in band order: the same four the workload page paints. */
const COPY_TONES = ['var(--cap-4)', 'var(--cap-3)', 'var(--cap-2)', 'var(--cap-1)'] as const;
/** The copies bands with the tones the panel paints them in. */
export const COPY_BAND_ROWS: readonly Band[] = COPY_BANDS.map((band, i) => ({
  ...band,
  tone: COPY_TONES[i] ?? 'var(--pencil)',
}));

/**
 * The wire's copies band folded onto the panel's four. The analyzer emits `2`, `3`, `4`,
 * `5-8`, `9-16` and `17+`, never `1`; the leading count places a row, so `3-4` lands where
 * `3` and `4` do and everything from nine up lands in the top band. A row this cannot place
 * is dropped rather than guessed.
 */
export function copiesBandIndex(band: string): number {
  const n = Number.parseInt(band, 10);
  if (!Number.isFinite(n) || n < 2) return -1;
  if (n === 2) return 0;
  if (n <= 4) return 1;
  if (n <= 8) return 2;
  return 3;
}

/** The duplication panel's secondary axis: where the copies sat. */
export type Locality = 'within' | 'group' | 'both';
/** The locality axis's options, each with the words the head and the hover use. */
export const LOCALITIES: readonly { id: Locality; label: string; words: string }[] = [
  { id: 'within', label: 'within ranks', words: 'across its ranks' },
  { id: 'group', label: 'across cache groups', words: 'across its cache groups' },
  { id: 'both', label: 'both', words: 'across ranks and cache groups' },
];
/** The words for a locality, as the head and the hover say them. */
export const localityWords = (locality: Locality): string =>
  LOCALITIES.find((l) => l.id === locality)?.words ?? '';

/**
 * The ratified fraction, computed in ONE place: the share of what this node holds that it
 * holds twice across its own ranks. Null when the node held nothing over the window, since
 * a share of nothing is unstated rather than zero.
 */
export function heldTwiceShare(d: InstanceDuplicationData): number | null {
  return d.held_token_ms > 0 ? d.within_ranks_token_ms / d.held_token_ms : null;
}
