// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CAUSES } from '../../domain/refusal';
import { ALL_CAUSES, Refusal } from './Refusal';

/**
 * A refusal is a designed render, never a generic error: it takes the answer's position, names
 * the cause in the reader's terms, carries the server's sentence verbatim and states the bound
 * that produced it. A cause this bundle does not know is shown as it arrived, never inferred.
 */
describe('a refusal', () => {
  it('has framing copy for every cause in the closed set, and for nothing else', () => {
    expect([...ALL_CAUSES].sort()).toEqual([...CAUSES].sort());
  });

  it('names a known cause in the reader\'s terms, keeps the wire word, and renders the sentence verbatim', () => {
    render(
      <Refusal
        refusal={{
          cause: 'outside_raw_horizon',
          message: 'no event grain past 14 days',
          bound: { raw_horizon_days: 14, requested_days: 30 },
        }}
      />,
    );
    const note = screen.getByRole('note');
    expect(screen.getByText('Past the raw horizon')).toBeTruthy();
    expect(screen.getByText('outside_raw_horizon')).toBeTruthy();
    expect(screen.getByText('no event grain past 14 days')).toBeTruthy();
    // The bound, as labelled rows with the wire's underscores read as spaces.
    expect(screen.getByText('raw horizon days').nextElementSibling?.textContent).toBe('14');
    expect(screen.getByText('requested days').nextElementSibling?.textContent).toBe('30');
    expect(note.textContent).not.toContain('does not know that cause');
  });

  it('states what was requested beside what bounded it', () => {
    render(
      <Refusal
        refusal={{
          cause: 'grain_unavailable',
          message: 'minute grain reaches 48 hours',
          bound: { reach_hours: 48 },
          requested: { grain: 'minute', window: '14d' },
        }}
      />,
    );
    expect(screen.getByText('requested grain').nextElementSibling?.textContent).toBe('minute');
    expect(screen.getByText('requested window').nextElementSibling?.textContent).toBe('14d');
  });

  it('shows a cause it does not know as it arrived and says so, inferring nothing', () => {
    render(
      <Refusal
        refusal={{ cause: 'quota_exceeded' as never, message: 'the fleet is over its quota' }}
      />,
    );
    expect(screen.getByText('Unrecognised refusal')).toBeTruthy();
    expect(screen.getByText('quota_exceeded')).toBeTruthy();
    expect(screen.getByText('the fleet is over its quota')).toBeTruthy();
    expect(screen.getByText(/does not know that cause/)).toBeTruthy();
  });

  it('renders a bound array as one readable row', () => {
    render(
      <Refusal
        refusal={{ cause: 'dim_unknown', message: 'dim must be one of the vocabulary', bound: { dims: ['class', 'holder'] } }}
        density="inline"
      />,
    );
    expect(screen.getByText('dims').nextElementSibling?.textContent).toBe('class, holder');
  });
});
