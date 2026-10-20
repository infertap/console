// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  EDGE_MS,
  instanceDuplicationResponse,
  replicationInvariants,
  replicationResponse,
} from './replication';

describe('the replication corpus is internally consistent', () => {
  for (const invariant of replicationInvariants()) {
    it(invariant.name, () => {
      expect(invariant.holds).toBe(true);
    });
  }
});

describe('the replication read', () => {
  it('is deterministic: the same ask renders the same bytes', () => {
    const a = replicationResponse({ window: '48h', workload: 'rag-batch' });
    const b = replicationResponse({ window: '48h', workload: 'rag-batch' });
    expect(a.rows).toEqual(b.rows);
  });

  it('echoes the window it served, and a custom range states its derivation', () => {
    const preset = replicationResponse({ window: '48h' });
    expect(preset.grain).toBe('hour');
    expect(preset.derived).toBeUndefined();
    // A five-hour span is past the minute point budget (240), so auto ladders to hour; a
    // three-hour span inside the minute reach answers at minute grain. Both state why.
    const from = Date.parse('2026-08-03T09:00:00Z');
    const to = Date.parse('2026-08-03T14:00:00Z');
    const custom = replicationResponse({ window: `${from},${to}` });
    expect(custom.grain).toBe('hour');
    expect(custom.derived).toBe('range × retention');
    const short = replicationResponse({ window: `${to - 3 * 3_600_000},${to}` });
    expect(short.grain).toBe('minute');
    expect(short.bucket_ms).toBe(60_000);
    // An explicit tier is honored verbatim, whatever the ladder would have chosen.
    const explicit = replicationResponse({ window: `${from},${to}`, grain: 'day' });
    expect(explicit.grain).toBe('day');
    expect(explicit.rows.length).toBe(1);
  });

  it('the window total is the sum of its own rows', () => {
    const d = replicationResponse({ window: '14d' });
    const sum = d.rows.reduce((a, r) => a + r.k2 + r.k34 + r.k58 + r.k9, 0);
    expect(d.window_dup_token_ms).toBeCloseTo(sum, 3);
  });

  it('echoes the cut, and an unknown workload falls back to the fleet', () => {
    expect(replicationResponse({ workload: 'rag-batch' }).workload).toBe('rag-batch');
    expect(replicationResponse({}).workload).toBeUndefined();
    expect(replicationResponse({ workload: 'no-such' }).workload).toBeUndefined();
  });
});

describe('one node\'s internal duplication', () => {
  it('totals are the sum of their own rows, split by locality', () => {
    const d = instanceDuplicationResponse('i-005', { window: '2d' });
    const within = d.rows.filter((r) => r.locality === 'within').reduce((a, r) => a + r.token_ms, 0);
    const group = d.rows.filter((r) => r.locality === 'group').reduce((a, r) => a + r.token_ms, 0);
    expect(d.within_ranks_token_ms).toBeCloseTo(within, 3);
    expect(d.cache_groups_token_ms).toBeCloseTo(group, 3);
    expect(d.copies_token_ms).toBeGreaterThan(within + group);
  });

  it('cache-group mass exists on the hybrid minority and is a measured zero elsewhere', () => {
    expect(instanceDuplicationResponse('i-005', { window: '2d' }).cache_groups_token_ms).toBeGreaterThan(0);
    expect(instanceDuplicationResponse('i-004', { window: '2d' }).cache_groups_token_ms).toBe(0);
  });

  it('band 1 never appears, and localities never say cross', () => {
    const d = instanceDuplicationResponse('i-005', { window: '2d' });
    expect(d.rows.some((r) => r.copies_band === '1')).toBe(false);
    expect(d.rows.every((r) => r.locality === 'within' || r.locality === 'group')).toBe(true);
    expect(d.cannot_tell_you).toMatch(/SPANNING engines/);
  });

  it('speaks the analyzer\'s band vocabulary, every band on both localities of a hybrid node', () => {
    // The emitted spellings (`analyzer_analysis::residual`), so the panel's fold from the
    // wire's bands onto its four is exercised on the strings the wire sends.
    const d = instanceDuplicationResponse('i-005', { window: '2d' });
    const wire = ['2', '3', '4', '5-8', '9-16', '17+'];
    expect(d.rows.every((r) => wire.includes(r.copies_band))).toBe(true);
    for (const locality of ['within', 'group']) {
      const bands = new Set(d.rows.filter((r) => r.locality === locality).map((r) => r.copies_band));
      expect([...bands].sort()).toEqual([...wire].sort());
    }
  });

  it('an unseen instance returns empty rows: a measured zero, not a refusal', () => {
    const d = instanceDuplicationResponse('i-999', {});
    expect(d.rows).toEqual([]);
    expect(d.within_ranks_token_ms).toBe(0);
  });

  it('never claims more duplicated time than the node held at all', () => {
    for (const inst of ['i-005', 'i-004', 'i-001']) {
      const d = instanceDuplicationResponse(inst, { window: '2d' });
      expect(d.held_token_ms).toBeGreaterThan(0);
      expect(d.within_ranks_token_ms + d.cache_groups_token_ms).toBeLessThan(d.held_token_ms);
    }
  });

  it('serves the grain the ask resolves, and states it: minute-wide rows at the 3 h stop, hour rows otherwise', () => {
    const bucketsOf = (rows: readonly { bucket_ms: number }[]): number[] =>
      [...new Set(rows.map((r) => r.bucket_ms))].sort((a, b) => a - b);
    const spaced = (buckets: readonly number[], width: number): boolean =>
      buckets.every((b, i) => i === 0 || b - (buckets[i - 1] ?? 0) === width);

    // The 3 h stop, bounded the way the figures read bounds its minute path: 180 whole
    // minutes ending at the edge.
    const minute = instanceDuplicationResponse('i-005', { window: '3h', grain: 'minute' });
    expect(minute.grain).toBe('minute');
    expect(minute.bucket_ms).toBe(60_000);
    const minutes = bucketsOf(minute.rows);
    expect(minutes.length).toBe(180);
    expect(spaced(minutes, 60_000)).toBe(true);
    expect(minutes[0]).toBe(EDGE_MS - 3 * 3_600_000);
    expect(minute.end_ms).toBe(EDGE_MS);
    // Absent, the ask ladders by span the way the copies read does.
    expect(instanceDuplicationResponse('i-005', { window: '3h' }).grain).toBe('minute');

    const hour = instanceDuplicationResponse('i-005', { window: '2d' });
    expect(hour.grain).toBe('hour');
    expect(hour.bucket_ms).toBe(3_600_000);
    const hours = bucketsOf(hour.rows);
    expect(hours.length).toBe(48);
    expect(spaced(hours, 3_600_000)).toBe(true);

    // A day ask reads the hourly cut and says so; an explicit hour at 3 h is three hour rows.
    expect(instanceDuplicationResponse('i-005', { window: '14d', grain: 'day' }).grain).toBe('hour');
    const explicit = instanceDuplicationResponse('i-005', { window: '3h', grain: 'hour' });
    expect(explicit.grain).toBe('hour');
    expect(bucketsOf(explicit.rows).length).toBe(3);
  });

  it('the minute rows summed to the hour equal the hour rows, the law the analyzer pins', () => {
    // `instance_tiers_agree` upstream: the producer writes both cuts from one attribution, so
    // the two grains cannot disagree. The corpus holds the same law, band by band and
    // locality by locality, and on every total the document carries.
    const HOUR = 3_600_000;
    const close = (a: number, b: number): void => {
      expect(Math.abs(a - b) / Math.max(Math.abs(b), 1)).toBeLessThan(1e-9);
    };
    for (const instance of ['i-005', 'i-004']) {
      const minute = instanceDuplicationResponse(instance, { window: '3h', grain: 'minute' });
      const hour = instanceDuplicationResponse(instance, { window: '3h', grain: 'hour' });
      const folded = new Map<string, number>();
      for (const r of minute.rows) {
        const key = `${Math.floor(r.bucket_ms / HOUR) * HOUR}|${r.copies_band}|${r.locality}`;
        folded.set(key, (folded.get(key) ?? 0) + r.token_ms);
      }
      expect(hour.rows.length).toBe(folded.size);
      for (const r of hour.rows) {
        const summed = folded.get(`${r.bucket_ms}|${r.copies_band}|${r.locality}`);
        expect(summed).toBeDefined();
        close(summed ?? 0, r.token_ms);
      }
      close(minute.within_ranks_token_ms, hour.within_ranks_token_ms);
      close(minute.cache_groups_token_ms, hour.cache_groups_token_ms);
      close(minute.copies_token_ms, hour.copies_token_ms);
      close(minute.held_token_ms, hour.held_token_ms);
    }
  });
});
