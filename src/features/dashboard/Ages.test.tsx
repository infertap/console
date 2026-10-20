// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AGES, type Age } from '../../config';
import { FixtureDataSource } from '../../data/fixture/source';
import { DataProvider } from '../../data/react';
import DocumentRoute from './DocumentRoute';

/**
 * **One layout at every age.**
 *
 * There is no first-run route, no wizard and no onboarding overlay. The document has exactly one
 * layout at every age, and what changes with data is each section's state. So the test is not
 * "does t0 look right" but "is t0 the same document as t3, in a different state" — which is a
 * claim about structure, and is therefore checkable.
 *
 * These are the tests that would catch the tempting shortcut: hiding a section until it has data.
 * A section that disappears has reflowed the page, and a reader who learns the shape of this
 * document at steady state would find a different shape on the day something broke.
 */

const SECTIONS = ['Repeat compute', 'Placement', 'Trust'];

function mount(age: Age) {
  window.history.replaceState(null, '', '/');
  return render(
    <DataProvider source={new FixtureDataSource({ age })}>
      <DocumentRoute />
    </DataProvider>,
  );
}

describe('every section holds its position at every age', () => {
  for (const age of AGES) {
    it(`renders all three sections at ${age}`, async () => {
      mount(age);
      // Wait for the document to settle rather than for any one section: at t0 most reads
      // refuse, and the point is that refusing still renders.
      await waitFor(() => expect(screen.getByText('Trust')).toBeTruthy());
      for (const section of SECTIONS) {
        expect(screen.getAllByText(section).length).toBeGreaterThan(0);
      }
    });
  }

  it('keeps the sections in one order, whatever each one is doing', async () => {
    for (const age of AGES) {
      const view = mount(age);
      await waitFor(() => expect(screen.getByText('Trust')).toBeTruthy());
      const headings = screen
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent ?? '')
        .filter((text) => SECTIONS.includes(text));
      // Reading order is the argument, and the argument does not reorder itself when a
      // section has nothing to say.
      expect(headings).toEqual(SECTIONS);
      view.unmount();
    }
  });
});

describe('before the first pass', () => {
  it('states why there is no figure, in the positions the figures will occupy', async () => {
    mount('t0');
    // The anchor and the lens each state their own consequence, never a zero.
    await waitFor(() =>
      expect(screen.getByText(/No analysis has classified a day yet/)).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.getByText(/The lens fills with the first analysis pass/)).toBeTruthy(),
    );
    expect(screen.queryByText('0')).toBeNull();
  });

  it('still declares the document stamp, because the stamp answers at every age', async () => {
    mount('t0');
    await waitFor(() => expect(screen.getByText(/last analysis/)).toBeTruthy());
    expect(screen.getByText('none yet')).toBeTruthy();
  });
});

describe('the ages differ only in state', () => {
  it('holds the same section count from t0 to t3', async () => {
    const t0 = mount('t0');
    await waitFor(() => expect(screen.getByText('Trust')).toBeTruthy());
    const t0Sections = screen.getAllByRole('heading', { level: 2 }).length;
    t0.unmount();

    mount('t3');
    await waitFor(() => expect(screen.getAllByText(/≥ [\d,]+/).length).toBeGreaterThan(0));
    const t3Sections = screen.getAllByRole('heading', { level: 2 }).length;

    // Same document, same number of sections. Only the states moved.
    expect(t0Sections).toBe(t3Sections);
  });
});
