// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FixtureDataSource } from '../src/data/fixture/source';
import { DataProvider } from '../src/data/react';
import { App } from '../src/app/App';
import { DESTINATIONS } from '../src/design-system/chrome/Rail';

/**
 * The drill grammar, through the real shell.
 *
 * **Click descends one level toward evidence and never sideways into interpretation**, and every
 * level is addressable. These assert both halves: that the hops exist and go the right way, and
 * that each one can be reached by pasting its address rather than only by clicking to it.
 */

function at(path: string, source: FixtureDataSource = new FixtureDataSource({ age: 't3' })) {
  window.history.replaceState(null, '', path);
  return render(
    <DataProvider source={source}>
      <App />
    </DataProvider>,
  );
}

describe('the rail carries destinations, never sections', () => {
  it('offers no Reports destination, because the route does not exist', () => {
    // Sidelined by ruling 2026-08-04: not reserved, not refusing, absent. A rail entry pointing
    // at a surface the API has no answer for is a promise this product cannot keep.
    //
    // **`Declared inputs` LEFT for the same reason, 2026-08-17** — and it had already shipped.
    // The analyzer removed `/v1/declared-inputs` when `label_mappings` and `cost_rates` were
    // deleted (the endpoint was their read half), but the console's pinned contract was never
    // re-synced, so v1.0.1 shipped a rail entry calling an endpoint that no longer answers. This
    // assertion held the whole time because it listed what the rail HAD rather than what the API
    // could serve.
    const labels = DESTINATIONS.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain('Reports');
    expect(labels).not.toContain('Declared inputs');
    // Ranks left the rail when the entity pages landed: rank is a section of the instance
    // page, and the Fleet browse is the facet hierarchy's door.
    expect(labels).toEqual(['Dashboard', 'Fleet', 'Health']);
  });

  it('lights the owning destination while a drill page is open', async () => {
    at('/day/2026-08-02');
    await waitFor(() => expect(screen.getByText('2026-08-02')).toBeTruthy());
    // A drill page never appears in the rail; it lights its parent instead.
    const current = screen.getByRole('link', { current: 'page' });
    expect(current.textContent).toContain('Dashboard');
  });
});

describe('three hops, each one addressable', () => {
  it('descends document to day to records', async () => {
    at('/day/2026-08-02');
    await waitFor(() => expect(screen.getByText('Records behind this')).toBeTruthy());

    // Hop two offers hop three rather than performing it: click descends, and the reader is the
    // one who clicks. A day's records are drilled by holder: the link opens the day's heaviest
    // holder over the day.
    const toEvidence = screen.getByRole('link', { name: /open the records of .* on 2026-08-02/ });
    const from = Date.parse('2026-08-02T00:00:00Z');
    expect(toEvidence.getAttribute('href')).toContain('/evidence?holder=');
    expect(toEvidence.getAttribute('href')).toContain(`&window=${from},${from + 86_400_000}`);
  });

  it('reaches level 2 by address alone, and says it is terminal', async () => {
    at('/evidence?block=b4a1');
    // The title comes from the address and the table comes from the read, so wait on the read.
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'block' })).toBeTruthy());
    expect(screen.getByText(/Records behind b4a1/)).toBeTruthy();
    // There is nothing beneath this, and a reader who has descended three times is told so
    // rather than left hunting for a fourth.
    expect(screen.getByText('terminal')).toBeTruthy();
  });

  it('states the horizon rather than showing an empty table, past the raw window', async () => {
    const from = Date.parse('2026-06-02T09:00:00Z');
    at(`/evidence?holder=i-001%2F0%2F0&window=${from},${from + 3_600_000}`);
    await waitFor(() => expect(screen.getByText('Past the raw horizon')).toBeTruthy());
    // A retention bound is not an absence of activity, so the bound renders as facts.
    expect(screen.getByText('outside_raw_horizon')).toBeTruthy();
    expect(screen.getByText(/declared days/)).toBeTruthy();
  });

  it('carries a breadcrumb back through the hierarchy that owns it', async () => {
    at('/instance/i-001/rank/0/0');
    await waitFor(() => expect(screen.getByText('Pulse')).toBeTruthy());
    const crumbs = screen.getAllByRole('link').map((a) => a.textContent);
    expect(crumbs).toContain('Dashboard');
    expect(crumbs).toContain('Fleet');
    expect(crumbs).toContain('i-001');
  });

  it('answers the rank drill\'s old spelling with its new home', async () => {
    // URL is state: /holder/:triple shipped, so it redirects rather than dead-ending.
    at('/holder/i-001/0/0');
    await waitFor(() => expect(screen.getByText('Pulse')).toBeTruthy());
    expect(window.location.pathname).toBe('/instance/i-001/rank/0/0');
  });

  it('answers the retired Ranks page with the fleet browse', async () => {
    at('/holders');
    await waitFor(() => expect(window.location.pathname).toBe('/fleet'));
  });
});

describe('the one dark surface', () => {
  it('carries wall-clock facts and no accounting figure', async () => {
    at('/');
    await waitFor(() => expect(screen.getByText('horizon')).toBeTruthy());
    // Ingest and health only. Every pass-clock figure lives on the light canvas below, and a
    // number never crosses that boundary.
    for (const label of ['segment', 'lag', 'horizon', 'analysis version']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe('the analyze-now kick', () => {
  it('requests once, then holds until the pass lands as the new-data offer', async () => {
    at('/');
    const button = await screen.findByRole('button', { name: 'analyze now' });
    button.click();
    // Event-driven, never a spinner: the acknowledged request holds as a stat until
    // the completed pass replaces it with the new-data offer.
    await waitFor(() => expect(screen.getByText('analysis requested')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'analyze now' })).toBeNull();
  });
});

describe('the delivery ledger on health', () => {
  it('states each blame as its own number, never one blended figure', async () => {
    at('/health');
    await waitFor(() => expect(screen.getByText('Delivery')).toBeTruthy());
    // Each blame appears at least once, and twice when a problem row exists: the fleet
    // gauge and the per-process table both name it, never a blended figure.
    expect(screen.getAllByText('declared dropped').length).toBeGreaterThan(0);
    expect(screen.getAllByText('missing · no declaration').length).toBeGreaterThan(0);
    expect(screen.getAllByText('records dropped at source').length).toBeGreaterThan(0);
  });
});

describe('event grain as an index lookup', () => {
  it('a day-grain bucket on the dashboard opens its day: the day drill has a door again', async () => {
    at('/');
    await waitFor(() =>
      expect(document.querySelectorAll('[data-bucket-link^="/day/"]').length).toBeGreaterThan(0),
    );
    const link = document.querySelector('[data-bucket-link^="/day/"]');
    expect(link?.getAttribute('data-bucket-link')).toMatch(/^\/day\/\d{4}-\d{2}-\d{2}$/);
  });

  it('evidence lands scoped to the clicked bucket and says so', async () => {
    const from = Date.parse('2026-08-03T09:00:00Z');
    at(`/evidence?holder=i-001%2F0%2F0&window=${from},${from + 3_600_000}`);
    await waitFor(() => expect(screen.getByText(/the clicked bucket’s own span/)).toBeTruthy());
    expect(screen.getByText(/2026-08-03 09:00Z → 10:00Z/)).toBeTruthy();
    expect(screen.getByText(/Records behind i-001\/0\/0/)).toBeTruthy();
    // The rows sit inside the asked hour, and the crumb climbs to the instance.
    await waitFor(() => expect(screen.getAllByText(/^09:/).length).toBeGreaterThan(3));
    const crumbs = screen.getAllByRole('link').map((a) => a.textContent);
    expect(crumbs).toContain('i-001');
  });
});

describe('the fleet index status column', () => {
  it('is quiet in the happy case and loud at the exceptions, reasons in the hover', async () => {
    // The law the retired Ranks page carried, now held where the status words live: two
    // words on glass, and the hover separates the errands, because a fault, a clean stop and
    // a run never heard from are three different to-dos wearing one word.
    at('/fleet');
    await waitFor(() => expect(screen.getAllByText('active').length).toBeGreaterThan(10));
    const inactive = screen.getAllByText('inactive');
    expect(inactive.length).toBeGreaterThanOrEqual(3);
    const titles = inactive.map((el) => el.closest('[title]')?.getAttribute('title') ?? '');
    expect(titles.some((t) => /silent/.test(t))).toBe(true);
    expect(titles.some((t) => /stopped cleanly/.test(t))).toBe(true);
    // The taxonomy stays off the glass.
    expect(screen.queryByText('unknown')).toBeNull();
    expect(screen.queryByText(/AT PASS TIME/)).toBeNull();
  });
});

/** A source whose block drill answers from the bucket: the derived files were not on the box. */
describe('where the rows came from', () => {
  // A block's records are re-derived from the log; a holder's are its ring, the newest stores
  // the analysis classified on it. The two reach back differently, so the page names its source.
  it('says a block is re-derived from the log', async () => {
    at('/evidence?block=b4a1');
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'block' })).toBeTruthy());
    expect(screen.getByText(/re-derived from the log/)).toBeTruthy();
  });

  it('says a holder is read from its newest stores', async () => {
    const from = Date.parse('2026-08-03T09:00:00Z');
    at(`/evidence?holder=i-001%2F0%2F0&window=${from},${from + 3_600_000}`);
    await waitFor(() => expect(screen.getByText(/from the holder’s newest stores|from the holder's newest stores/)).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText(/^09:/).length).toBeGreaterThan(3));
  });

  it('the block page says the log in the same words', async () => {
    at('/block/b4a1');
    await waitFor(() => expect(screen.getByText('Ranks that stored this block')).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/re-derived from the log/)).toBeTruthy());
  });
});
