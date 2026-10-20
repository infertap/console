// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The recompute register's class vocabulary.
 *
 * This file once held the document's trend view model over `/v1/figures`. The v3 console
 * dissolved that surface into the metric charts, and the builder had no callers left; it went
 * with the window-vocabulary consolidation (`docs/proposal-grain-ladder.md` §6, landing 1).
 * What remains is the one fact every rate on the glass depends on.
 */

/** Recompute is these two classes and no others. `docs/dashboard.md` §1.1. */
export const RECOMPUTE_CLASSES: readonly string[] = ['ETR', 'post_clear'];
