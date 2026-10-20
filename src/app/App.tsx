// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { config, isSynthetic } from '../config';
import { useDataSource } from '../data/react';
import { useIngestPulse, usePendingPass, useResource, useSession } from '../data/react';
import { TestRig } from '../dev/rig';
import { SignIn } from '../features/auth/LoginRoute';
import { Rail } from '../design-system/chrome/Rail';
import { StatusStrip } from '../design-system/chrome/StatusStrip';
import chrome from '../design-system/chrome/Chrome.module.css';
import { Link } from '../design-system/navigation/router';
import { Outlet } from './Outlet';

/**
 * The shell.
 *
 * Rail, one dark strip, and the outlet. It reads `/v1/health` and `/v1/stamp` and nothing else,
 * because those are the strip's own facts: ingest and the meaning pair are chrome, not content.
 * What it must never read is an accounting figure, because a shell that renders one has taken an
 * opinion about what the page is for.
 */
export function App(): ReactNode {
  const session = useSession();
  const stamp = useResource('stamp', (ds) => ds.stamp());
  const health = useResource('health:strip', (ds) => ds.health({}));
  const { pulse, state } = useIngestPulse();
  const { pending, take } = usePendingPass();
  const source = useDataSource();

  return (
    <>
      {/* Dev only, and statically so: `import.meta.env.DEV` is a build-time literal, which is
          what keeps the rig and its corpus out of a production bundle entirely. */}
      {import.meta.env.DEV && isSynthetic(config) && <TestRig />}
      <div className={chrome['app']}>
        <Rail />
        <div className={chrome['main']}>
          {/* The strip renders nothing while there is no session: it carries observed facts,
              and it has not observed any. A stale LIVE would be the worst thing on the page. */}
          {!session.lost && stamp.status === 'ready' && health.status === 'ready' && (
            <StatusStrip
              fleet={stamp.value.stamp.fleet_id}
              stamp={stamp.value.stamp}
              ingest={health.value.data.ingest}
              rawHorizonDays={stamp.value.stamp.raw_horizon.declared_days}
              pulse={pulse}
              streamState={state}
              newDataThrough={pending?.classified_day ?? null}
              onTakeNewData={take}
              onAnalyzeNow={() => source.analyzeNow()}
            />
          )}
          {session.lost ? (
            // One app-level render, not five panels each discovering the same 401. The rail
            // stays visible so the reader can see where they are; it just cannot go anywhere.
            <main style={{ maxWidth: '68rem', margin: '0 auto', padding: '1.5rem 1.25rem' }}>
              <SignIn />
            </main>
          ) : (
          <Outlet
            fallback={
              <main style={{ padding: '2rem 1.25rem' }}>
                <h1>No such address</h1>
                <p>
                  Nothing is published at this address. <Link to="/">Return to the document.</Link>
                </p>
              </main>
            }
          />
          )}
        </div>
      </div>
    </>
  );
}
