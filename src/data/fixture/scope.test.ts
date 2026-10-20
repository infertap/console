// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { bandsFor, figuresFor, rosterFor } from './responses';
import { CLEARS, INCIDENT } from './thrash';
import { AGE_SCRIPT, DEPLOYS, HOLDERS, WASTE_FULL } from './world';

const T3 = AGE_SCRIPT.t3;

/**
 * Scope beside dims: scope says which slice to answer about, dims says how to
 * group inside it. These check the corpus keeps the wire's grammar: holder wins by being
 * narrower, a malformed holder is a 404, an unmatched value is looked-and-found-nothing, and
 * a scoped read costs one slice rather than a fleet regrouped.
 */

describe('scoped figures', () => {
  it('scale to the slice: a workload reads smaller than the fleet', () => {
    const fleet = figuresFor(T3, { window: '14d' });
    const scoped = figuresFor(T3, { window: '14d', workload: 'rag-batch' });
    const mass = (d: typeof fleet): number =>
      d.segments.flatMap((s) => s.figures ?? []).reduce((a, b) => a + b.tokens.value, 0);
    expect(mass(scoped)).toBeGreaterThan(0);
    expect(mass(scoped)).toBeLessThan(mass(fleet));
  });

  it('refuses a malformed holder spelling as the wire does: 404, unknown_holder', () => {
    expect(() => figuresFor(T3, { holder: 'not-a-triple' })).toThrow(/instance\/dp_rank\/group_idx/);
  });

  it('an instance or holder scope at minute grain answers 180 buckets and states the tier', () => {
    // The rank-grain minute cells: the 3 h stop under either scope, minute wide.
    for (const scope of [{ instance: 'i-003' }, { holder: 'i-003/0/0' }]) {
      const d = figuresFor(T3, { window: '3h', grain: 'minute', dims: ['class'], ...scope });
      expect(d.grain).toBe('minute');
      const buckets = new Set(d.segments.flatMap((s) => s.figures ?? []).map((b) => b.bucket));
      expect(buckets.size).toBe(180);
    }
  });

  it('the instance cut at minute grain serves every node on the same 180 buckets', () => {
    const d = figuresFor(T3, { window: '3h', grain: 'minute', dims: ['instance', 'class'] });
    const figures = d.segments.flatMap((s) => s.figures ?? []);
    expect(new Set(figures.map((b) => b.bucket)).size).toBe(180);
    const nodes = new Set(figures.map((b) => b.dims.find((x) => x.dim === 'instance')?.value));
    expect(nodes.size).toBe(new Set(HOLDERS.map((h) => h.instance)).size);
  });
});

describe('scoped bands', () => {
  it('an instance scope answers about one node, fleet-shaped', () => {
    const node = HOLDERS[0]?.instance ?? 'i-001';
    const d = bandsFor(T3, { window: '14d', grain: 'day', instance: node });
    expect(d.rows.length).toBeGreaterThan(0);
    expect(d.rows.every((r) => r.dims.length === 0)).toBe(true);
    const total = d.rows.reduce((a, r) => a + r.tokens.value, 0);
    const fleet = bandsFor(T3, { window: '14d', grain: 'day' });
    const fleetTotal = fleet.rows.reduce((a, r) => a + r.tokens.value, 0);
    expect(total).toBeLessThan(fleetTotal);
  });

  it('an instance scope with the holder dim serves the node\'s own ranks, whole', () => {
    const node = HOLDERS[0]?.instance ?? 'i-001';
    const expected = HOLDERS.filter((h) => h.instance === node).length;
    const d = bandsFor(T3, { window: '14d', grain: 'day', instance: node, dims: 'holder' });
    const members = new Set(d.rows.map((r) => r.dims.find((x) => x.dim === 'holder')?.value));
    expect(members.size).toBe(expected);
    expect([...members].every((m) => m?.startsWith(`${node}/`))).toBe(true);
    expect(d.population).toBe(expected);
    expect(d.holders_returned).toBe(expected);
  });

  it('the instance dim rolls the fleet into its nodes without reopening the triple', () => {
    const d = bandsFor(T3, { window: '14d', grain: 'day', dims: 'instance' });
    const members = new Set(d.rows.map((r) => r.dims.find((x) => x.dim === 'instance')?.value));
    expect(members.size).toBe(new Set(HOLDERS.map((h) => h.instance)).size);
    expect([...members].every((m) => m !== undefined && !m.includes('/'))).toBe(true);
  });

  it('a workload scope with the instance dim is the entity page\'s members read', () => {
    const d = bandsFor(T3, { window: '14d', grain: 'day', workload: 'rag-batch', dims: 'instance' });
    const members = new Set(d.rows.map((r) => r.dims.find((x) => x.dim === 'instance')?.value));
    const expected = new Set(HOLDERS.filter((h) => h.workload === 'rag-batch').map((h) => h.instance));
    expect(members.size).toBe(expected.size);
  });

  it('an unmatched scope value is looked-and-found-nothing, never a refusal', () => {
    const d = bandsFor(T3, { window: '14d', grain: 'day', workload: 'no-such-workload' });
    expect(d.rows).toEqual([]);
    expect(d.gap_unobserved.value).toBe(0);
  });

  it('the instance dim at minute grain serves from the rank cells: every node, 180 buckets', () => {
    const d = bandsFor(T3, { window: '3h', grain: 'minute', dims: 'instance' });
    expect(d.grain).toBe('minute');
    const members = new Set(d.rows.map((r) => r.dims.find((x) => x.dim === 'instance')?.value));
    expect(members.size).toBe(new Set(HOLDERS.map((h) => h.instance)).size);
    expect(new Set(d.rows.map((r) => r.bucket)).size).toBe(180);
  });

  it('an instance or holder scope at minute grain serves, and the holder dim under it refuses', () => {
    const node = bandsFor(T3, { window: '3h', grain: 'minute', instance: 'i-003', dims: 'class' });
    expect(node.grain).toBe('minute');
    expect(new Set(node.rows.map((r) => r.bucket)).size).toBe(180);
    const rank = bandsFor(T3, { window: '3h', grain: 'minute', holder: 'i-003/0/0' });
    expect(new Set(rank.rows.map((r) => r.bucket)).size).toBe(180);
    // The cells are kept per rank with cache groups rolled up: a holder cut has no minute table.
    expect(() =>
      bandsFor(T3, { window: '3h', grain: 'minute', instance: 'i-003', dims: 'holder' }),
    ).toThrow(/no minute table/);
  });
});

describe('a page must not disagree with itself', () => {
  const sum = (d: ReturnType<typeof bandsFor>): number =>
    d.rows.reduce((a, r) => a + r.tokens.value, 0);

  it('a scoped node is the sum of its ranks, to the token', () => {
    const node = sum(bandsFor(T3, { window: '14d', grain: 'day', instance: 'i-003' }));
    const ranks = sum(bandsFor(T3, { window: '14d', grain: 'day', instance: 'i-003', dims: 'holder' }));
    expect(node).toBe(ranks);
  });

  it('a scoped workload is the sum of its instances, to the token', () => {
    const wl = sum(bandsFor(T3, { window: '14d', grain: 'day', workload: 'rag-batch' }));
    const nodes = sum(
      bandsFor(T3, { window: '14d', grain: 'day', workload: 'rag-batch', dims: 'instance' }),
    );
    expect(wl).toBe(nodes);
  });
});

describe('per-node recompute rates', () => {
  const rateOf = (instance: string): number => {
    const d = figuresFor(T3, { window: '14d', dims: ['class'], instance });
    let recompute = 0;
    let total = 0;
    for (const seg of d.segments) {
      for (const b of seg.figures ?? []) {
        const cls = b.dims.find((x) => x.dim === 'class')?.value;
        total += b.tokens.value;
        if (cls === 'ETR' || cls === 'post_clear') recompute += b.tokens.value;
      }
    }
    return total > 0 ? recompute / total : 0;
  };

  it('vary across nodes: recompute concentrates, cache work spreads', () => {
    const rates = ['i-001', 'i-040', 'i-090'].map(rateOf);
    const spread = Math.max(...rates) / Math.max(Math.min(...rates), 1e-9);
    expect(spread).toBeGreaterThan(2);
  });

  it('the peers read serves every node with both halves of its rate', () => {
    const d = figuresFor(T3, { window: '14d', dims: ['instance', 'class'] });
    const byInstance = new Map<string, { recompute: number; total: number }>();
    for (const seg of d.segments) {
      for (const b of seg.figures ?? []) {
        const inst = b.dims.find((x) => x.dim === 'instance')?.value;
        const cls = b.dims.find((x) => x.dim === 'class')?.value;
        if (inst === undefined) continue;
        const cell = byInstance.get(inst) ?? { recompute: 0, total: 0 };
        cell.total += b.tokens.value;
        if (cls === 'ETR' || cls === 'post_clear') cell.recompute += b.tokens.value;
        byInstance.set(inst, cell);
      }
    }
    expect(byInstance.size).toBe(new Set(HOLDERS.map((h) => h.instance)).size);
    expect([...byInstance.values()].every((c) => c.total > c.recompute && c.recompute > 0)).toBe(
      true,
    );
  });
});

describe('the roster covers the fleet', () => {
  it('every slot the holders corpus knows has an observed run at steady state', () => {
    const roster = rosterFor(T3, { limit: 200 });
    const listed = new Set((roster.rows ?? []).map((r) => r.instance));
    for (const instance of new Set(HOLDERS.map((h) => h.instance))) {
      expect(listed.has(instance)).toBe(true);
    }
  });

  it('the inactive rows match the scripted run counts: 5 silent, 6 stopped, 1 ungraded', () => {
    const rows = rosterFor(T3, { limit: 200 }).rows ?? [];
    const by = (reason: string) => rows.filter((r) => r.reason === reason).length;
    expect(by('silent')).toBe(5);
    expect(by('stopped')).toBe(6);
    expect(by('ungraded')).toBe(1);
  });
});

describe('the scope shares', () => {
  it('the nodes partition the fleet: instance shares sum to one', () => {
    const byNode = new Map<string, number>();
    for (const h of HOLDERS) byNode.set(h.instance, (byNode.get(h.instance) ?? 0) + h.tokens);
    const sum = [...byNode.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(WASTE_FULL);
  });
});

describe('the class split on bands', () => {
  it('partitions the uncut read to the token, per bucket and band', () => {
    const uncut = bandsFor(T3, { window: '14d', grain: 'day', instance: 'i-003' });
    const byClass = bandsFor(T3, { window: '14d', grain: 'day', instance: 'i-003', dims: 'class' });
    const key = (r: { bucket: string; band: string }) => `${r.bucket}|${r.band}`;
    const summed = new Map<string, number>();
    for (const r of byClass.rows) summed.set(key(r), (summed.get(key(r)) ?? 0) + r.tokens.value);
    for (const r of uncut.rows) expect(summed.get(key(r))).toBe(r.tokens.value);
  });

  it('post_clear is episodic: near zero in quiet buckets, surging after a scripted clear', () => {
    const d = bandsFor(T3, { window: '48h', grain: 'hour', instance: 'i-003', dims: 'class' });
    const postShareAt = (predicate: (atMs: number) => boolean): number => {
      let post = 0;
      let all = 0;
      for (const r of d.rows) {
        if (!predicate(Date.parse(r.bucket))) continue;
        all += r.tokens.value;
        if (r.dims.some((x) => x.value === 'post_clear')) post += r.tokens.value;
      }
      return all > 0 ? post / all : 0;
    };
    const clearAt = CLEARS[0]?.atMs ?? 0;
    const during = postShareAt((at) => at >= clearAt && at < clearAt + 2 * 3_600_000);
    const quiet = postShareAt((at) => at < clearAt - 6 * 3_600_000);
    // The flush's rebuild dominates its own hours; the steady state barely registers.
    expect(during).toBeGreaterThan(0.4);
    expect(quiet).toBeLessThan(0.1);
    expect(during).toBeGreaterThan(quiet * 5);
  });

  it('one clear rides the engine rollout marker, so the burst has a dagger to blame', () => {
    expect(CLEARS.some((c) => DEPLOYS.some((dep) => dep.atMs === c.atMs))).toBe(true);
  });
});

describe('the two bases', () => {
  it('the event mix is never the uniform floor artifact, even at node-hour scale', () => {
    // The regression: an integer floor of one event per row once drowned every small cell,
    // so an instance's hourly event mix read 20/20/20/20/20 whatever the data said.
    const d = bandsFor(T3, { window: '48h', grain: 'hour', instance: 'i-005', dims: 'class' });
    const byBand = new Map<string, number>();
    let total = 0;
    for (const r of d.rows) {
      byBand.set(r.band, (byBand.get(r.band) ?? 0) + r.events);
      total += r.events;
    }
    const shares = [...byBand.values()].map((v) => v / total);
    expect(Math.max(...shares) - Math.min(...shares)).toBeGreaterThan(0.1);
  });


  it('disagree on the mix, because tokens per event vary by band', () => {
    const d = bandsFor(T3, { window: '14d', grain: 'day', instance: 'i-003' });
    const share = (basis: 'tokens' | 'events'): number => {
      const total = d.rows.reduce(
        (a, r) => a + (basis === 'tokens' ? r.tokens.value : r.events),
        0,
      );
      const short = d.rows
        .filter((r) => ['<10s', '10s-1m', '1-10m'].includes(r.band))
        .reduce((a, r) => a + (basis === 'tokens' ? r.tokens.value : r.events), 0);
      return short / total;
    };
    // The whales sit in the short bands, so the token mix reads shorter than the event mix.
    expect(share('tokens')).toBeGreaterThan(share('events'));
  });
});

describe('the scripted incident', () => {
  const hourTotals = (d: ReturnType<typeof bandsFor>): Map<string, number> => {
    const out = new Map<string, number>();
    for (const r of d.rows) out.set(r.bucket, (out.get(r.bucket) ?? 0) + r.tokens.value);
    return out;
  };

  it('the node surges and lurches short during its window, and only then', () => {
    const d = bandsFor(T3, { window: '48h', grain: 'hour', instance: INCIDENT.instance });
    const totals = hourTotals(d);
    const inside = [...totals.entries()].filter(([k]) => {
      const at = Date.parse(k);
      return at >= INCIDENT.startMs && at < INCIDENT.endMs;
    });
    const outside = [...totals.entries()].filter(([k]) => {
      const at = Date.parse(k);
      return at < INCIDENT.startMs - 3_600_000 || at >= INCIDENT.endMs + 3_600_000;
    });
    const mean = (xs: [string, number][]) => xs.reduce((a, [, v]) => a + v, 0) / xs.length;
    expect(inside.length).toBeGreaterThan(3);
    expect(mean(inside)).toBeGreaterThan(mean(outside) * 2);
  });

  it('rank 0 carries it while its peers ripple', () => {
    const d = bandsFor(T3, {
      window: '48h',
      grain: 'hour',
      instance: INCIDENT.instance,
      dims: 'holder',
    });
    const insideBy = (rank: string): number =>
      d.rows
        .filter(
          (r) =>
            r.dims.some((x) => x.value === rank) &&
            Date.parse(r.bucket) >= INCIDENT.startMs &&
            Date.parse(r.bucket) < INCIDENT.endMs,
        )
        .reduce((a, r) => a + r.tokens.value, 0);
    const others = HOLDERS.filter(
      (h) => h.instance === INCIDENT.instance && `${h.instance}/${h.dp_rank}/${h.group_idx}` !== INCIDENT.rank,
    ).map((h) => `${h.instance}/${h.dp_rank}/${h.group_idx}`);
    const worstOther = Math.max(...others.map(insideBy));
    expect(insideBy(INCIDENT.rank)).toBeGreaterThan(worstOther * 3);
  });

  it('reaches the rate: the node recomputes a larger share of its work that day', () => {
    const rateOn = (instance: string): number => {
      const d = figuresFor(T3, { window: '2d', grain: 'hour', dims: ['class'], instance });
      const inside = { r: 0, t: 0 };
      const outside = { r: 0, t: 0 };
      for (const seg of d.segments) {
        for (const b of seg.figures ?? []) {
          const at = Date.parse(b.bucket.length > 10 ? b.bucket : `${b.bucket}T00:00:00Z`);
          const cls = b.dims.find((x) => x.dim === 'class')?.value;
          const cell =
            at >= INCIDENT.startMs && at < INCIDENT.endMs ? inside : outside;
          cell.t += b.tokens.value;
          if (cls === 'ETR' || cls === 'post_clear') cell.r += b.tokens.value;
        }
      }
      return inside.t > 0 && outside.t > 0 ? inside.r / inside.t / (outside.r / outside.t) : 1;
    };
    // The incident node's rate spikes against its own baseline; a quiet node's does not.
    expect(rateOn(INCIDENT.instance)).toBeGreaterThan(2);
    expect(rateOn('i-090')).toBeLessThan(1.5);
  });
});
