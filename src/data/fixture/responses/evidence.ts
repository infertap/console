// SPDX-License-Identifier: AGPL-3.0-only
/** A day and the records behind a figure. */
import * as w from '../world';
import type { DayData, EvidenceData } from '../../../domain/contract';
import { ApiError } from '../../../domain/refusal';
import {
  dayMasses,
  errorBody,
  figure,
  paginate,
  reachFor,
  readFromFor,
  requirePass,
} from './shared';

/** `/v1/days/{day}`: one settled day's masses, its heaviest holders and its coverage. */
export function dayFor(
  age: w.AgeScript,
  day: string,
  query: { limit?: number; cursor?: string } = {},
): DayData {
  requirePass(age);
  const masses = dayMasses(age);
  const mass = masses.find((m) => m.date === day);
  if (!mass) {
    throw new ApiError(
      404,
      errorBody(
        'window_invalid',
        `${day} lies outside the days this fleet has banked; the corpus runs ${w.dayDate(0)} to ${w.TODAY}`,
        { first_day: w.dayDate(0), last_day: w.TODAY },
      ),
      'day outside the banked range',
    );
  }
  const { reach, withinRaw } = reachFor(age, day);

  // **One section refuses, not the response.** `by_class`, `coverage` and the evidence bound are
  // unpaged and stay valid, so a stale holders cursor must not blank the day panel around them.
  const paged = paginate(w.HOLDERS, age, {
    ...(query.limit === undefined ? { limit: 10 } : { limit: query.limit }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  });

  const holderSection = paged.refused
    ? { holders_page: paged.page, holders_refused: paged.refusal }
    : {
        holders_page: paged.page,
        holders: paged.rows.map((h) => ({
          holder: { instance: h.instance, dp_rank: h.dp_rank, group_idx: h.group_idx },
          tokens: figure(Math.round(h.tokens / w.WINDOW_14D.days), h.coverage),
          share_of_fleet_total: figure(h.tokens / w.WASTE_FULL, h.coverage),
        })),
      };

  return {
    day,
    by_class: [
      { class: 'ETR', tokens: figure(mass.etr, mass.coverage) },
      { class: 'post_clear', tokens: figure(mass.postClear, mass.coverage) },
    ],
    coverage: figure(mass.coverage, mass.coverage),
    ...holderSection,
    // Carried rather than inferred from an empty drill: a retention bound is not an absence of
    // activity.
    evidence_available: withinRaw,
    evidence_bound: reach,
  };
}

/** `/v1/evidence`: the records behind a figure, bounded by the log's reach and paged. */
export function evidenceFor(
  age: w.AgeScript,
  query: {
    block?: string;
    holder?: string;
    window?: string;
    limit?: number;
    cursor?: string;
  } = {},
): EvidenceData {
  requirePass(age);
  const subject = query.holder !== undefined ? 'holder' : 'block';
  // An absolute window turns event grain into an index lookup: the records for one subject
  // in one clicked bucket, exactly as the wire's window grammar serves it. The day form
  // stays the day drill's shape.
  const abs = /^(\d+),(\d+)$/.exec(query.window ?? '');
  if (abs?.[1] && abs[2]) {
    const a = Number(abs[1]);
    const b = Math.max(Number(abs[2]), a + 60_000);
    const anchorDay = new Date(a).toISOString().slice(0, 10);
    const { reach: windowReach, withinRaw: windowWithinRaw } = reachFor(age, anchorDay);
    if (!windowWithinRaw) {
      return {
        reach: windowReach,
        read_from: readFromFor(subject),
        records: [],
        truncated: false,
        page: { limit: query.limit ?? 24, returned: 0, next_cursor: null, total_rows: 0 },
        refused: {
          cause: 'outside_raw_horizon',
          message: `event grain is retained about ${w.RAW_HORIZON_DAYS} days; the asked window starts past the oldest record this fleet holds`,
          bound: {
            raw_from_day: w.WINDOW_14D.start,
            declared_days: w.RAW_HORIZON_DAYS,
          },
        },
      };
    }
    const read_from = readFromFor(subject);
    let seed = 97;
    for (const c of `${query.holder ?? query.block ?? ''}`) {
      seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    }
    // Deterministic per subject and instant: roughly one store every few seconds, exactly
    // the density that makes a raw scroll useless and an index lookup the honest form.
    const stepMs = 4_000 + (seed % 5_000);
    const n = Math.min(600, Math.floor((b - a) / stepMs));
    const windowRows = Array.from({ length: n }, (_, i) => ({
      at_ms: a + i * stepMs + ((seed + i * 53) % 3_000),
      block_id: `b${(0x4a1 + ((seed + i * 37) % 0x300)).toString(16)}`,
      class: (seed + i) % 3 === 0 ? 'post_clear' : 'ETR',
      n_tokens: Math.round(900 + ((seed + i * 97) % 7200)),
      coverage: 0.97,
    }));
    const windowPaged = paginate(windowRows, age, {
      ...(query.limit === undefined ? { limit: 24 } : { limit: query.limit }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
    if (windowPaged.refused) {
      return {
        reach: windowReach,
        read_from: readFromFor(subject),
        truncated: false,
        page: windowPaged.page,
        refused: windowPaged.refusal,
      };
    }
    return {
      reach: windowReach,
      read_from,
      records: windowPaged.rows,
      truncated: windowPaged.page.next_cursor !== null,
      page: windowPaged.page,
    };
  }
  const day = w.frontierDay(age);
  const { reach, withinRaw } = reachFor(age, day);

  if (!withinRaw) {
    // A refusal is a result. The drill renders this in place, with its bound, rather than
    // showing an empty table that reads as "nothing happened that day".
    return {
      reach,
      read_from: readFromFor(subject),
      records: [],
      truncated: false,
      page: { limit: query.limit ?? 8, returned: 0, next_cursor: null, total_rows: 0 },
      refused: {
        cause: 'outside_raw_horizon',
        message: `event grain is retained about ${w.RAW_HORIZON_DAYS} days; ${day} is older than the oldest record this fleet holds`,
        bound: {
          raw_from_day: w.WINDOW_14D.start,
          declared_days: w.RAW_HORIZON_DAYS,
          requested_day: day,
        },
      },
    };
  }

  const seed = w.dayStartMs(day) / 86_400_000;
  const all = Array.from({ length: 24 }, (_, i) => ({
    at_ms: w.dayStartMs(day) + 32_400_000 + i * 417_000,
    block_id: `b${(0x9f2 + i * 53).toString(16)}`,
    class: i % 3 === 0 ? 'post_clear' : 'ETR',
    n_tokens: Math.round(900 + ((seed + i * 53) % 7200)),
    coverage: 0.97,
  }));
  const paged = paginate(all, age, {
    ...(query.limit === undefined ? { limit: 8 } : { limit: query.limit }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  });
  if (paged.refused) {
    return { reach, read_from: readFromFor(subject), truncated: false, page: paged.page, refused: paged.refusal };
  }
  return {
    reach,
    read_from: readFromFor(subject),
    records: paged.rows,
    truncated: paged.page.next_cursor !== null,
    page: paged.page,
  };
}

