// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FixtureDataSource } from '../src/data/fixture/source';
import { DataProvider } from '../src/data/react';
import { SignIn } from '../src/features/auth/LoginRoute';

/**
 * The sign-in form, and what the browser is allowed to do with it.
 *
 * **F6, 2026-08-15.** The token field carried `autoComplete="off"`, which tells the password
 * manager not to offer to save it. The token is the standing credential and the session is what
 * expires, so that one attribute made every re-authentication an SSH session to the analyzer host
 * to re-read the token file. These assertions are cheap and the defect was invisible: nothing
 * fails, nothing logs, the form simply never fills.
 */

function form() {
  return render(
    <DataProvider source={new FixtureDataSource({ age: 't3' })}>
      <SignIn />
    </DataProvider>,
  );
}

describe('the browser may save the viewer token', () => {
  it('invites the password manager to fill the token', () => {
    form();
    const token = screen.getByLabelText('token');
    expect(token).toHaveProperty('type', 'password');
    expect(token.getAttribute('autocomplete')).toBe('current-password');
  });

  it('carries a username field, because a lone password input is keyed unreliably', () => {
    // The reason this exists at all. Managers associate a saved credential with (origin,
    // username); with no username field the save is inconsistent across browsers, which is the
    // same silent-failure shape F6 was fixing.
    form();
    const account = screen.getByLabelText('account');
    expect(account.getAttribute('autocomplete')).toBe('username');
    expect(account).toHaveProperty('value', 'viewer');
  });

  it('does not let the operator edit the account, because viewer is the only role', () => {
    // read-api.md 6.2: one role, because every endpoint is a read of the same fleet. An editable
    // field would offer a choice the API cannot honour.
    form();
    expect(screen.getByLabelText('account')).toHaveProperty('readOnly', true);
  });

  it('never renders the token as readable text', () => {
    // The field is `type=password` above; this is the standing guard against somebody making it
    // `text` to debug a paste and leaving it that way.
    const { container } = form();
    const plain = container.querySelectorAll('input[type="text"]');
    for (const input of plain) {
      expect(input.getAttribute('id')).not.toBe('token');
    }
  });
});
