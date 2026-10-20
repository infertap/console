// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FixtureDataSource } from '../../data/fixture/source';
import { DataProvider } from '../../data/react';
import DocumentRoute from './DocumentRoute';

/**
 * The v3 document, in reading order.
 *
 * These assert the claims each section makes rather than its markup: that the anchor carries
 * its denominator and coverage, that the lens's bands ride with their masses, that a breaking
 * marker refuses its comparison, that a summary never drops a degraded count. Those are the
 * product's assertions, so they are the things worth failing a build over.
 */

function mountAt(path: string) {
  window.history.replaceState(null, '', path);
  return render(
    <DataProvider source={new FixtureDataSource({ age: 't3' })}>
      <DocumentRoute />
    </DataProvider>,
  );
}

describe('the anchor line', () => {
  it('carries the fraction, its denominator and its coverage in one row', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getByText(/of .* stored/i)).toBeTruthy());
    expect(screen.getByText('repeat compute')).toBeTruthy();
    expect(screen.getByText(/token-weighted$/)).toBeTruthy();
    // A floor, never an estimate.
    expect(screen.getAllByText(/≥ [\d,]+ tokens/).length).toBeGreaterThan(0);
  });

  it('renders no verdict word: the meter reports, the operator concludes', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getByText(/of .* stored/i)).toBeTruthy());
    const anchor = screen.getByText(/of .* stored/i).closest('div') as HTMLElement;
    expect(within(anchor).queryByText(/fine|impaired/)).toBeNull();
  });
});

describe('the thrash lens', () => {
  it('states its bands and their masses beside the chart', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getByText('under 10 s')).toBeTruthy());
    for (const band of ['under 10 s', '10 s to 1 min', '1 to 10 min', '10 to 60 min']) {
      expect(screen.getAllByText(band).length).toBeGreaterThan(0);
    }
  });

  it('keeps the gap-unobserved mass beside the bands, never in the stack', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getByText('gap unobserved')).toBeTruthy());
    // The gauge is a tile with its own lower-bound mass; the stack has four bands, not five.
    const tile = screen.getByText('gap unobserved').parentElement as HTMLElement;
    expect(within(tile).getByText(/^≥ /)).toBeTruthy();
  });

  it('cut is a control of this panel: by workload retargets the chart to a member', async () => {
    mountAt('/?cut=workload&sel=chat-prod');
    await waitFor(() => expect(screen.getByText(/how soon it comes back · chat-prod/)).toBeTruthy());
    const pressed = screen
      .getAllByRole('row')
      .filter((tr) => tr.getAttribute('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
    expect(pressed[0]?.textContent).toContain('chat-prod');
  });

  it('the instance cut lists nodes, not ranks, and names what its top-N was cut from', async () => {
    // "By instance" asks for the instance dim: the same entity the fleet index lists. The
    // table is a top-N of the nodes the read returned, and the stamp says so.
    mountAt('/?cut=instance');
    await waitFor(() => expect(screen.getByText(/worst first/)).toBeTruthy());
    const stamp = screen.getByText(/worst first/).closest('p');
    expect(stamp?.textContent).toMatch(/top 8 of \d+ nodes/);
    expect(stamp?.querySelector('a')?.getAttribute('href')).toBe('/fleet');
    // A member is a node, and its chevron opens the node's page.
    const links = screen.getAllByTitle(/open i-\d+'s page/);
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]?.getAttribute('href')).toMatch(/^\/instance\/i-\d+$/);
  });

  it('the two metric panels open at the same stop, and both name the served grain', async () => {
    mountAt('/');
    await waitFor(() =>
      expect(screen.getByText(/how soon it comes back · fleet · 14 d · day/)).toBeTruthy(),
    );
    expect(screen.getByText(/copies · fleet · 14 d · day/)).toBeTruthy();
  });

  it('selecting custom seeds both bounds from the window shown, in one address', async () => {
    mountAt('/');
    await waitFor(() =>
      expect(screen.getByText(/how soon it comes back · fleet · 14 d · day/)).toBeTruthy(),
    );
    // The thrash lens's window group is the first "custom" button on the page.
    fireEvent.click(screen.getAllByRole('button', { name: 'custom' })[0] as HTMLElement);
    const params = new URLSearchParams(window.location.search);
    expect(params.get('win')).toBe('custom');
    expect(params.get('from')).toMatch(/^2026-/);
    expect(params.get('to')).toMatch(/^2026-/);
    // The request that follows is that window restated, never `0,0`.
    await waitFor(() => expect(screen.getByText(/range × retention/)).toBeTruthy());
  });

  it('a custom range states its served grain and why, rather than silently picking one', async () => {
    // A five-hour range ladders to hour buckets server-side; the response's window echo
    // carries the derivation and the range row stamps it.
    mountAt('/?win=custom&from=2026-08-03T09:00&to=2026-08-03T14:00');
    await waitFor(() =>
      expect(screen.getByText(/how soon it comes back · fleet · 08-03 09:00→14:00/)).toBeTruthy(),
    );
    expect(screen.getByText(/range × retention/)).toBeTruthy();
  });
});

describe('marker attribution', () => {
  it('is an interaction both metric panels carry, not a section of its own', async () => {
    mountAt('/');
    await waitFor(() =>
      expect(screen.getAllByText(/around each deploy/).length).toBeGreaterThanOrEqual(2),
    );
    expect(screen.queryByText('What changed')).toBeNull();
  });

  it("leads with the panel's own register and rides the base rates as hover", async () => {
    mountAt('/?mk=affinity-weights');
    await waitFor(() =>
      expect(screen.getByText(/recompute · after vs before/)).toBeTruthy(),
    );
    expect(screen.getByText('duplication')).toBeTruthy();
    const tile = screen.getByText(/recompute · after vs before/).closest('[title]') as HTMLElement;
    expect(tile.getAttribute('title')).toMatch(/tok\/min/);
  });

  it('says when the after span is still filling rather than pretending a full hour', async () => {
    mountAt('/?mk=affinity-weights');
    await waitFor(() =>
      expect(screen.getAllByText(/after span · still filling/).length).toBeGreaterThan(0),
    );
  });

  it('a breaking marker splits the series and refuses its comparison', async () => {
    // Selected in both panels: each carries its own marker state, per containment.
    mountAt('/?mk=js-6&pmk=js-6');
    await waitFor(() => expect(screen.getAllByText(/series breaks at/).length).toBe(2));
    expect(screen.getAllByText('before/after refused').length).toBe(2);
    // Refused, so no delta renders anywhere.
    expect(screen.queryByText(/after vs before/)).toBeNull();
  });
});

describe('trust', () => {
  it('keeps the two coverage bases apart: instance-time here, token-weighted at the anchor', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getByText('instance-time coverage')).toBeTruthy());
    // The token-weighted figure renders on the anchor line, beside the mass it qualifies, and
    // no trust tile repeats it.
    expect(screen.getByText(/% token-weighted$/)).toBeTruthy();
    expect(screen.queryByText('token-weighted coverage')).toBeNull();
  });

  it('renders the three populations as three numbers', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getByText(/ranks observed/)).toBeTruthy());
    expect(screen.getByText('engines')).toBeTruthy();
    expect(screen.getByText('tap processes')).toBeTruthy();
  });

  it('surfaces every degraded count, however small against the total', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getByText('instance-time coverage')).toBeTruthy());
    const chips = screen.getAllByText(
      /silent: heartbeats missed|stopped cleanly|never declared/,
    );
    expect(chips.length).toBeGreaterThanOrEqual(3);
  });

  it('renders the roster bound rather than a count it has no basis for', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getByText(/not an inventory of what exists/)).toBeTruthy());
  });
});

describe('reading order is the argument', () => {
  it('runs the meter, then placement, then trust', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getByText('Trust')).toBeTruthy());
    const order = ['Repeat compute', 'Placement', 'Trust'];
    const trust = screen.getByText('Trust');
    for (const name of order.slice(0, -1)) {
      const node = screen.getByText(name);
      expect((node.compareDocumentPosition(trust) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(
        true,
      );
    }
  });
});

describe('the vocabulary stays two words', () => {
  it('renders undeclared for a workload absence, and never unattributed', async () => {
    // Workload is declared on the producer's segment_open, so its absence is `undeclared`.
    // `unattributed` is the config-mapping miss and belongs to tenant alone.
    mountAt('/?cut=workload');
    await waitFor(() => expect(screen.getAllByText('undeclared').length).toBeGreaterThan(0));
    expect(screen.queryByText('unattributed')).toBeNull();
  });
});
