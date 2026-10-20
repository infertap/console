// SPDX-License-Identifier: AGPL-3.0-only
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { IngestBatchEvent, TickAppliedEvent } from '../domain/contract';
import { ApiError } from '../domain/refusal';
import type { DataSource, StreamEvent } from './source';

/**
 * The seam's React binding.
 *
 * Components ask for data and get one of three states. They never see a cookie, a status code, a
 * retry, or a resync: a pass landing mid-session and a stream that could not replay its gap both
 * arrive here as the same instruction, which is refetch.
 */

interface DataContextValue {
  readonly source: DataSource;
  /** Bumped whenever the server says our figures are stale. Every read depends on it. */
  readonly revision: number;
  /** The last ingest burst, for the dark strip. Wall-clock facts, never accounting figures. */
  readonly lastIngest: IngestBatchEvent | null;
  /** How many batches have arrived. The strip flashes per batch, because ingestion is bursty. */
  readonly ingestPulse: number;
  readonly streamState: 'open' | 'retrying' | 'closed';
  /**
   * A pass has completed and the canvas has NOT moved onto it.
   *
   * **Figures advance through the slide-forward affordance and nowhere else.** The surface law
   * puts wall-clock facts on the dark strip and pass-clock accounting on the light canvas, and a
   * canvas that re-rendered itself the instant a pass landed would be moving on the wall clock.
   * So the event is held here and offered, and the reader takes it.
   */
  readonly pendingPass: TickAppliedEvent | null;
  readonly takePendingPass: () => void;
  /**
   * No session, discovered by a read rather than asked of a status oracle.
   *
   * **App-level, not per-panel.** A panel can honestly say a figure is past the raw horizon. No
   * panel can usefully say "you are not signed in", because that is not a fact about the panel:
   * on a genuine first load every read 401s at once, and five plates each correctly reporting
   * the same fact is a worse render than one.
   */
  readonly sessionLost: boolean;
  readonly notifyUnauthenticated: () => void;
  /** Called once a session exists. Clears the state and re-runs every open read. */
  readonly sessionRestored: () => void;
  /** Refetch every open read. Used once a session exists, and after a manual retry. */
  readonly refetch: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

/** Puts one data source and its revision in context: the only way a component reaches the seam. */
export function DataProvider({
  source,
  children,
}: {
  source: DataSource;
  children: ReactNode;
}): ReactNode {
  const [revision, setRevision] = useState(0);
  const [lastIngest, setLastIngest] = useState<IngestBatchEvent | null>(null);
  const [ingestPulse, setIngestPulse] = useState(0);
  const [pendingPass, setPendingPass] = useState<TickAppliedEvent | null>(null);
  const [streamState, setStreamState] = useState<'open' | 'retrying' | 'closed'>('closed');
  const [sessionLost, setSessionLost] = useState(false);

  useEffect(() => {
    return source.events((event: StreamEvent) => {
      switch (event.type) {
        case 'tick_applied':
          // The figures we hold describe an older frontier. **The canvas does not move on this
          // signal.** It is offered on the strip, and the reader takes it; a page that advanced
          // its own numbers under a reader mid-sentence would be moving on the wall clock, which
          // is the boundary the surface law draws.
          setPendingPass(event.data);
          break;
        case 'resync':
          // Different in kind, and it DOES refetch: the server is saying it cannot replay the
          // gap, so what we hold may be wrong rather than merely old. Correcting a possibly
          // wrong figure is not the same act as advancing a correct one.
          setRevision((n) => n + 1);
          break;
        case 'ingest_batch':
          setLastIngest(event.data);
          setIngestPulse((n) => n + 1);
          break;
        case 'open':
          setStreamState('open');
          break;
        case 'closed':
          setStreamState(event.willRetry ? 'retrying' : 'closed');
          break;
      }
    });
  }, [source]);

  const refetch = useCallback(() => setRevision((n) => n + 1), []);
  const notifyUnauthenticated = useCallback(() => setSessionLost(true), []);
  const sessionRestored = useCallback(() => {
    setSessionLost(false);
    setRevision((n) => n + 1);
  }, []);
  const takePendingPass = useCallback(() => {
    setPendingPass(null);
    setRevision((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({
      source,
      revision,
      lastIngest,
      ingestPulse,
      pendingPass,
      takePendingPass,
      streamState,
      sessionLost,
      notifyUnauthenticated,
      sessionRestored,
      refetch,
    }),
    [
      source,
      revision,
      lastIngest,
      ingestPulse,
      pendingPass,
      takePendingPass,
      streamState,
      sessionLost,
      notifyUnauthenticated,
      sessionRestored,
      refetch,
    ],
  );
  return <DataContext value={value}>{children}</DataContext>;
}

function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('DataProvider is missing: nothing can read without the seam');
  return value;
}

/** The data source in context. */
export function useDataSource(): DataSource {
  return useData().source;
}

/**
 * The last ingest batch event and a counter that moves with each one, for the status strip's bursts.
 */
export function useIngestPulse(): {
  last: IngestBatchEvent | null;
  pulse: number;
  state: DataContextValue['streamState'];
} {
  const { lastIngest, ingestPulse, streamState } = useData();
  return { last: lastIngest, pulse: ingestPulse, state: streamState };
}

/**
 * The slide-forward affordance.
 *
 * `pending` is the pass the canvas has not moved onto. `take` moves it. Nothing else in this
 * repo advances an accounting figure, which is what makes the surface law checkable rather than
 * remembered.
 */
export function usePendingPass(): {
  pending: TickAppliedEvent | null;
  take: () => void;
} {
  const { pendingPass, takePendingPass } = useData();
  return { pending: pendingPass, take: takePendingPass };
}

/**
 * A read, in three honest states.
 *
 * `failed` carries the `ApiError` rather than a string, so a panel can distinguish the pass
 * having never run from the engine being unreachable from the operator needing to log in. Those
 * are three different designed renders and collapsing them into "error" is how a product starts
 * lying at its edges.
 */
export type Resource<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'failed'; readonly error: ApiError };

const LOADING = { status: 'loading' } as const;

function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  // A network failure is not a refusal and must not be dressed as one: status 0, no cause.
  return new ApiError(0, undefined, error instanceof Error ? error.message : 'read failed');
}

/**
 * One read, keyed, re-run when the tick moves: loading, ready with its value, or failed with its error.
 */
export function useResource<T>(key: string, load: (source: DataSource) => Promise<T>): Resource<T> {
  const { source, revision, notifyUnauthenticated } = useData();
  /** What this result is a result OF. A read is a claim about one key at one revision. */
  const token = `${key}@${revision}`;
  const [entry, setEntry] = useState<{ token: string; result: Resource<T> } | null>(null);

  // The loader closes over render-scope values, so it is held in a ref and refreshed in an
  // effect rather than during render. The read itself re-runs when its TOKEN changes and never
  // because a callback got a new identity.
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  useEffect(() => {
    let live = true;
    // `Promise.resolve().then(...)` rather than calling the loader directly: a DataSource that
    // throws synchronously is a defect, and this hook is not the place it should surface. The
    // failure still reaches the panel as a failed read, which is what a reader can act on.
    Promise.resolve()
      .then(() => loader.current(source))
      .then((value) => {
        if (live) setEntry({ token, result: { status: 'ready', value } });
      })
      .catch((error: unknown) => {
        if (!live) return;
        const api = asApiError(error);
        // A 401 is not this panel's news. It goes up, once, and the shell renders it.
        if (api.needsSession) notifyUnauthenticated();
        setEntry({ token, result: { status: 'failed', error: api } });
      });
    return () => {
      live = false;
    };
  }, [source, token, notifyUnauthenticated]);

  // Loading is DERIVED from the result not yet matching the token, rather than written into
  // state when the effect starts. One less render, and no state that can disagree with itself.
  return entry?.token === token ? entry.result : LOADING;
}

/**
 * Several reads as one.
 *
 * A section fed by more than one endpoint is ready only when all of them are, and failed as soon
 * as any of them is. Without this, a component would guard each read separately and could end up
 * rendering nothing at all, which on this document means a section quietly vanishing: the exact
 * reflow the one-layout-at-every-age rule forbids.
 */
export function combine<T extends readonly unknown[]>(
  ...resources: { [K in keyof T]: Resource<T[K]> }
): Resource<T> {
  for (const resource of resources) {
    if (resource.status === 'failed') return resource;
  }
  if (resources.some((r) => r.status === 'loading')) return LOADING;
  return {
    status: 'ready',
    value: resources.map((r) => (r as { value: unknown }).value) as unknown as T,
  };
}

/** Force a refetch of every open read. */
export function useRefetchAll(): () => void {
  return useData().refetch;
}

/**
 * The session state, as the shell sees it.
 *
 * There is no `GET /v1/session` and we should not want one: you learn your session state by
 * making a real read, which is the same discipline as every other figure here. A status oracle
 * that can disagree with reality is worse than no oracle.
 */
export function useSession(): { lost: boolean; restored: () => void } {
  const { sessionLost, sessionRestored } = useData();
  return { lost: sessionLost, restored: sessionRestored };
}
