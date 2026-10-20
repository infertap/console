// SPDX-License-Identifier: AGPL-3.0-only
import type { ApiErrorBody, Cause, Refusal } from './contract';

/**
 * The closed cause set, as a runtime value.
 *
 * Upstream this is generated from `error::Cause::all()` — the same slice the error path switches
 * on — so the document cannot list a cause the code lacks. Here it is transcribed once, and
 * `test/contract-parity.test.ts` asserts this array equals the spec's enum exactly. A cause the
 * analyzer adds therefore fails our build rather than falling through a `default:` into a shrug,
 * and a cause it removes fails too rather than leaving a designed state nothing can reach.
 *
 * `satisfies readonly Cause[]` makes the type check one way and the parity test checks the
 * other: TypeScript catches a word we invented, the test catches a word we missed.
 */
export const CAUSES = [
  'unauthenticated',
  'session_expired',
  'unknown_holder',
  'unknown_block',
  'unknown_marker',
  'subject_missing',
  'request_invalid',
  'window_invalid',
  'limit_invalid',
  'dim_unknown',
  'grain_unavailable',
  'outside_raw_horizon',
  'superseded_semantics',
  'unlinked_generation',
  'cursor_stale',
  'engine_unavailable',
  'console_not_configured',
  'unknown_route',
  'annotation_invalid',
  'bucket_unavailable',
] as const satisfies readonly Cause[];

const KNOWN = new Set<string>(CAUSES);

/**
 * Narrow a cause word that arrived at runtime.
 *
 * The generated types say this is always one of the 20. The wire is not the type: a daemon newer
 * than our pin can name a cause this bundle has never heard of, and the honest answer there is
 * to say so rather than to render a designed state for the wrong reason.
 */
export function asCause(raw: string): Cause | null {
  return KNOWN.has(raw) ? (raw as Cause) : null;
}

/**
 * A refusal, narrowed for rendering.
 *
 * `cause` is `null` only where the server named something outside the closed set, which is a
 * contract break rather than a user-facing state and renders as one: the message still shows,
 * and the chrome says the cause was not recognised instead of guessing a design for it.
 */
export interface NarrowedRefusal {
  readonly cause: Cause | null;
  readonly rawCause: string;
  readonly message: string;
  /**
   * The facts that make the refusal actionable: the horizon, the marker, the generation.
   *
   * Absent only where the cause is self-describing, never because nobody supplied it. A refusal
   * which does not state its bound is the vague 404 the refusal scheme exists to prevent, and
   * the in-band shape carries it.
   */
  readonly bound?: unknown;
  /**
   * What was asked for, echoed back.
   *
   * The same pair the 4xx `Error` body carries, so a refusal reads identically whichever path it
   * arrived on. Absent unless the producer set it.
   */
  readonly requested?: unknown;
}

export function narrow(refusal: Refusal): NarrowedRefusal {
  return {
    cause: asCause(refusal.cause),
    rawCause: refusal.cause,
    message: refusal.message,
    ...(refusal.bound === undefined ? {} : { bound: refusal.bound }),
    ...(refusal.requested === undefined ? {} : { requested: refusal.requested }),
  };
}

/**
 * A transport-level failure: a status the API decided rather than a bounded refusal it returned.
 *
 * The split is the read API's. A well-formed request whose answer a data bound prevents is
 * a 200 with `data.refused`, and that is a result the document renders in place. This class is
 * for the rest: no session, a malformed request, a subject that never existed, an engine that is
 * not there.
 */
export class ApiError extends Error {
  readonly status: number;
  /** Overrides `Error.cause`, which is `unknown`: here it is one of the closed set or null. */
  override readonly cause: Cause | null;
  readonly rawCause: string;
  readonly bound: unknown;
  readonly requested: unknown;

  /**
   * A 200 whose stamp says no pass has classified a day yet, on a read whose data a pass
   * produces. **Not a wire cause:**
   * a relative window no longer needs a pass to exist, so `no_pass_yet` left the closed set
   * and the fact moved to the stamp (`pass.frontier_day` null). The data layer turns that
   * fact into this state so every panel keeps its "fills with the first pass" copy.
   */
  readonly notYetPassed: boolean;

  constructor(
    status: number,
    body: ApiErrorBody | undefined,
    fallback: string,
    notYetPassed = false,
  ) {
    super(body?.message ?? fallback);
    this.name = 'ApiError';
    this.status = status;
    this.rawCause = body?.cause ?? '';
    this.cause = body ? asCause(body.cause) : null;
    this.bound = body?.bound;
    this.requested = body?.requested;
    this.notYetPassed = notYetPassed;
  }

  /** The t0 state, derived from a stamp rather than received as a cause. */
  static notYetPassed(): ApiError {
    return new ApiError(
      200,
      undefined,
      'no pass has classified a day yet: the stamp carries no frontier',
      true,
    );
  }

  /** No session, or one the daemon forgot when it restarted. Both mean: log in again. */
  get needsSession(): boolean {
    return this.cause === 'unauthenticated' || this.cause === 'session_expired';
  }

  /**
   * The pass has never run, or the engine is unreachable.
   *
   * Never a zero, and never an error the operator caused. This is the t0 page state: the
   * document renders its one layout with every section stating why it is not yet a number.
   * The first half is a stamp fact now (`notYetPassed`), the second a wire cause.
   */
  get isNotYetMeasured(): boolean {
    return this.notYetPassed || this.cause === 'engine_unavailable';
  }
}
