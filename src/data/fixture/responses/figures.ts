// SPDX-License-Identifier: AGPL-3.0-only
/** `/v1/figures`: the classified mass per bucket, cut by the dims the request names. */
import * as w from '../world';
import type { FiguresData, Segment } from '../../../domain/contract';
import { incidentOverlap, incidentStrength } from '../thrash';
import {
  bucketsFor,
  dayMasses,
  hoursOf,
  minuteBounds,
  minutesOf,
  requirePass,
  resolveScope,
  sliceDay,
  storedShareOf,
  windowDays,
  windowJson,
} from './shared';
import type { DayMass } from './shared';

/** `/v1/figures`: the classified mass per bucket over the window, cut by the dims asked for. */
export function figuresFor(
  age: w.AgeScript,
  query: {
    window?: string;
    grain?: 'minute' | 'hour' | 'day';
    dims?: readonly string[];
    workload?: string;
    instance?: string;
    holder?: string;
  } = {},
): FiguresData {
  requirePass(age);
  const scope = resolveScope(query);
  const days = windowDays(query.window, w.WINDOW_14D.days);
  const from = w.frontierIndex(age) - days + 1;
  // A scoped read answers about one slice: recompute mass by the slice's recompute share,
  // the rest of stored mass by its stored share, so the slice carries its own rate.
  const rawMasses = dayMasses(age).filter((d) => d.dayIdx >= from && d.examined);
  const masses = rawMasses.map((d) =>
    scope.kind === 'fleet' ? d : sliceDay(d, scope.share, scope.storedShare),
  );
  const rawByIdx = new Map(rawMasses.map((d) => [d.dayIdx, d]));
  const dims = query.dims ?? [];
  const hourly = query.grain === 'hour';
  // The minute tier: the hour path one step finer, bounded to the window's own instants
  // rather than to whole days, so a `3h` ask answers 180 buckets and not a day of them.
  const minute = query.grain === 'minute';
  const bounds = minute ? minuteBounds(query.window) : null;
  const bucketsOf = (d: DayMass): DayMass[] => {
    if (minute) {
      return hoursOf(d)
        .flatMap(minutesOf)
        .filter((m) => {
          if (bounds === null) return true;
          const at = Date.parse(m.date);
          return at >= bounds.startMs && at < bounds.endMs;
        });
    }
    return hourly ? hoursOf(d) : [d];
  };
  // The entity dims: one bucket set per member, each sliced from the FLEET day with the
  // member's own two shares. A workload scope's nodes partition its slice by construction,
  // since a node carries one workload; scoped to one entity the dim enumerates just it. The
  // workload dim slices the same way one facet over.
  const sliceDim = dims.includes('instance')
    ? ('instance' as const)
    : dims.includes('workload')
      ? ('workload' as const)
      : null;
  const sliceKeys =
    sliceDim === null
      ? null
      : sliceDim === 'instance'
        ? scope.kind === 'instance'
          ? [scope.value ?? '']
          : scope.kind === 'workload'
            ? [...new Set(w.HOLDERS.filter((h) => h.workload === scope.value).map((h) => h.instance))]
            : [...new Set(w.HOLDERS.map((h) => h.instance))].sort()
        : scope.kind === 'workload'
          ? [scope.value ?? '']
          : [...new Set(w.HOLDERS.map((h) => h.workload))].sort();
  const sliceShares = (key: string): readonly [number, number] => {
    if (sliceDim === 'workload') {
      const holders = w.HOLDERS.filter((h) => h.workload === key);
      const instances = new Set(holders.map((h) => h.instance));
      return [
        holders.reduce((a, h) => a + h.tokens, 0) / w.WASTE_FULL,
        [...instances].reduce((a, i) => a + storedShareOf(i), 0),
      ];
    }
    return [
      w.HOLDERS.filter((h) => h.instance === key).reduce((a, h) => a + h.tokens, 0) /
        w.WASTE_FULL,
      storedShareOf(key),
    ];
  };
  // The scripted incident reaches the figures too: the same window, the same surge shape the
  // bands carry, so the rate chart spikes where the composition darkens. Recompute grows and
  // stored grows by exactly that delta, because recompute IS part of stored.
  const scopeStrength =
    scope.kind === 'instance' || scope.kind === 'holder'
      ? incidentStrength(scope.value ?? '')
      : 0;
  const surge = (b: DayMass, strength: number): DayMass => {
    if (strength === 0) return b;
    const bucketMs = minute ? 60_000 : hourly ? 3_600_000 : 86_400_000;
    const startMs = Date.parse(b.date.length > 10 ? b.date : `${b.date}T00:00:00Z`);
    const k = 1 + 2.4 * incidentOverlap(startMs, bucketMs) * strength;
    if (k === 1) return b;
    const etr = Math.round(b.etr * k);
    const postClear = Math.round(b.postClear * k);
    return { ...b, etr, postClear, stored: b.stored + (etr - b.etr) + (postClear - b.postClear) };
  };

  // One segment per meaning generation in the window. Never a blended series, and deliberately
  // no total spanning them: never-sum expressed as an absence.
  const segments: Segment[] = [];
  let run: DayMass[] = [];
  let key = '';

  const flush = () => {
    if (run.length === 0) return;
    const first = run[0] as DayMass;
    const last = run[run.length - 1] as DayMass;
    const meaning = w.meaningAt(first.dayIdx);
    const superseded = meaning.semantics_version !== w.SEMANTICS_CURRENT;
    segments.push({
      discriminator: meaning.discriminator,
      semantics_version: meaning.semantics_version,
      window: windowJson(first.date, last.date),
      // `None`, never an empty array, which would read as "looked and found nothing".
      figures: superseded
        ? null
        : run.flatMap((d) => {
            if (sliceKeys === null || sliceDim === null) {
              return bucketsOf(d)
                .map((b) => surge(b, scopeStrength))
                .flatMap((b) => bucketsFor(b, dims));
            }
            const raw = rawByIdx.get(d.dayIdx) ?? d;
            return sliceKeys.flatMap((key) => {
              const [rec, sto] = sliceShares(key);
              const sliced = sliceDay(raw, rec, sto);
              return bucketsOf(sliced)
                .map((b) =>
                  surge(b, sliceDim === 'instance' ? incidentStrength(key) : 0),
                )
                .flatMap((b) => bucketsFor(b, dims))
                .map((bucket) => ({
                  ...bucket,
                  dims: [...bucket.dims, { dim: sliceDim, value: key }],
                }));
            });
          }),
      ...(superseded
        ? {
            refused: {
              cause: 'superseded_semantics',
              message: `figures under ${meaning.semantics_version} are not re-derivable by this process, which runs ${w.SEMANTICS_CURRENT}`,
            },
          }
        : {}),
    });
    run = [];
  };

  for (const d of masses) {
    const m = w.meaningAt(d.dayIdx);
    const k = `${m.semantics_version}|${m.discriminator}`;
    if (k !== key) {
      flush();
      key = k;
    }
    run.push(d);
  }
  flush();

  return {
    register: 'recompute',
    never_summed_with: 'capacity',
    // The grain the response was SERVED at (server-chosen granularity, 2026-08-29): the tier
    // the ask named, since an explicit tier is honored verbatim or refused, never downgraded.
    grain: minute ? 'minute' : hourly ? 'hour' : 'day',
    segments,
  };
}

