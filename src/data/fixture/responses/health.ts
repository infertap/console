// SPDX-License-Identifier: AGPL-3.0-only
/** The roster, coverage, delivery and health: who reported, how much was seen, what arrived. */
import * as w from '../world';
import type {
  AnalyzeData,
  CoverageData,
  DeliveryData,
  HealthData,
  RosterData,
  RunRow,
} from '../../../domain/contract';
import { INSTANCE_TIME, dayMasses, paginate, requirePass, windowDays } from './shared';

/**
 * Run states and their counts, shared by the roster and by health.
 *
 * Two surfaces state the same population, so they read it from one place. Staleness is judged
 * per run, which is why these total to the RUN count and never to the holder count.
 */
/**
 * The roster's inactive slots, by name, sized to the scripted run counts (5 silent, 6
 * stopped, 1 ungraded) and overlapping the holders corpus's own story where the two can
 * agree: i-001..i-003 carry the silent holders, i-041 the clean stop, i-023 an undeclared
 * rank. The remainder are fillers, deterministic. The two families were scripted separately
 * and their counts do not reconcile exactly (six ungraded HOLDERS, one ungraded run); the
 * roster is the run authority and the looseness is recorded here rather than smoothed.
 */
const SILENT_INSTANCES = ['i-001', 'i-002', 'i-003', 'i-058', 'i-096'];
const STOPPED_INSTANCES = ['i-041', 'i-014', 'i-047', 'i-072', 'i-089', 'i-104'];
const UNGRADED_INSTANCES = ['i-023'];

function runPopulation(age: w.AgeScript): { counts: Record<string, number>; rows: RunRow[] } {
  const scale = age.key === 't3' ? 1 : age.key === 't2' ? 0.92 : age.key === 't1' ? 0.6 : 0;
  const counts: Record<string, number> = {};
  for (const g of w.RUNS) counts[g.state] = Math.round(g.count * scale);
  // The platform threshold: heartbeats arrive at least every five minutes, and the declared
  // bound widens that to a thirty-minute minimum before silence is called.
  const THRESHOLD_MS = 1_800_000;
  // One observed run per slot: every heartbeating tap has a run, so a live roster covers the
  // fleet and an instance page's identity block is never blank on a slot that reported.
  // `state_counts` still totals the RUN count (incarnations over the window, restarts
  // included); the rows are the slots' current runs.
  const instances = [...new Set(w.HOLDERS.map((h) => h.instance))].sort();
  const listed = instances.slice(0, Math.round(instances.length * scale));
  const all: RunRow[] = listed.map((instance, i) => {
    const silentAt = SILENT_INSTANCES.indexOf(instance);
    const reason: 'silent' | 'stopped' | 'ungraded' | null =
      silentAt >= 0
        ? 'silent'
        : STOPPED_INSTANCES.includes(instance)
          ? 'stopped'
          : UNGRADED_INSTANCES.includes(instance)
            ? 'ungraded'
            : null;
    // Silent runs went quiet at staggered depths, so the investigation table has a worst.
    const silentFor = THRESHOLD_MS + (silentAt + 1) * 2_400_000;
    return {
      incarnation: `${1_785_000_000_000 + i * 1000}-${4000 + i}`,
      instance,
      // The slot's current occupant: `instance` is a name the operator typed, the pod is who
      // fills it now. Null where the deployment relayed no pod identity, which reads as
      // unobserved rather than as a claim.
      pod: reason === 'ungraded' ? null : `vllm-${instance.slice(2)}-${(7 + i * 13) % 97}f${i % 10}`,
      state: reason === null ? 'active' : 'inactive',
      ...(reason === null ? {} : { reason }),
      ...(reason === 'silent' ? { silent_for_ms: silentFor } : {}),
      threshold_ms: reason === 'ungraded' ? null : THRESHOLD_MS,
      first_seen_ms: age.atMs - 86_400_000,
      last_seen_ms:
        age.atMs -
        (reason === null ? 20_000 + (i % 13) * 9_000 : reason === 'silent' ? silentFor : 900_000),
      stop_observed: reason === 'stopped',
      model: reason === 'ungraded' ? null : 'meta-llama/Llama-3.1-70B-Instruct',
      engine_version: 'vllm 0.9.1',
    };
  });
  return { counts, rows: all };
}

/**
 * `/v1/roster`: every observed run with its state and reason, judged against the platform threshold, paged.
 */
export function rosterFor(
  age: w.AgeScript,
  query: { limit?: number; cursor?: string } = {},
): RosterData {
  const { counts, rows: all } = runPopulation(age);
  const paged = paginate(all, age, query);
  if (paged.refused) {
    // `state_counts` and `producer_runs` go too: they are summaries OF the rows, and a summary
    // that outlives the read it summarises is the altitude lie the summary law forbids.
    return {
      page: paged.page,
      refused: paged.refusal,
      scope: {
        kind: 'lifecycle',
        margin_ms: 300_000,
        note: 'a run is an incarnation, so a rolling deploy reads as a departure and an arrival',
      },
      cannot_tell_you:
        'the roster is observed. A holder that never reported leaves no trace here, so this is not an inventory of what exists',
    };
  }
  return {
    producer_runs: Object.values(counts).reduce((a, b) => a + b, 0),
    // Totals to the RUN count, never the holder count.
    state_counts: counts,
    rows: paged.rows,
    page: paged.page,
    scope: {
      kind: 'lifecycle',
      margin_ms: 300_000,
      note: 'a run is an incarnation, so a rolling deploy reads as a departure and an arrival',
    },
    cannot_tell_you:
      'the roster is observed. A holder that never reported leaves no trace here, so this is not an inventory of what exists',
  };
}

/** `/v1/coverage`: the two coverage bases over the window, for the fleet or per instance. */
export function coverageFor(
  age: w.AgeScript,
  query: { window?: string; by?: 'fleet' | 'instance' } = {},
): CoverageData {
  requirePass(age);
  const days = windowDays(query.window, w.WINDOW_14D.days);
  const windowMs = days * 86_400_000;
  if (query.by === 'instance') {
    return {
      // Both bases per row, with the sums that make the token-weighted one
      // mergeable: merge days by Σwsum / Σtokens, never by averaging fractions. The corpus
      // scripts one engine with no classified mass, so the absent-fields state is reachable:
      // absence is "no mass to weight", never a zero.
      rows: w.COVERAGE_BY_SOURCE.map((s, i) => {
        const tokenMass = i === w.COVERAGE_BY_SOURCE.length - 1 ? null : 900_000 + i * 35_000;
        return {
          day: w.TODAY,
          instance: s.source,
          instances: 1,
          fraction: s.windowTime,
          covered_ms: Math.round(windowMs * s.windowTime),
          window_ms: windowMs,
          coverage_kind: INSTANCE_TIME,
          ...(tokenMass === null
            ? { token_weighted_fraction: null, token_wsum: null, token_mass: null }
            : {
                token_weighted_fraction: s.tokenWeighted,
                token_wsum: s.tokenWeighted * tokenMass,
                token_mass: tokenMass,
              }),
        };
      }),
    };
  }
  const masses = dayMasses(age).slice(w.TREND_DAYS - days);
  return {
    rows: masses.map((d) => ({
      day: d.date,
      instance: null,
      instances: w.POPULATIONS.instances,
      fraction: d.coverage,
      covered_ms: Math.round(86_400_000 * d.coverage),
      window_ms: 86_400_000,
      coverage_kind: INSTANCE_TIME,
    })),
  };
}

/**
 * The delivery ledger. **Ingest-fresh: it answers at every age**, including before the first
 * pass — a t0 install states an empty ledger with its fraction ABSENT, never 100%.
 *
 * The rows sum exactly to the fleet totals, because the wire computes totals from the rows and
 * a fixture whose totals float free would model a response the server cannot produce. Captured
 * anchors to the age's segment odometer so the strip and this ledger cannot disagree.
 */
export function deliveryFor(age: w.AgeScript): DeliveryData {
  const cannot =
    "segments past each tap's last word (arrived or declared) have left no trace yet; this ledger claims nothing about them";
  const zero = {
    segments_expected: 0,
    segments_captured: 0,
    segments_declared_dropped: 0,
    segments_missing_unexplained: 0,
    records_seen: 0,
    records_dropped_at_source: 0,
    records_oversized: 0,
  };
  if (age.segments === 0) {
    return {
      fleet: { ...zero, fraction: null, as_of_ms: null },
      rows: [],
      orphan_batches: 0,
      cannot_tell_you: cannot,
    };
  }

  // Ten narrated runs. Two carry the degraded states a reader must recognise: one tap that
  // confessed a drop range, one with a gap nobody declared. Steady state only — a young
  // ledger is clean because nothing has had time to go missing.
  const runs = 10;
  const degraded = age.key === 't3';
  const declared = degraded ? 9 : 0;
  const missing = degraded ? 5 : 0;
  const base = Math.floor(age.segments / runs);
  const rows = Array.from({ length: runs }, (_, i) => {
    const captured = base + (i === 0 ? age.segments - base * runs : 0);
    const decl = i === 3 ? declared : 0;
    const miss = i === 7 ? missing : 0;
    const seen = Math.floor(age.events / runs);
    return {
      incarnation: `${1_785_000_000_000 + i * 1000}-${4000 + i}`,
      instances: [`i-${String(((i * 7) % w.POPULATIONS.instances) + 1).padStart(3, '0')}`],
      first_seen_ms: age.atMs - 86_400_000,
      last_seen_ms: age.atMs - 20_000,
      segments_expected: captured + decl + miss,
      segments_captured: captured,
      segments_declared_dropped: decl,
      segments_missing_unexplained: miss,
      records_seen: seen,
      records_dropped_at_source: degraded && i === 3 ? 214 : 0,
      records_oversized: 0,
    };
  });
  const fleet = rows.reduce(
    (a, r) => ({
      segments_expected: a.segments_expected + r.segments_expected,
      segments_captured: a.segments_captured + r.segments_captured,
      segments_declared_dropped: a.segments_declared_dropped + r.segments_declared_dropped,
      segments_missing_unexplained:
        a.segments_missing_unexplained + r.segments_missing_unexplained,
      records_seen: a.records_seen + r.records_seen,
      records_dropped_at_source: a.records_dropped_at_source + r.records_dropped_at_source,
      records_oversized: a.records_oversized + r.records_oversized,
    }),
    zero,
  );
  return {
    fleet: {
      ...fleet,
      fraction: fleet.segments_captured / fleet.segments_expected,
      as_of_ms: age.atMs - 20_000,
    },
    rows,
    orphan_batches: 0,
    cannot_tell_you: cannot,
  };
}

/** The kick, accepted: the fixture models the deployment form, where a loop is attached. */
export function analyzeNowFor(): AnalyzeData {
  return {
    accepted: true,
    note: 'the loop will start an incremental analysis within a second; figures advance when it completes, through the same offer every completed pass makes',
  };
}

/**
 * The strip's hydration, and it answers at every age including t0.
 *
 * SSE carries deltas only, so a console loading before the first event has nothing to render the
 * dark band from. That is the t0 case this block exists for, and a delta-only design fails it
 * silently.
 */
export function healthFor(age: w.AgeScript): HealthData {
  const hasIngest = age.segments > 0;
  return {
    ingest: {
      batches_total: age.segments,
      events_since_install: age.events,
      last_segment: hasIngest ? `segment-${String(400 + age.segments).padStart(4, '0')}.jsonl` : null,
      last_segment_at_ms: hasIngest ? age.atMs - 240_000 : null,
      last_segment_records: hasIngest ? 186_224 : null,
      last_segment_span: hasIngest
        ? { domain: 'cache', start_ms: age.atMs - 480_000, end_ms: age.atMs - 300_000 }
        : null,
      // Absent rather than faked when the loop has published nothing.
      next_tick_at_ms: age.passes > 0 ? age.atMs + 240_000 : null,
      lag_ms: age.lagMs,
      unknown_kinds_total: 0,
      backlog_files: hasIngest ? 2 : 0,
      backlog_bytes: hasIngest ? 4_194_304 : 0,
      refusing: false,
    },
    // This deployment installs no public module; the core registers' standing is the stamp's.
    modules: [],
    coverage_by_instance:
      age.passes === 0
        ? []
        : w.COVERAGE_BY_SOURCE.map((s) => ({
            day: w.TODAY,
            instance: s.source,
            instances: 1,
            fraction: s.windowTime,
            covered_ms: Math.round(86_400_000 * s.windowTime),
            window_ms: 86_400_000,
            coverage_kind: INSTANCE_TIME,
          })),
    degradations:
      age.passes === 0
        ? []
        : [
            {
              class: 'coverage',
              degraded: 'two instances reported below half the window',
              scope: 'i-025 and i-080, over 8 days of the window',
              unaffected: 'every other instance, and every figure not keyed on those two',
              remedy: 'check the tap on both hosts; a disk-cap drop is declared in its own record',
              register: '>=',
              incidents: 2,
            },
          ],
    models: { observed: age.passes === 0 ? 0 : w.MODELS.observed, undeclared: age.passes === 0 ? w.POPULATIONS.instances : w.MODELS.unobserved },
    producer_runs: Object.values(runPopulation(age).counts).reduce((a, b) => a + b, 0),
    run_states: runPopulation(age).counts,
    agent_versions: ['infertap 0.2.0'],
  };
}

