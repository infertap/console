// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The attribution ledger: both registers at minute grain, with every marker on them.
 *
 * **Pre-contract.** The v0 attribution card is windowed sums over `classified_stores`, which is
 * event grain today; the v1 card is the streamed producer's minute buckets. Neither read exists
 * on the wire yet, so this corpus scripts one contiguous day of five-minute buckets per scope,
 * and the before/after card computes over it exactly as the server-side read will: means over
 * equal spans either side of the marker instant, the after span honestly still filling for a
 * recent marker.
 *
 * **Scope is the operator's lens.** Each scope carries its own baseline rates and its own
 * visibility of each deploy's effect: the affinity change lands at full strength in rag-batch,
 * diluted at fleet, and invisibly elsewhere. That is scope dilution scripted, so the panel can
 * show the same deploy reading differently under different cuts because the effect really is
 * scoped.
 */

import type { AttributionCard, AttributionQuery, ScenarioKey } from '../../domain/lens';
import { MIN_MS } from '../../domain/windows';
import { DEPLOYS, TODAY } from './world';

/** 288 five-minute buckets: one contiguous day ending twenty minutes past the last deploy. */
export const LEDGER_N = 288;
export const LEDGER_START_MS = Date.parse(`${TODAY}T14:40:00Z`) - 24 * 3_600_000;

interface LedgerScope {
  readonly key: string;
  readonly label: string;
  /** Baseline recompute rate, tokens per minute. */
  readonly rc: number;
  /** Baseline duplication rate, token-hours per minute. */
  readonly du: number;
  /** How visibly the affinity deploy lands in this scope. */
  readonly aff: number;
  /** How visibly the engine rollout lands in this scope. */
  readonly eng: number;
}

const SCOPES: readonly LedgerScope[] = [
  { key: 'fleet', label: 'fleet', rc: 207, du: 8.1, aff: 0.42, eng: 0.3 },
  { key: 'rag-batch', label: 'rag-batch', rc: 85, du: 4.2, aff: 1, eng: 0.3 },
  { key: 'chat-prod', label: 'chat-prod', rc: 79, du: 2.5, aff: 0.05, eng: 0.3 },
  { key: 'code-assist', label: 'code-assist', rc: 25, du: 0.9, aff: 0.05, eng: 0.3 },
  { key: 'undeclared', label: 'undeclared', rc: 18, du: 0.5, aff: 0.05, eng: 0.3 },
];

/** What the affinity change does to each register at full effect, per scenario. */
const SCENARIO_EFFECT: Readonly<Record<ScenarioKey, { rc: number; du: number }>> = {
  win: { rc: 0.985, du: 0.62 },
  reg: { rc: 1.06, du: 1.31 },
};

/** An unknown scope reads as fleet: the lens degrades to the widest cut, never to nothing. */
function scopeOf(key: string): LedgerScope {
  return SCOPES.find((s) => s.key === key) ?? (SCOPES[0] as LedgerScope);
}

/** The bucket index an instant falls in, clamped to the ledger. */
export function ledgerIndex(atMs: number): number {
  return Math.min(LEDGER_N - 1, Math.max(0, Math.round((atMs - LEDGER_START_MS) / (5 * MIN_MS))));
}

const rng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

interface LedgerDay {
  readonly rc: readonly number[];
  readonly du: readonly number[];
}

/**
 * One scope's day. Diurnal drift, then each deploy's scripted effect at its real instant: the
 * engine rollout is a fleet-wide transient (recompute spike, duplication dip, both decaying),
 * and the affinity change is the change under test, whose direction the scenario decides.
 */
function ledgerDayFor(scope: LedgerScope, scenario: ScenarioKey): LedgerDay {
  const effect = SCENARIO_EFFECT[scenario];
  const r = rng(6011 + scope.key.length * 13);
  const engineIdx = ledgerIndex(DEPLOYS.find((d) => d.id === 'engine-0-9-4')?.atMs ?? 0);
  const affinityIdx = ledgerIndex(DEPLOYS.find((d) => d.id === 'affinity-weights')?.atMs ?? 0);
  const rc: number[] = [];
  const du: number[] = [];
  for (let i = 0; i < LEDGER_N; i++) {
    const hh = new Date(LEDGER_START_MS + i * 5 * MIN_MS).getUTCHours();
    const diurnal = 1 + 0.16 * Math.sin(((hh - 8) / 24) * 2 * Math.PI);
    let rcv = scope.rc * diurnal * (1 + (r() - 0.5) * 0.16);
    let duv = scope.du * diurnal * (1 + (r() - 0.5) * 0.22);
    if (i >= engineIdx) {
      const e = Math.exp(-(i - engineIdx) / 3);
      rcv *= 1 + 0.4 * scope.eng * e;
      duv *= 1 - 0.45 * scope.eng * e;
    }
    if (i >= affinityIdx) {
      const k = Math.min(1, (i - affinityIdx) / 2.4);
      rcv *= 1 + k * (effect.rc - 1) * scope.aff;
      duv *= 1 + k * (effect.du - 1) * scope.aff;
    }
    rc.push(rcv);
    du.push(duv);
  }
  return { rc, du };
}

/**
 * The card's arithmetic: means over equal spans, one hour either side, the after span clamped
 * to what exists. Computed at the ledger's own grain regardless of the chart's displayed grain,
 * which is why the card answers the same on every window.
 */
export function attributionFor(query: AttributionQuery): AttributionCard {
  const day = ledgerDayFor(scopeOf(query.scope), query.scenario ?? 'win');
  const idx = ledgerIndex(query.atMs);
  const b0 = Math.max(0, idx - 12);
  const a1 = Math.min(LEDGER_N - 1, idx + 12);
  const mean = (xs: readonly number[], s: number, e: number): number => {
    let t = 0;
    let c = 0;
    for (let i = s; i < e; i++) {
      t += xs[i] ?? 0;
      c += 1;
    }
    return c > 0 ? t / c : 0;
  };
  return {
    rcBefore: mean(day.rc, b0, idx),
    rcAfter: mean(day.rc, idx + 1, a1 + 1),
    duBefore: mean(day.du, b0, idx),
    duAfter: mean(day.du, idx + 1, a1 + 1),
    afterMinutes: (a1 - idx) * 5,
  };
}

export function ledgerInvariants(): readonly { name: string; holds: boolean }[] {
  const affinity = DEPLOYS.find((d) => d.id === 'affinity-weights');
  const atMs = affinity?.atMs ?? 0;
  const ragWin = attributionFor({ scope: 'rag-batch', atMs, scenario: 'win' });
  const fleetWin = attributionFor({ scope: 'fleet', atMs, scenario: 'win' });
  const ragReg = attributionFor({ scope: 'rag-batch', atMs, scenario: 'reg' });
  const rel = (b: AttributionCard): number => (b.duAfter - b.duBefore) / b.duBefore;
  return [
    {
      name: 'the ledger covers both deploys',
      holds: DEPLOYS.every((d) => {
        const i = ledgerIndex(d.atMs);
        return i > 0 && i < LEDGER_N - 1;
      }),
    },
    {
      name: 'the affinity after-span is still filling',
      holds: ragWin.afterMinutes < 60,
    },
    {
      name: 'the win cuts duplication where the deploy landed',
      holds: rel(ragWin) < -0.15,
    },
    {
      name: 'the regression raises it',
      holds: rel(ragReg) > 0.1,
    },
    {
      name: 'scope dilution is visible: the fleet reads the same deploy smaller',
      holds: Math.abs(rel(fleetWin)) < Math.abs(rel(ragWin)),
    },
  ];
}
