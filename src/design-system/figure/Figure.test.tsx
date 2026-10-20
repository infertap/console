// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Figure, Unmeasured } from './Figure';

/**
 * A number renders with its coverage, its register and its basis, or it does not render. The
 * component's props make a bare number unconstructible; these pin what the glass shows for the
 * two things it can show: a covered figure, and the designed absence in the same position.
 */
describe('a figure', () => {
  const covered = { value: 4_187_266, register: '>=', coverage: 0.8, coverage_kind: 'token-weighted' };

  it('renders the value as a lower bound with its unit, coverage and basis', () => {
    render(<Figure value={covered} unit="tokens" register="recompute" />);
    expect(screen.getByLabelText('lower bound').textContent).toBe('≥');
    expect(screen.getByText('4,187,266')).toBeTruthy();
    expect(screen.getByText('tokens')).toBeTruthy();
    expect(screen.getByText(/coverage/).textContent).toBe('coverage 80.0%, token-weighted');
  });

  it('formats as the panel asked and can state the coverage without its basis', () => {
    render(
      <Figure
        value={{ ...covered, value: 0.1234 }}
        unit="of cache work"
        register="recompute"
        format="percent"
        provenance="coverage-only"
      />,
    );
    expect(screen.getByText('12.34%')).toBeTruthy();
    expect(screen.getByText(/coverage/).textContent).toBe('coverage 80.0%');
  });

  it('can leave the coverage to a section that states it once', () => {
    render(<Figure value={covered} unit="tokens" register="capacity" provenance="none" />);
    expect(screen.queryByText(/coverage/)).toBeNull();
  });
});

describe('the designed absence', () => {
  it('hatches with its state, keeps the unit, and says what would make it a number', () => {
    render(
      <Unmeasured
        state="unexamined"
        unit="tokens"
        register="recompute"
        reason="fills with the first tick"
      />,
    );
    expect(screen.getByRole('img', { name: 'unexamined' })).toBeTruthy();
    expect(screen.getByText('tokens')).toBeTruthy();
    expect(screen.getByText('fills with the first tick')).toBeTruthy();
    // Never a zero, never a dash: nothing on the glass reads as a value of nothing.
    expect(screen.queryByText(/^[0-]$/)).toBeNull();
  });
});
