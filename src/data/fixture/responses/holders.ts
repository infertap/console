// SPDX-License-Identifier: AGPL-3.0-only
/** The holders and blocks: the ranking, its drills, a block's holders, a holder's timeline, the tags. */
import * as w from '../world';
import type {
  BlockHoldersData,
  BlocksData,
  HolderId,
  HolderRow,
  HoldersData,
  TagsData,
  TimelineData,
} from '../../../domain/contract';
import { figure, paginate, reachFor, readFromFor, requirePass, windowSpanDays } from './shared';

export function holdersFor(
  age: w.AgeScript,
  query: {
    limit?: number;
    cursor?: string;
    class?: string;
    workload?: string;
    window?: string;
  } = {},
): HoldersData {
  requirePass(age);
  // Window continuity: the page reads the same window the dashboard emits, and the masses scale
  // with the span the way the daily rollup would sum. Fractional-day windows scale linearly,
  // which is scaffolding; the live read answers at its own grain or refuses.
  const scale = windowSpanDays(query.window, w.WINDOW_14D.days) / w.WINDOW_14D.days;
  const pool = w.HOLDERS.filter((h) => (query.workload ? h.workload === query.workload : true));
  const paged = paginate(pool, age, query);
  if (paged.refused) {
    // The heading and the page block survive; only the rows are replaced. `fleet_total` goes
    // with them, because a denominator from a pass we can no longer page is not a denominator
    // for rows we did not read.
    return { register: 'recompute', page: paged.page, refused: paged.refusal };
  }
  const rows: HolderRow[] = paged.rows.map((h) => ({
    holder: { instance: h.instance, dp_rank: h.dp_rank, group_idx: h.group_idx },
    tokens: figure(Math.round(h.tokens * scale), h.coverage),
    events: Math.round(h.events * scale),
    // The share's denominator comes from the same read as the rows, so a concurrent pass cannot
    // put a numerator and a denominator from two different passes in one row.
    share_of_fleet_total: figure(h.tokens / w.WASTE_FULL, h.coverage),
    model: h.model,
    workload: h.workload,
    // The server's read-time judgment: paint from `state` alone, reason present exactly
    // when inactive.
    state: h.status,
    ...(h.statusReason === null ? {} : { reason: h.statusReason }),
  }));
  return {
    register: 'recompute',
    fleet_total: figure(Math.round(w.WASTE_FULL * scale), w.COVERAGE_FULL),
    page: paged.page,
    rows,
  };
}

/**
 * Each day's blocks by stored mass, from a summary of bounded memory: every figure a bound,
 * with its error stated. **A ranking, not a page**: it issues no cursor.
 */
export function blocksFor(
  age: w.AgeScript,
  query: { window?: string; limit?: number } = {},
): BlocksData {
  requirePass(age);
  const capacity = 4096;
  const limit = query.limit ?? 50;
  const days = [w.frontierDay(age)].map((day) => {
    const blocks = w.HOLDERS.slice(0, Math.min(40, limit)).map((h, i) => {
      const upper = Math.round(h.tokens / 6);
      return {
        block_id: `b${(0x4a1 + i * 37).toString(16)}`,
        tokens_at_least: upper,
        tokens_at_most: upper,
        certain: i < 10,
        // Holders that STORED it, never holders it was resident on at once: a lower bound.
        holders_at_least: 2 + (i % 9),
      };
    });
    const tokens = blocks.reduce((sum, b) => sum + b.tokens_at_most, 0);
    return {
      day,
      tokens: figure(tokens, 0.97),
      capacity,
      cut: 50,
      error_bound: tokens / capacity,
      blocks,
    };
  });
  return { register: 'stored', days };
}

/**
 * The declared tags over the window. This fleet declares none, so the read states its coverage
 * and an empty grouping rather than a zero.
 */
export function tagsFor(age: w.AgeScript): TagsData {
  requirePass(age);
  const window = w.stampedWindow(age);
  const days = w.dayIndex(window.end) - w.dayIndex(window.start) + 1;
  return {
    through_ms: w.dayStartMs(w.frontierDay(age)) + 43_200_000,
    coverage: {
      covered_ms: 0.97 * days * 86_400_000,
      window_ms: days * 86_400_000,
      fraction: 0.97,
    },
    tags: [],
  };
}

export function blockHoldersFor(
  age: w.AgeScript,
  blockId: string,
  query: { window?: string; limit?: number; cursor?: string } = {},
): BlockHoldersData {
  requirePass(age);
  const all = w.HOLDERS.slice(0, 9).map((h, i) => ({
    holder: { instance: h.instance, dp_rank: h.dp_rank, group_idx: h.group_idx },
    at_ms: w.dayStartMs(w.TODAY) + 28_800_000 + i * 611_000,
    class: i % 4 === 0 ? 'post_clear' : 'ETR',
    // Event grain, so a row carries the mass the analysis stated rather than an aggregate this layer
    // derived. That is why `n_tokens` is a column here and a figure on the blocks table.
    n_tokens: 1800 + i * 940,
  }));
  // Keyset paging: the read answers "is there more" from the same statement, so `total_rows`
  // stays null rather than costing a second scan for a number nobody reads.
  const paged = paginate(all, age, query, { countable: false });
  if (paged.refused) {
    return {
      block_id: blockId,
      bound: reachFor(age, w.frontierDay(age)).reach,
      read_from: readFromFor('block'),
      page: paged.page,
      refused: paged.refusal,
    };
  }
  return {
    block_id: blockId,
    bound: reachFor(age, w.frontierDay(age)).reach,
    read_from: readFromFor('block'),
    rows: paged.rows,
    page: paged.page,
  };
}

export function timelineFor(
  age: w.AgeScript,
  holder: HolderId,
  query: { window?: string; limit?: number; cursor?: string } = {},
): TimelineData {
  requirePass(age);
  // An absolute window is honored, not ignored: the rank page's pulse asks newest, and the
  // chart-to-evidence jump asks one bucket's span. Deterministic per holder either way.
  let seed = 11;
  for (const c of `${holder.instance}/${holder.dp_rank}/${holder.group_idx}`) {
    seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  }
  const abs = /^(\d+),(\d+)$/.exec(query.window ?? '');
  const all = abs?.[1] && abs[2]
    ? (() => {
        const a = Number(abs[1]);
        const b = Math.max(Number(abs[2]), a + 60_000);
        const stepMs = 5_000 + (seed % 4_000);
        const n = Math.min(600, Math.floor((b - a) / stepMs));
        return Array.from({ length: n }, (_, i) => ({
          at_ms: a + i * stepMs + ((seed + i * 41) % 2_500),
          block_id: `b${(0x4a1 + ((seed + i * 37) % 0x300)).toString(16)}`,
          class: (seed + i) % 3 === 0 ? 'post_clear' : 'ETR',
          n_tokens: 1800 + ((seed + i * 1097) % 9200),
        }));
      })()
    : Array.from({ length: 14 }, (_, i) => ({
        at_ms: w.dayStartMs(w.TODAY) - (13 - i) * 3_600_000,
        block_id: `b${(0x4a1 + ((seed + i * 37) % 0x300)).toString(16)}`,
        class: (seed + i) % 3 === 0 ? 'post_clear' : 'ETR',
        n_tokens: 1800 + ((seed + i * 1097) % 9200),
      }));
  const paged = paginate(all, age, query, { countable: false });
  const bound = reachFor(age, w.frontierDay(age)).reach;
  if (paged.refused) {
    return { holder, bound, read_from: readFromFor('holder'), page: paged.page, refused: paged.refusal };
  }
  return {
    holder,
    bound,
    read_from: readFromFor('holder'),
    rows: paged.rows,
    page: paged.page,
  };
}

