// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type ReactNode } from 'react';
import { config } from '../../config';
import { useDataSource, useSession } from '../../data/react';
import { Drill } from '../../design-system/layout/Drill';
import { Plate } from '../../design-system/layout/Plate';
import { navigate, type RouteProps } from '../../design-system/navigation/router';
import { Refusal } from '../../design-system/refusal/Refusal';
import { ApiError } from '../../domain/refusal';
import styles from './Login.module.css';

/**
 * Exchange a viewer token for a session.
 *
 * **Placeholder, and recorded as one.** There is no login in the mock: nine pages, none of them
 * auth. Every other surface in this console is a port of a reviewed design, and this one would
 * be invention, so it is deliberately plain until its own design pass. `docs/decisions.md` §7
 * carries the reason and what that pass has to answer.
 *
 * The mechanism underneath it is settled, though, and is not placeholder:
 *
 * - The token posts as a JSON body, not a bearer header. The contract is generated from the
 *   handlers and declares a body; `read-api.md` §6.3 still shows bearer, and the contract wins.
 * - This code stores nothing. Success sets an `HttpOnly` cookie it cannot read by design: it can
 *   only ever discover the session is gone when a 401 arrives.
 * - **Signing in does not navigate.** The shell renders this in place while the address stays
 *   where it was, so a reader who pasted `/holder/i-004/0/1` lands on `/holder/i-004/0/1`. URL
 *   is state, and an interruption is not a reason to discard what somebody asked for.
 *
 * **The browser MAY save the token, and that is the design (F6, 2026-08-15).** This field carried
 * `autoComplete="off"` until then. The token is the standing credential and the session is what
 * expires, so refusing the password manager meant every re-authentication was an SSH session to
 * the analyzer host to re-read the token file — measurably worse than the password Grafana lets a
 * manager hold. The pair below is what makes it work: `current-password` invites the save, and a
 * username field gives the manager something to key on, because a lone password input with no
 * username is what managers associate unreliably.
 *
 * The readonly account field is not decoration. Viewer is the only role the API has
 * (`read-api.md` §6.2), so naming it states the product rather than inventing a choice.
 */
/**
 * The one role. Fixed, because the API has exactly one and a field the operator can edit would
 * imply otherwise. It is also what the password manager keys the saved credential on, alongside
 * the origin — so two analyzers stay distinct without this ever varying.
 */
const VIEWER = 'viewer';

export function SignIn({ onSignedIn }: { onSignedIn?: () => void }): ReactNode {
  const source = useDataSource();
  const session = useSession();
  const [token, setToken] = useState('');
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Plate
      name="Viewer token"
      // **Says what it is trying to reach.** A live console pointed at nothing renders this
      // screen, and until now it looked identical whether the token was wrong or no daemon was
      // there at all — a plausible product surface connected to nothing, with no banner to say
      // so. The fixture mode announces what it is NOT connected to; live owes the reader the
      // same courtesy about what it IS. Same-origin renders as such rather than as an empty
      // string, because blank would read as a missing value instead of the deployment shape.
      deviation={`api ${config.apiBase === '' ? 'same origin' : config.apiBase}`}
      lead="read it from the token file on the analyzer host, or issue one with infertap-analyzer token issue"
      footer="The analyzer keeps only the SHA-256 of this token. Nothing in a backup can reconstruct it. Rotate it with infertap-analyzer token rotate, which ends every session it opened."
    >
      <form
        className={styles['form']}
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setFailure(null);
          source.session
            .create(token)
            .then(() => {
              setToken('');
              // Clear the app-level state and re-run every open read. No navigation: the
              // address never changed, so there is nothing to restore.
              session.restored();
              onSignedIn?.();
            })
            .catch((error: unknown) => {
              setFailure(
                error instanceof ApiError
                  ? error
                  : new ApiError(0, undefined, 'the token could not be exchanged'),
              );
            })
            .finally(() => setBusy(false));
        }}
      >
        <div>
          <label className={styles['label']} htmlFor="account">
            account
          </label>
          <input
            id="account"
            name="username"
            className={`${styles['input']} ${styles['account']}`}
            type="text"
            autoComplete="username"
            readOnly
            tabIndex={-1}
            value={VIEWER}
          />
        </div>
        <div>
          <label className={styles['label']} htmlFor="token">
            token
          </label>
          <input
            id="token"
            name="password"
            className={styles['input']}
            type="password"
            autoComplete="current-password"
            spellCheck={false}
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </div>
        <button className={styles['submit']} type="submit" disabled={busy || token.length === 0}>
          {busy ? 'exchanging' : 'sign in'}
        </button>
      </form>

      {failure && (
        <div style={{ marginTop: '0.9rem' }}>
          <Refusal
            refusal={{
              cause: failure.cause ?? 'unauthenticated',
              message: failure.message,
              ...(failure.bound === undefined ? {} : { bound: failure.bound }),
            }}
            density="inline"
          />
        </div>
      )}
    </Plate>
  );
}

/** The addressable route. Reached directly, it returns to the document on success. */
export default function LoginRoute(_props: RouteProps): ReactNode {
  return (
    <Drill
      title="Sign in"
      crumbs={[{ to: '/', label: 'Document' }]}
      stamp="a viewer token, issued by the operator on the analyzer host"
    >
      <SignIn onSignedIn={() => navigate('/')} />
    </Drill>
  );
}
