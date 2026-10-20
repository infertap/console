// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { HONEST_STATES, asHonestState, isDegraded } from './state';

/** Five words and no sixth: the whole difference between "looked, fine" and "never looked". */
describe('the honest states', () => {
  it('are exactly five, in severity-neutral declaration order', () => {
    expect([...HONEST_STATES]).toEqual([
      'fine',
      'impaired',
      'unexamined',
      'indeterminate',
      'unobserved',
    ]);
  });

  it('narrows a server word to a state, and a stranger to null rather than to fine', () => {
    expect(asHonestState('impaired')).toBe('impaired');
    expect(asHonestState('degraded')).toBeNull();
    expect(asHonestState('')).toBeNull();
  });

  it('surfaces impaired and unexamined at every altitude, and nothing else', () => {
    expect(HONEST_STATES.filter(isDegraded)).toEqual(['impaired', 'unexamined']);
  });
});
