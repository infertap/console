// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CAUSES } from '../../domain/refusal';
import { HONEST_STATES } from '../../domain/state';
import GalleryRoute from './GalleryRoute';

/**
 * The conformance corpus, asserted.
 *
 * **What this covers and what it does not, stated so nobody reads more into a green run.** These
 * are structural assertions: every state renders, every cause renders, a figure carries its
 * coverage and its basis, an unmeasured position renders no digits. They would catch a cause
 * dropped from the catalogue or a figure rendered without its provenance.
 *
 * They would NOT catch the unexamined hatch turning into a solid fill, because that is CSS and
 * jsdom does not apply it. Pixel snapshots need a real browser; see `docs/gates.md` for why that
 * is owed rather than done.
 */

describe('the gallery renders the whole catalogue', () => {
  it('shows every honest state, and never a sixth', () => {
    render(<GalleryRoute />);
    for (const state of HONEST_STATES) {
      expect(screen.getAllByText(state).length).toBeGreaterThan(0);
    }
  });

  it('renders an unrecognised state word as itself rather than as one of the five', () => {
    render(<GalleryRoute />);
    // The failure this prevents: a newer analyzer's word silently rendering as `fine`.
    expect(screen.getByText('quarantined')).toBeTruthy();
    expect(screen.getAllByText('unrecognised').length).toBeGreaterThan(0);
  });

  it('shows every cause in the closed set', () => {
    render(<GalleryRoute />);
    for (const cause of CAUSES) {
      expect(screen.getAllByText(cause).length).toBeGreaterThan(0);
    }
  });

  it('shows a cause from outside the set as a contract break, not a designed state', () => {
    render(<GalleryRoute />);
    expect(screen.getByText('Unrecognised refusal')).toBeTruthy();
  });
});

describe('a figure never reaches glass without its coverage', () => {
  it('states the coverage and the basis beside the value', () => {
    render(<GalleryRoute />);
    // The same sample renders at three tiers on this page, so the hero is taken by position
    // rather than by uniqueness.
    const hero = screen.getAllByText('4,187,266')[0] as HTMLElement;
    const lockup = hero.closest('div')?.parentElement;
    expect(lockup).toBeTruthy();
    const provenance = within(lockup as HTMLElement).getByText(/coverage/);
    expect(provenance.textContent).toContain('97.8%');
    // Two figures at 80% on different bases are not comparable, so the basis rides with the
    // number rather than living in a caption somewhere.
    expect(provenance.textContent).toContain('token-weighted');
  });

  it('renders the bound glyph rather than the wire register', () => {
    render(<GalleryRoute />);
    expect(screen.getAllByLabelText('lower bound').length).toBeGreaterThan(0);
    expect(screen.queryByText('>=')).toBeNull();
  });

  it('renders an unmeasured position with no digits in it', () => {
    render(<GalleryRoute />);
    // A dash or a zero would both read as a value. The hatch is labelled by its state instead.
    const hatch = screen.getAllByLabelText('unexamined')[0];
    expect(hatch).toBeTruthy();
    expect(hatch?.textContent ?? '').toBe('');
  });
});

describe('a refusal states its bound', () => {
  it('renders the bound the refusal arrived with', () => {
    render(<GalleryRoute />);
    // A refusal that does not state its bound is the vague 404 the whole scheme exists to
    // prevent, so the bound is rendered as labelled facts rather than folded into prose.
    expect(screen.getByText('raw from day')).toBeTruthy();
    expect(screen.getByText('2026-07-21')).toBeTruthy();
    // Two causes on this page carry a requested day, which is the point: the bound is whatever
    // makes THAT refusal actionable rather than one shape for all of them.
    expect(screen.getAllByText('requested day').length).toBe(2);
    // A stale cursor states what MOVED, so the console can name the change rather than just
    // report a failure.
    expect(screen.getByText('current frontier day')).toBeTruthy();
    expect(screen.getByText('current discriminator')).toBeTruthy();
  });
});
