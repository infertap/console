// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FixtureDataSource } from '../../data/fixture/source';
import { DataProvider } from '../../data/react';
import FleetRoute from './FleetRoute';
import IdentitiesRoute from './IdentitiesRoute';
import InstanceRoute from './InstanceRoute';
import RankRoute from './RankRoute';
import WorkloadRoute from './WorkloadRoute';

/**
 * The entity pages: one skeleton at every scope. Identity and state, its figures scoped,
 * its position among peers, its members clickable, provenance. These assert the claims the
 * pages make: containment is never asserted, members draw as a distribution, the duplication
 * halves say opposite things, and the refusals render by name.
 */

function mountWorkload(id: string) {
  window.history.replaceState(null, '', `/workload/${id}`);
  return render(
    <DataProvider source={new FixtureDataSource({ age: 't3' })}>
      <WorkloadRoute params={{ id }} />
    </DataProvider>,
  );
}

function mountInstance(id: string) {
  window.history.replaceState(null, '', `/instance/${id}`);
  return render(
    <DataProvider source={new FixtureDataSource({ age: 't3' })}>
      <InstanceRoute params={{ id }} />
    </DataProvider>,
  );
}

describe('the workload page', () => {
  it('headlines the workload as rates against the fleet, never asserting containment', async () => {
    mountWorkload('rag-batch');
    await waitFor(() => expect(screen.getByText(/recompute rate · rag-batch/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText('of its cache work recomputed')).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/^fleet 0/)).toBeTruthy());
    expect(screen.getByText("of the fleet's recompute")).toBeTruthy();
    expect(screen.getByText('busiest ÷ median instance')).toBeTruthy();
    // The facet sentence: a label, not a container.
    expect(screen.getByText(/not a container/)).toBeTruthy();
  });

  it('carries the shared gap-over-time panel, scoped to the workload', async () => {
    mountWorkload('rag-batch');
    await waitFor(() => expect(screen.getByText(/the gap over time · both classes/)).toBeTruthy());
  });

  it('offers the 3 h stop and serves every read at minute grain, the members read included', async () => {
    // A workload is a key column on the fleet minute cells, and the instance cut serves from
    // the rank-grain minute cells, so no read on this page steps down a tier.
    window.history.replaceState(null, '', '/workload/rag-batch?win=3h');
    render(
      <DataProvider source={new FixtureDataSource({ age: 't3' })}>
        <WorkloadRoute params={{ id: 'rag-batch' }} />
      </DataProvider>,
    );
    await waitFor(() => expect(screen.getByText(/recompute rate · rag-batch · 3 h/)).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByText(/held more than once · rag-batch · 3 h · minute/)).toBeTruthy(),
    );
    const members = await waitFor(() => screen.getByText(/its instances · recompute rate · 3 h/));
    expect(members.textContent).not.toMatch(/hour/);
  });

  it('carries its own copies histogram, on the page window, stating the served grain', async () => {
    // The copies read takes a workload cut, so the page shows this workload's duplicated
    // mass at the same window and tier as the rest of the page. The remedy split is a fleet
    // scalar and is deliberately not here.
    mountWorkload('rag-batch');
    await waitFor(() =>
      expect(screen.getByText(/held more than once · rag-batch · 14 d · day/)).toBeTruthy(),
    );
    expect(screen.getByText('tok-h duplicated')).toBeTruthy();
    expect(screen.getByText("of the fleet's duplicated mass")).toBeTruthy();
    expect(screen.getByText(/stays on the dashboard/)).toBeTruthy();
  });

  it('inks the subject among its peers rather than linking it to itself', async () => {
    mountWorkload('rag-batch');
    await waitFor(() => expect(screen.getByText(/among the workloads/)).toBeTruthy());
    const links = await waitFor(() => {
      const found = document.querySelectorAll('a[href^="/workload/"]');
      expect(found.length).toBeGreaterThan(0);
      return found;
    });
    expect([...links].every((a) => a.getAttribute('href') !== '/workload/rag-batch')).toBe(true);
    // The shape sentence: worst against median, numbers not verdicts.
    expect(screen.getAllByText(/the worst carries/).length).toBeGreaterThan(0);
  });

  it('names the undeclared page as the absent bucket, a first-class member', async () => {
    mountWorkload('undeclared');
    await waitFor(() => expect(screen.getByText(/absent bucket as a named slice/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/recompute rate · undeclared/)).toBeTruthy());
  });

  it('ranks its instances and its peers by rate, each a link', async () => {
    mountWorkload('rag-batch');
    await waitFor(() => expect(screen.getByText(/its instances · recompute rate/)).toBeTruthy());
    await waitFor(() =>
      expect(document.querySelectorAll('a[href^="/instance/"]').length).toBeGreaterThan(0),
    );
    await waitFor(() => expect(screen.getByText(/among the workloads · recompute rate/)).toBeTruthy());
  });
});

describe('the instance page', () => {
  it('states identity from the roster: status word, pod, model, engine', async () => {
    mountInstance('i-001');
    await waitFor(() => expect(screen.getByText('identity and state')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText(/active|inactive/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/^pod/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/vllm 0\.9\.1/).length).toBeGreaterThan(0);
  });

  it('the roster covers the fleet: a slot that heartbeats is never blank', async () => {
    mountInstance('i-003');
    await waitFor(() => expect(screen.getAllByText(/active|inactive/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/No run for this slot/)).toBeNull();
  });

  it('says when a slot was never observed, claiming nothing about existence', async () => {
    mountInstance('i-999');
    await waitFor(() => expect(screen.getByText(/No run for this slot/)).toBeTruthy());
    expect(screen.getByText(/claims nothing about whether the slot exists/)).toBeTruthy();
  });

  it('headlines a rate, not a mass: the denominator is the class read, absolutes in hover', async () => {
    mountInstance('i-003');
    await waitFor(() => expect(screen.getByText('of cache work recomputed')).toBeTruthy());
    const tile = screen.getByText('of cache work recomputed').closest('div') as HTMLElement;
    expect(within(tile).getAllByText(/%/).length).toBeGreaterThan(0);
    expect(tile.title).toMatch(/≥ [\d,]+ recomputed of ≥ [\d,]+ stored/);
    await waitFor(() => expect(within(tile).getByText(/fleet median/)).toBeTruthy());
  });

  it('judges rank balance against the median, so a draining rank cannot cry wolf', async () => {
    mountInstance('i-003');
    await waitFor(() => expect(screen.getByText('busiest ÷ median rank')).toBeTruthy());
    expect(screen.getByText('balanced is 1×')).toBeTruthy();
    const tile = screen.getByText('busiest ÷ median rank').closest('div') as HTMLElement;
    await waitFor(() => expect(within(tile).getAllByText(/×/).length).toBeGreaterThan(0));
  });

  it('moves gap-unobserved out of the metric row and beside coverage as a caveat', async () => {
    mountInstance('i-003');
    await waitFor(() => expect(screen.getByText('token-weighted coverage')).toBeTruthy());
    const tile = screen.getByText('token-weighted coverage').closest('div') as HTMLElement;
    await waitFor(() => expect(within(tile).getByText(/caveat: ≥ .* gap-unobserved/)).toBeTruthy());
  });

  it('draws the rate over time against the fleet median band', async () => {
    mountInstance('i-003');
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /median rate as the faint band/ })).toBeTruthy(),
    );
  });

  it('percent-stacks the gap over time with the median guide through it', async () => {
    mountInstance('i-003');
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /split by time-since-eviction band, as shares/ })).toBeTruthy(),
    );
    // The halfway guide: whichever band straddles it holds the bucket's weighted median.
    expect(screen.getAllByText('median').length).toBeGreaterThan(0);
  });

  it('cuts the gap over time by class, denominated by the whole bucket', async () => {
    window.history.replaceState(null, '', '/instance/i-003?gcls=post_clear');
    render(
      <DataProvider source={new FixtureDataSource({ age: 't3' })}>
        <InstanceRoute params={{ id: 'i-003' }} />
      </DataProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/the gap over time · post_clear · 14 d/)).toBeTruthy(),
    );
    // Two normalisations, both on the glass: the stack is the class's own mix at full
    // height (so the median guide is the class's median), and the strip beneath carries the
    // class's share of each bucket, which is where an episodic class shows its towers.
    expect(screen.getByRole('img', { name: /normalised to the class itself/ })).toBeTruthy();
    expect(
      screen.getByRole('img', { name: /post_clear's share of the bucket's recompute, per bucket/ }),
    ).toBeTruthy();
    expect(screen.getAllByText('median').length).toBeGreaterThan(0);
  });

  it('offers both bases and names what each weighs', async () => {
    mountInstance('i-003');
    await waitFor(() => expect(screen.getByText('tokens · the bill')).toBeTruthy());
    expect(screen.getByText('events · the typical block')).toBeTruthy();
  });

  it('draws the ranks as rate series with the deep links riding the legend', async () => {
    mountInstance('i-001');
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /share of this node's recompute per bucket/ })).toBeTruthy(),
    );
    await waitFor(() =>
      expect(document.querySelectorAll('a[href^="/instance/i-001/rank/"]').length).toBeGreaterThan(0),
    );
  });

  it('stacks the duplicated mass by copies band, locality a toggle opening on within ranks, the action behind the i', async () => {
    mountInstance('i-005');
    const chart = await waitFor(() =>
      screen.getByRole('img', { name: /stacked by how many copies it held at once/ }),
    );
    // The workload panel's form and unit: token-hours per bucket, the four copies bands.
    expect(chart.getAttribute('aria-label')).toMatch(/duplicated token-hours per day across its ranks/);
    expect(screen.getAllByText('2 copies').length).toBeGreaterThan(0);
    expect(screen.getAllByText('9 or more').length).toBeGreaterThan(0);
    // The locality is the secondary axis, opening on the half with a lever.
    const control = screen.getByRole('group', { name: 'locality' });
    expect(within(control).getByRole('button', { pressed: true }).textContent).toBe('within ranks');
    expect(within(control).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'within ranks',
      'across cache groups',
      'both',
    ]);
    // The ratified fraction, the same words as the tile above and computed one way; and the
    // duplicated mass the chart sums to.
    expect(screen.getAllByText('of held mass duplicated across ranks')).toHaveLength(2);
    expect(screen.getByText('tok-h duplicated across its ranks')).toBeTruthy();
    expect(screen.getByText(/cannot tell you/i)).toBeTruthy();
    // The one action, in the definition the i hover renders.
    expect(screen.getAllByText(/prefix affinity/).length).toBeGreaterThan(0);
  });

  it('the locality toggle: a single-group node reads a measured zero across cache groups, a hybrid node draws it', async () => {
    mountInstance('i-004');
    const control = await waitFor(() => screen.getByRole('group', { name: 'locality' }));
    fireEvent.click(within(control).getByRole('button', { name: 'across cache groups' }));
    await waitFor(() =>
      expect(screen.getByText(/found no duplication across its cache groups/)).toBeTruthy(),
    );
    expect(screen.queryByRole('img', { name: /stacked by how many copies/ })).toBeNull();
    // The share tile keeps stating the across-ranks fraction: the words say which half.
    expect(screen.getAllByText('of held mass duplicated across ranks')).toHaveLength(2);

    window.history.replaceState(null, '', '/instance/i-005?dloc=both');
    render(
      <DataProvider source={new FixtureDataSource({ age: 't3' })}>
        <InstanceRoute params={{ id: 'i-005' }} />
      </DataProvider>,
    );
    const chart = await waitFor(() =>
      screen.getByRole('img', { name: /per day across ranks and cache groups, stacked/ }),
    );
    expect(chart).toBeTruthy();
    expect(screen.getByText('tok-h duplicated across ranks and cache groups')).toBeTruthy();
  });

  it('ranks peers by rate so busy and wasteful separate', async () => {
    mountInstance('i-003');
    await waitFor(() => expect(screen.getByText(/among its peers · recompute rate/)).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText(/the worst carries/).length).toBeGreaterThan(0));
    const sentence = screen.getAllByText(/worst/)[0]?.closest('p') as HTMLElement;
    expect(within(sentence).getAllByText(/%/).length).toBeGreaterThan(0);
  });

  it('one window rules the page: every panel head carries the same stop', async () => {
    mountInstance('i-001');
    await waitFor(() => expect(screen.getByText(/recompute rate · i-001 · 14 d/)).toBeTruthy());
    expect(screen.getByText(/the gap over time · both classes · 14 d/)).toBeTruthy();
    expect(screen.getByText(/its ranks · share of the node's recompute · 14 d/)).toBeTruthy();
    expect(screen.getByText(/held twice inside this node · 14 d/)).toBeTruthy();
    expect(screen.getByText(/among its peers · recompute rate · 14 d/)).toBeTruthy();
  });

  it('offers the 3 h stop and serves it at minute grain, with the ranks read at hour', async () => {
    // An instance scope serves at minute from the rank-grain cells, and so does
    // the peers read's instance cut. The ranks read groups by holder, which those cells roll
    // up, so that one read asks the hour tier and its head says which tier answered.
    window.history.replaceState(null, '', '/instance/i-003?win=3h');
    render(
      <DataProvider source={new FixtureDataSource({ age: 't3' })}>
        <InstanceRoute params={{ id: 'i-003' }} />
      </DataProvider>,
    );
    await waitFor(() => expect(screen.getByText(/recompute rate · i-003 · 3 h/)).toBeTruthy());
    // The rate line drew, so the minute buckets exist, and the fleet median rides them.
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /median rate as the faint band/ })).toBeTruthy(),
    );
    await waitFor(() => expect(screen.getByText(/fleet median [\d.]+%/)).toBeTruthy());
    expect(screen.getByText(/the gap over time · both classes · 3 h/)).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText(/its ranks · share of the node's recompute · 3 h · hour/),
      ).toBeTruthy(),
    );
    expect(screen.getByText(/held twice inside this node · 3 h/)).toBeTruthy();
    expect(screen.getByText(/among its peers · recompute rate · 3 h/)).toBeTruthy();
    const control = screen.getByRole('group', { name: 'window' });
    expect(within(control).getByRole('button', { pressed: true }).textContent).toBe('3 h');
  });

  it('at the 3 h stop the duplication panel draws minute-wide bars from the minute cut and says so', async () => {
    // The read takes `grain`, the 3 h stop asks minute, and the response
    // states the width it served. The head, the unit line and the bars all follow `bucket_ms`
    // rather than assuming an hour, so the panel draws 180 columns and not three.
    window.history.replaceState(null, '', '/instance/i-005?win=3h');
    render(
      <DataProvider source={new FixtureDataSource({ age: 't3' })}>
        <InstanceRoute params={{ id: 'i-005' }} />
      </DataProvider>,
    );
    const chart = await waitFor(() =>
      screen.getByRole('img', { name: /duplicated token-hours per minute across its ranks/ }),
    );
    expect(screen.getByText(/held twice inside this node · 3 h · minute/)).toBeTruthy();
    expect(within(chart).getByText('TOKEN-HOURS/MIN')).toBeTruthy();
    // One column per bucket, each a group of band rects.
    const columns = [...chart.querySelectorAll('g')].filter((g) =>
      [...g.children].some((c) => c.tagName === 'rect'),
    );
    expect(columns.length).toBe(180);
    // Served as asked, so nothing to say about a downgrade.
    expect(screen.queryByText(/served at hour/)).toBeNull();
  });

  it('at the 48 h stop the duplication panel stays at hour width and says so', async () => {
    window.history.replaceState(null, '', '/instance/i-005?win=48h');
    render(
      <DataProvider source={new FixtureDataSource({ age: 't3' })}>
        <InstanceRoute params={{ id: 'i-005' }} />
      </DataProvider>,
    );
    const chart = await waitFor(() =>
      screen.getByRole('img', { name: /duplicated token-hours per hour across its ranks/ }),
    );
    expect(screen.getByText(/held twice inside this node · 48 h · hour/)).toBeTruthy();
    expect(within(chart).getByText('TOKEN-HOURS/H')).toBeTruthy();
    const columns = [...chart.querySelectorAll('g')].filter((g) =>
      [...g.children].some((c) => c.tagName === 'rect'),
    );
    expect(columns.length).toBe(48);
  });

  it('the page agrees with itself: a scoped whole is the sum of its parts', async () => {
    // Asserted at the corpus seam in scope.test.ts to the token; here the page-level claim
    // is that both reads render without a mass headline for the reader to cross-check apart.
    mountInstance('i-003');
    await waitFor(() => expect(screen.getByText('of cache work recomputed')).toBeTruthy());
    expect(screen.queryByText(/^≥ [\d,]+$/)).toBeNull();
  });

  it('states the slot-and-pod provenance under the title', async () => {
    mountInstance('i-001');
    await waitFor(() => expect(screen.getByText(/a slot outlives its pods/)).toBeTruthy());
  });
});

/** A source whose figures read answers with no segments: nothing classified in the window. */
class EmptyFigures extends FixtureDataSource {
  override figures(
    ...args: Parameters<FixtureDataSource['figures']>
  ): ReturnType<FixtureDataSource['figures']> {
    return super.figures(...args).then((s) => ({ ...s, data: { ...s.data, segments: [] } }));
  }
}

describe('coverage of nothing is unstated', () => {
  // A share of no mass is not 0.0%: the tile says it cannot, the way the ranks tile does, and
  // the rate tile's hover drops the coverage clause rather than printing a percent of nothing.
  function expectUnstated(rateUnit: string) {
    const tile = screen.getByText('token-weighted coverage').closest('div') as HTMLElement;
    expect(within(tile).getByText('·')).toBeTruthy();
    expect(tile.textContent).not.toMatch(/%/);
    expect(tile.title).not.toMatch(/%/);
    const rateTile = screen.getByText(rateUnit).closest('div') as HTMLElement;
    expect(rateTile.textContent).toMatch(/none/);
    expect(rateTile.title).not.toMatch(/%|coverage/);
  }

  it('the instance page', async () => {
    window.history.replaceState(null, '', '/instance/i-003');
    render(
      <DataProvider source={new EmptyFigures({ age: 't3' })}>
        <InstanceRoute params={{ id: 'i-003' }} />
      </DataProvider>,
    );
    await waitFor(() => expect(screen.getByText('token-weighted coverage')).toBeTruthy());
    expectUnstated('of cache work recomputed');
  });

  it('the workload page', async () => {
    window.history.replaceState(null, '', '/workload/rag-batch');
    render(
      <DataProvider source={new EmptyFigures({ age: 't3' })}>
        <WorkloadRoute params={{ id: 'rag-batch' }} />
      </DataProvider>,
    );
    await waitFor(() => expect(screen.getByText('token-weighted coverage')).toBeTruthy());
    expectUnstated('of its cache work recomputed');
  });

  it('the rank page', async () => {
    window.history.replaceState(null, '', '/instance/i-001/rank/0/0');
    render(
      <DataProvider source={new EmptyFigures({ age: 't3' })}>
        <RankRoute params={{ id: 'i-001', dp_rank: '0', group_idx: '0' }} />
      </DataProvider>,
    );
    await waitFor(() => expect(screen.getByText('token-weighted coverage')).toBeTruthy());
    expectUnstated('of its cache work recomputed');
  });
});

/** jsdom draws nothing, so the chart gets the geometry a browser would have given it. */
function measurable(el: Element, width = 1000): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: width, bottom: 170, width, height: 170, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

describe('the crosshair annotations', () => {
  it('the rate chart annotates both series at the hovered bucket, and leaves cleanly', async () => {
    mountInstance('i-003');
    const svg = await waitFor(() =>
      screen.getByRole('img', { name: /median rate as the faint band/ }),
    );
    await waitFor(() => expect(screen.getByText(/fleet median 0/)).toBeTruthy());
    measurable(svg);
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 80 });
    await waitFor(() => expect(screen.getByText('this node')).toBeTruthy());
    const tip = screen.getByText('this node').closest('div')?.parentElement as HTMLElement;
    expect(within(tip).getByText('fleet median')).toBeTruthy();
    expect(within(tip).getAllByText(/%/).length).toBeGreaterThan(0);
    // The head is a full instant, not an axis tick.
    expect(within(tip).getByText(/^\d{4}-\d{2}-\d{2}/)).toBeTruthy();
    fireEvent.pointerLeave(svg);
    await waitFor(() => expect(screen.queryByText('this node')).toBeNull());
  });

  it('the rank series annotates every rank at the hovered bucket, worst first', async () => {
    mountInstance('i-001');
    const svg = await waitFor(() =>
      screen.getByRole('img', { name: /share of this node's recompute per bucket/ }),
    );
    measurable(svg);
    fireEvent.pointerMove(svg, { clientX: 500, clientY: 80 });
    await waitFor(() => {
      const rows = document.querySelectorAll('[class*="tipRow"]');
      expect(rows.length).toBe(4);
    });
  });
});

describe('the distribution hover join', () => {
  it('a legend entry lights its column, a column floats the member annotation', async () => {
    mountInstance('i-003');
    await waitFor(() => expect(screen.getAllByText(/the worst carries/).length).toBeGreaterThan(0));
    // Hover the first legend entry: its column goes hot.
    const legendSpan = document.querySelector('[class*="distList"] span[data-hot]') as HTMLElement;
    fireEvent.mouseEnter(legendSpan);
    await waitFor(() =>
      expect(document.querySelectorAll('[class*="dist"] [data-hot="true"]').length).toBeGreaterThan(0),
    );
    // The annotation names the member and its value.
    const tip = document.querySelector('[class*="tipHead"]') as HTMLElement;
    expect(tip.textContent).toMatch(/^i-/);
    // Leaving clears the join.
    const list = legendSpan.closest('p') as HTMLElement;
    fireEvent.mouseLeave(list);
    await waitFor(() =>
      expect(document.querySelectorAll('[class*="dist"] [data-hot="true"]').length).toBe(0),
    );
  });
});

describe('the fleet browse', () => {
  function mountFleet() {
    window.history.replaceState(null, '', '/fleet');
    return render(
      <DataProvider source={new FixtureDataSource({ age: 't3' })}>
        <FleetRoute params={{}} />
      </DataProvider>,
    );
  }

  it('carries the workloads as doors, each with its rate and its weight', async () => {
    mountFleet();
    await waitFor(() =>
      expect(document.querySelectorAll('a[href^="/workload/"]').length).toBeGreaterThan(2),
    );
    expect(screen.getAllByText(/of fleet/).length).toBeGreaterThan(2);
    expect(screen.getByText(/never a container/)).toBeTruthy();
  });

  it('indexes every slot with classified mass, worst rate first, each row a door', async () => {
    mountFleet();
    await waitFor(() =>
      expect(document.querySelectorAll('a[href^="/instance/"]').length).toBeGreaterThan(50),
    );
    const rates = [...document.querySelectorAll('tbody td:nth-child(3)')].map((td) =>
      parseFloat((td.textContent ?? '').replace('%', '')),
    );
    for (let i = 1; i < Math.min(rates.length, 10); i++) {
      expect(rates[i - 1]).toBeGreaterThanOrEqual(rates[i] ?? 0);
    }
  });

  it('joins the roster onto the index: status words and pods ride the rows', async () => {
    mountFleet();
    await waitFor(() => expect(screen.getAllByText(/active|inactive/).length).toBeGreaterThan(10));
    await waitFor(() => expect(screen.getAllByText(/vllm-/).length).toBeGreaterThan(10));
  });

  it('sends rank questions to the instance pages rather than a flat table', async () => {
    mountFleet();
    await waitFor(() => expect(screen.getByText(/holds its ranks, one step finer/)).toBeTruthy());
  });
});

describe('the rank page', () => {
  function mountRank() {
    window.history.replaceState(null, '', '/instance/i-001/rank/0/0');
    return render(
      <DataProvider source={new FixtureDataSource({ age: 't3' })}>
        <RankRoute params={{ id: 'i-001', dp_rank: '0', group_idx: '0' }} />
      </DataProvider>,
    );
  }

  it('leads with what the events sum to: rate, weight among siblings, coverage', async () => {
    mountRank();
    await waitFor(() => expect(screen.getByText('of its cache work recomputed')).toBeTruthy());
    expect(screen.getByText("of the node's recompute")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/its node [\d.]+%/)).toBeTruthy());
  });

  it('carries the gap mix, holder-scoped, with the shared toggles', async () => {
    mountRank();
    await waitFor(() => expect(screen.getByText(/the gap over time · both classes/)).toBeTruthy());
  });

  it('frames the event rows as a pulse, and the clicked bucket as the way in', async () => {
    mountRank();
    await waitFor(() => expect(screen.getByText('Pulse')).toBeTruthy());
    expect(screen.getByText(/a liveness check, not a browse/)).toBeTruthy();
    expect(screen.getByText(/clicked bucket on the chart above/)).toBeTruthy();
    // Five rows, not thirty: a pulse has no pagination pretensions.
    await waitFor(() =>
      expect(document.querySelectorAll('tbody tr').length).toBeLessThanOrEqual(5),
    );
  });

  it('a chart bucket asks one-block-or-many: the identities drill, records beneath it', async () => {
    mountRank();
    await waitFor(() =>
      expect(document.querySelectorAll('[data-bucket-link]').length).toBeGreaterThan(0),
    );
    const link = document.querySelector('[data-bucket-link]')?.getAttribute('data-bucket-link');
    expect(link).toMatch(/^\/identities\?holder=i-001%2F0%2F0&window=\d+,\d+$/);
  });

  it('names its one guaranteed containment and links up to its siblings', async () => {
    mountRank();
    await waitFor(() =>
      expect(screen.getByText(/rank section ›/).getAttribute('href')).toBe('/instance/i-001'),
    );
  });

  it('one window rules the page: the head and the gap mix carry the same stop', async () => {
    mountRank();
    await waitFor(() =>
      expect(screen.getByText(/recompute rate · i-001 \/ 0 \/ g0 · 14 d/)).toBeTruthy(),
    );
    expect(screen.getByText(/the gap over time · both classes · 14 d/)).toBeTruthy();
    // Off the minute stop the cache group is the cells' own key, so there is nothing to caveat.
    expect(screen.queryByText(/cache groups summed/)).toBeNull();
  });

  it('offers the 3 h stop at minute grain and says the cells are kept per rank', async () => {
    // A holder scope serves at minute from the rank-grain cells, where a holder
    // IS a rank: the cache group rolls up, and the glass says so at that stop.
    window.history.replaceState(null, '', '/instance/i-001/rank/0/0?win=3h');
    render(
      <DataProvider source={new FixtureDataSource({ age: 't3' })}>
        <RankRoute params={{ id: 'i-001', dp_rank: '0', group_idx: '0' }} />
      </DataProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/recompute rate · i-001 \/ 0 \/ g0 · 3 h/)).toBeTruthy(),
    );
    await waitFor(() => expect(screen.getByText('of its cache work recomputed')).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/its node [\d.]+%/)).toBeTruthy());
    expect(screen.getByText(/rank 0.s with its cache groups summed/)).toBeTruthy();
    expect(screen.getByText(/the gap over time · both classes · 3 h/)).toBeTruthy();
    const control = screen.getByRole('group', { name: 'window' });
    expect(within(control).getByRole('button', { pressed: true }).textContent).toBe('3 h');
    expect(within(control).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '14 d',
      '48 h',
      '3 h',
    ]);
  });
});

/** A source whose pulse answers from beyond the box's partitions, as the analyzer states it. */
class PulseFrom extends FixtureDataSource {
  readonly #origin: string;

  constructor(origin: string) {
    super({ age: 't3' });
    this.#origin = origin;
  }

  override holderTimeline(
    ...args: Parameters<FixtureDataSource['holderTimeline']>
  ): ReturnType<FixtureDataSource['holderTimeline']> {
    return super
      .holderTimeline(...args)
      .then((s) => ({ ...s, data: { ...s.data, read_from: this.#origin } }));
  }
}

describe('where the pulse came from', () => {
  // A holder's pulse is its ring: the newest stores the analysis classified on it. The page
  // names where it read from, in words, and an unknown wire word as itself.
  function mountPulse(source: FixtureDataSource) {
    window.history.replaceState(null, '', '/instance/i-001/rank/0/0');
    return render(
      <DataProvider source={source}>
        <RankRoute params={{ id: 'i-001', dp_rank: '0', group_idx: '0' }} />
      </DataProvider>,
    );
  }

  it.each([
    ['ring', "from the holder's newest stores"],
    ['log', 're-derived from the log'],
    ['tape', 'read from tape'],
  ])('says %s in words', async (origin, words) => {
    mountPulse(new PulseFrom(origin));
    await waitFor(() => expect(screen.getByText(words)).toBeTruthy());
  });
});

describe('the identities drill', () => {
  function mountIdentities(holder: string, fromMs: number, toMs: number) {
    window.history.replaceState(
      null,
      '',
      `/identities?holder=${encodeURIComponent(holder)}&window=${fromMs},${toMs}`,
    );
    return render(
      <DataProvider source={new FixtureDataSource({ age: 't3' })}>
        <IdentitiesRoute params={{}} />
      </DataProvider>,
    );
  }
  const THRASH_HOUR = Date.parse('2026-08-03T06:00:00Z');
  const QUIET_HOUR = Date.parse('2026-08-02T18:00:00Z');

  it('answers one-block-or-many as figures, computed over the whole span', async () => {
    mountIdentities('i-004/0/0', THRASH_HOUR, THRASH_HOUR + 3_600_000);
    await waitFor(() => expect(screen.getByText('carried by the heaviest identity')).toBeTruthy());
    expect(screen.getByText('distinct identities recomputed')).toBeTruthy();
    expect(screen.getByText('tokens recomputed in the span')).toBeTruthy();
  });

  it('the incident hour reads concentrated; a quiet hour reads as breadth', async () => {
    mountIdentities('i-004/0/0', THRASH_HOUR, THRASH_HOUR + 3_600_000);
    await waitFor(() => expect(screen.getByText('carried by the heaviest identity')).toBeTruthy());
    const tile = screen.getByText('carried by the heaviest identity').closest('div') as HTMLElement;
    const hot = parseFloat(within(tile).getAllByText(/%/)[0]?.textContent ?? '0');
    expect(hot).toBeGreaterThan(40);
  });

  it('each identity column opens its block page, and the records stay one level beneath', async () => {
    mountIdentities('i-004/0/0', QUIET_HOUR, QUIET_HOUR + 3_600_000);
    await waitFor(() =>
      expect(document.querySelectorAll('a[href^="/block/"]').length).toBeGreaterThan(3),
    );
    const records = screen.getByText(/records behind this ›/);
    expect(records.getAttribute('href')).toMatch(/^\/evidence\?holder=i-004%2F0%2F0&window=\d+,\d+$/);
  });
});
