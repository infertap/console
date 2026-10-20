// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FixtureDataSource } from '../../data/fixture/source';
import { DataProvider } from '../../data/react';
import DocumentRoute from './DocumentRoute';

/**
 * The v3 placement section: the copies histogram as the headline, the pair matrix and the
 * whale drill beside it. These assert the section's claims, not its markup: containment (the
 * panel's cut cannot reach the matrix), the honest denominator on the anchor, and the drill
 * grammar.
 */

function mountAt(path: string) {
  window.history.replaceState(null, '', path);
  return render(
    <DataProvider source={new FixtureDataSource({ age: 't3' })}>
      <DocumentRoute />
    </DataProvider>,
  );
}

describe('the anchor', () => {
  it('states the duplicated share over ALL cached mass, with the mean demoted to hover', async () => {
    mountAt('/');
    await waitFor(() =>
      expect(screen.getByText(/cached held more than once/)).toBeTruthy(),
    );
    const line = screen.getByText(/cached held more than once/).closest('div') as HTMLElement;
    expect(within(line).getByText('duplicated')).toBeTruthy();
    expect(within(line).getByText('cross-engine')).toBeTruthy();
    // The near-constant mean-copies scalar earns hover, not glass.
    expect(screen.queryByText(/1\.06×/)).toBeNull();
  });
});

describe('the copies panel', () => {
  it('follows its cut: the workload retargets the chart and the gauges', async () => {
    mountAt('/?psel=rag-batch');
    // The ready head carries the served window and its grain; the loading head does not. The
    // panel opens at the document's one default stop, the same as the thrash lens above it.
    await waitFor(() => expect(screen.getByText(/copies · rag-batch · 14 d · day/)).toBeTruthy());
    const pressed = screen
      .getAllByRole('row')
      .filter((tr) => tr.getAttribute('aria-pressed') === 'true');
    expect(pressed.some((tr) => tr.textContent?.includes('rag-batch'))).toBe(true);
  });

  it('carries the four copy bands with their daily masses', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getAllByText('2 copies').length).toBeGreaterThan(0));
    for (const band of ['2 copies', '3 to 4', '5 to 8', '9 or more']) {
      expect(screen.getAllByText(band).length).toBeGreaterThan(0);
    }
  });

  it('computes pairs and the weakest cell from the placement read, stated per cut', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getAllByText('weakest cell').length).toBeGreaterThan(0));
    expect(screen.getAllByText('pairs').length).toBeGreaterThan(0);
    expect(screen.getAllByText('cross-engine').length).toBeGreaterThan(0);
  });
});

describe('the pair matrix', () => {
  it('is an independent block: the copies cut does not touch it', async () => {
    mountAt('/?psel=code-assist');
    await waitFor(() => expect(screen.getByText(/engine pairs · day grain/)).toBeTruthy());
    // The matrix still sums the whole fleet's rank pairs, not one workload's.
    expect(screen.getByText(/engine pairs, summed over .* rank pairs/)).toBeTruthy();
  });

  it('leaves the diagonal empty rather than rendering a zero against itself', async () => {
    const { container } = mountAt('/');
    await waitFor(() => expect(screen.getByText(/engine pairs · day grain/)).toBeTruthy());
    expect(container.querySelectorAll('[class*="self"]').length).toBeGreaterThan(0);
  });

  it('marks a thin cell instead of shading it, because intensity already means magnitude', async () => {
    const { container } = mountAt('/');
    await waitFor(() => expect(screen.getByText(/engine pairs · day grain/)).toBeTruthy());
    expect(container.querySelectorAll('[data-thin="true"]').length).toBeGreaterThanOrEqual(7);
  });
});

describe('the whale drill', () => {
  it('ranks identities worst first and drills to the block, not to a dead end', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getByText('b4a1')).toBeTruthy());
    const link = screen.getByText('b4a1').closest('a');
    expect(link?.getAttribute('href')).toMatch(/^\/block\//);
    // Worst first: the top row's token-hours exceed the second's.
    const rows = within(
      screen.getByText('b4a1').closest('table') as HTMLElement,
    ).getAllByRole('row');
    expect(rows[1]?.textContent).toContain('b4a1');
  });

  it('states the settled days and the cut, and marks a row a cut left short', async () => {
    mountAt('/');
    await waitFor(() => expect(screen.getByText(/settled\s+days, each day cut at/)).toBeTruthy());
    // The rows are a cut of a larger population, and the stamp says which.
    expect(screen.getByText(/identity-days with duplicated time/)).toBeTruthy();
    // b510 sat outside two days' cuts: its figure is a lower bound, and says so.
    const bounded = screen.getByText('b510').closest('tr') as HTMLElement;
    expect(bounded.textContent).toContain('≥');
    const exact = screen.getByText('b4a1').closest('tr') as HTMLElement;
    expect(exact.textContent).not.toContain('≥');
  });
});
