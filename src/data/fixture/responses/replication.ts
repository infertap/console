// SPDX-License-Identifier: AGPL-3.0-only
/** Duplication: the replication read, a node's internal duplication, identity concentration, the whales. */
import * as w from '../world';
import type {
  InstanceDuplicationData,
  ReplicationData,
  WhalesData,
} from '../../../domain/contract';
import type { ConcentrationData, ConcentrationQuery } from '../../../domain/lens';
import {
  CACHED_TH_DAY,
  DUP_TH_DAY,
  WHALES,
  WHALE_CUT,
  WHALE_IDENTITY_DAYS,
  instanceDuplicationResponse,
  replicationResponse,
} from '../replication';
import { incidentOverlap, incidentStrength } from '../thrash';
import { requirePass, resolveScope, windowSpanDays } from './shared';

/**
 * Was it one block coming back over and over, or many different ones: the question the
 * clicked bucket asks, answered as the server would answer it — over the WHOLE slice and
 * window, never a page of it. The corpus scripts the story: the incident rank's thrash hours
 * are one hot identity churning (the same shared prefix paid for again and again), and quiet
 * spans are breadth, a shallow power law over many identities. Deterministic per slice.
 */
export function identityConcentrationFor(
  age: w.AgeScript,
  query: ConcentrationQuery,
): ConcentrationData {
  requirePass(age);
  const subject = query.holder ?? query.instance ?? '';
  const abs = /^(\d+),(\d+)$/.exec(query.window);
  const a = abs?.[1] ? Number(abs[1]) : w.dayStartMs(w.WINDOW_14D.start);
  const b = abs?.[2] ? Math.max(Number(abs[2]), a + 60_000) : a + 86_400_000;
  const limit = Math.min(Math.max(query.limit ?? 10, 1), 50);

  let seed = 41;
  for (const c of `${subject}|${a}`) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const r = rngFor(seed);

  // The slice's recompute over the window, from the same shares every scoped read speaks.
  const scope = resolveScope(query.holder !== undefined ? { holder: query.holder } : { instance: subject });
  const spanDays = (b - a) / 86_400_000;
  const overlap = incidentOverlap(a, b - a);
  const strength = incidentStrength(query.holder ?? subject);
  const surge = 1 + 2.4 * overlap * strength;
  const scopeTotal = Math.round((w.WASTE_FULL / 14) * spanDays * scope.share * surge);

  // Churn concentrates, breadth spreads: the top identity's share follows the incident.
  const hot = overlap * strength;
  const topShare = Math.min(0.85, 0.08 + 0.55 * hot + r() * 0.05);
  const distinct = Math.max(3, Math.round((30 + r() * 40) * spanDays * 24 * (1 - 0.7 * hot)));
  const rows = [];
  let acc = 0;
  for (let i = 0; i < Math.min(limit, distinct); i++) {
    const share = i === 0 ? topShare : (1 - topShare) * Math.pow(i + 1, -1.4) * (0.8 + r() * 0.4) * 0.55;
    const tokens = Math.round(scopeTotal * share);
    if (tokens < 1) break;
    acc += tokens;
    rows.push({
      block_id: `b${(0x4a1 + ((seed + i * 37) % 0x300)).toString(16)}`,
      tokens: { value: tokens, coverage: 0.97 },
      events: Math.max(1, Math.round(tokens / (45 + (i % 30)))),
      holders_stored: i === 0 && hot > 0.3 ? 7 : 1 + ((seed + i) % 5),
    });
  }
  return {
    register: 'recompute',
    start_ms: a,
    end_ms: b,
    distinct_blocks: distinct,
    total_events: Math.max(rows.reduce((x, row) => x + row.events, 0), Math.round(scopeTotal / 60)),
    scope_total: Math.max(scopeTotal, acc),
    rows,
  };
}

const rngFor = (seed: number): (() => number) => {
  let st = seed >>> 0;
  return () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
};

/**
 * `/v1/residual/replication`: duplicated token-hours per bucket by copy band, with the members table.
 */
export function replicationFor(
  age: w.AgeScript,
  query: { window?: string; grain?: string; workload?: string } = {},
): ReplicationData {
  requirePass(age);
  return replicationResponse(query);
}

/** One node's internal duplication, age-gated exactly as the contract reads are. */
export function instanceDuplicationFor(
  age: w.AgeScript,
  instance: string,
  query: { window?: string; grain?: string } = {},
): InstanceDuplicationData {
  requirePass(age);
  return instanceDuplicationResponse(instance, query);
}

/**
 * The whale panel: the heaviest duplicated identities, in the wire's own shape.
 *
 * The window totals agree with the placement anchor's daily rates by construction: one corpus,
 * never authored twice. No coverage figure, by statement rather than omission: `emitted_to_ms`
 * is the honest uncertainty, and it sits one tap seal behind the corpus's wall clock.
 */
export function whalesFor(age: w.AgeScript, query: { window?: string; limit?: number } = {}): WhalesData {
  requirePass(age);
  const days = windowSpanDays(query.window, w.WINDOW_14D.days);
  const scale = days / w.WINDOW_14D.days;
  const limit = Math.max(1, Math.min(query.limit ?? WHALES.length, WHALES.length));
  const HOUR_MS = 3_600_000;
  return {
    register: 'whales',
    never_summed_with: ['capacity', 'recompute'],
    unit: 'token_ms',
    source: 'replication_whale_day',
    // A day is stated once it settles: today is not among them.
    days_stated: days - 1,
    cut: WHALE_CUT,
    duplicated_identity_days: Math.round(WHALE_IDENTITY_DAYS * scale),
    window_dup_token_ms: DUP_TH_DAY * days * HOUR_MS,
    window_held_token_ms: CACHED_TH_DAY * days * HOUR_MS,
    rows: WHALES.slice(0, limit).map((whale) => ({
      ...whale,
      dup_token_ms: whale.dup_token_ms * scale,
      dup_token_ms_bound: whale.dup_token_ms_bound * scale,
      held_token_ms: whale.held_token_ms * scale,
      days_in_cut: Math.min(whale.days_in_cut, days - 1),
    })),
  };
}

