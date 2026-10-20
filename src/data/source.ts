// SPDX-License-Identifier: AGPL-3.0-only
import type { SourceKind } from '../config';
import type {
  BlockHoldersData,
  BlockHoldersQuery,
  BlocksData,
  BlocksQuery,
  TagsData,
  TagsQuery,
  AnalyzeData,
  CoverageData,
  DeliveryData,
  CoverageQuery,
  DayData,
  DayQuery,
  PlacementData,
  EvidenceData,
  EvidenceQuery,
  FiguresData,
  FiguresQuery,
  HealthData,
  HolderId,
  HoldersData,
  HoldersQuery,
  IngestBatchEvent,
  MarkerData,
  MarkerQuery,
  MarkersData,
  TickAppliedEvent,
  ResyncEvent,
  RosterData,
  RosterQuery,
  StampData,
  Stamped,
  TimelineData,
  TimelineQuery,
  WhalesData,
  WhalesQuery,
  ReplicationData,
  ReplicationQuery,
  BandsData,
  BandsQuery,
  InstanceDuplicationData,
  InstanceDuplicationQuery,
  AnnotationBody,
  AnnotationData,
  WindowQuery,
} from '../domain/contract';
import type {
  AttributionCard,
  AttributionQuery,
  ConcentrationData,
  ConcentrationQuery,
} from '../domain/lens';

/**
 * The data seam. One interface, two implementations, chosen once at bootstrap.
 *
 * Every server interaction in this product passes through here. That is what makes the rig
 * hookup a configuration change rather than a code change, and it is what a lint enforces:
 * nothing outside `src/data` may name the generated client, call `fetch`, or open an
 * `EventSource`.
 *
 * The method list is the endpoint list is the DAO method list: one law, and it holds across
 * the repo split because both sides read the same contract.
 * 24 paths, 25 operations, at the pin recorded in `contract/PIN.md`.
 */
export interface DataSource {
  readonly kind: SourceKind;

  // ── Level 0, the document ──────────────────────────────────────────────────────────────────

  /** The canonical stamp. Answers before any pass has run, which is the t0 case. */
  stamp(): Promise<Stamped<StampData>>;

  /** The verdict figures, always an array of segments and deliberately without a total. */
  figures(query?: FiguresQuery): Promise<Stamped<FiguresData>>;

  /** Holder-grain rows with the fleet total from the same read as the rows. */
  holders(query?: HoldersQuery): Promise<Stamped<HoldersData>>;

  /** Producer runs and their staleness states. Totals to the run count, never the holder count. */
  roster(query?: RosterQuery): Promise<Stamped<RosterData>>;

  /** Instance-time coverage. Never interchangeable with the token-weighted basis. */
  coverage(query?: CoverageQuery): Promise<Stamped<CoverageData>>;

  /** The delivery ledger, since install: of what the taps produced, what arrived. */
  delivery(): Promise<Stamped<DeliveryData>>;

  /** Kick an incremental analysis now. In-band acknowledgement, accepted or not. */
  analyzeNow(): Promise<Stamped<AnalyzeData>>;

  /** Discontinuity markers. `breaks` is decided server-side. */
  markers(query?: WindowQuery): Promise<Stamped<MarkersData>>;

  /** The trust strip's detail, and the only hydration the dark status strip has at t0. */
  health(query?: WindowQuery): Promise<Stamped<HealthData>>;


  /** Where the same content sat, by pair. Its own register, summed with neither other. */
  placement(query?: WindowQuery): Promise<Stamped<PlacementData>>;

  /**
   * The heaviest duplicated identities: the placement family's integral, cut by identity.
   * Carries the window's duplicated and held totals, so the placement anchor's fraction reads
   * from the same response as the rows it summarises.
   */
  whales(query?: WhalesQuery): Promise<Stamped<WhalesData>>;

  /**
   * The copies histogram: duplicated token-time by simultaneous copy count, in the panel's own
   * window tongue (`14d`/`48h`/`3h` anchored to the emission frontier, absolute for custom),
   * cut by workload. One response carries the rows, the members table, the remedy split and
   * the exact mean-copies pair, so the panel and its anchor cannot disagree.
   */
  replication(query?: ReplicationQuery): Promise<Stamped<ReplicationData>>;

  /**
   * The thrash lens: banded recompute mass, the cut riding `dims`, and the gap-unobserved mass
   * as its own figure beside the bands, never one of them. The panel stops `14d`/`48h`/`3h`
   * resolve server-side through the same window authority as the copies read, so the page's
   * two zoom charts cannot disagree about which hours exist. Minute grain serves within the
   * tier's measured reach at the fleet, workload, model and instance cuts and under an
   * instance or holder scope (the rank-grain cells); the holder cut refuses it by
   * name, a window past reach refuses with its bound, and both refusals render.
   */
  figureBands(query?: BandsQuery): Promise<Stamped<BandsData>>;

  /**
   * One node's INTERNAL duplication: mass it held more than once inside itself, split into
   * the across-ranks half (the one with a routing lever) and the cache-groups half (a hybrid
   * model's architecture, never rendered as waste). Cross-engine mass is absent by
   * construction — it belongs to no single node — and `cannot_tell_you` says so.
   */
  instanceDuplication(
    instance: string,
    query?: InstanceDuplicationQuery,
  ): Promise<Stamped<InstanceDuplicationData>>;

  /**
   * Record a declared deployment: a label and an instant, per fleet. The acknowledgement
   * states its durability rather than implying it: `durable: false` means row-only, and the
   * marker will not survive a rebuild from the bucket.
   */
  declareAnnotation(body: AnnotationBody): Promise<Stamped<AnnotationData>>;


  // ── Level 1, drill ─────────────────────────────────────────────────────────────────────────

  /** One UTC day. */
  day(day: string, query?: DayQuery): Promise<Stamped<DayData>>;

  /** One marker, reached by clicking its dagger. */
  marker(id: string, query?: MarkerQuery): Promise<Stamped<MarkerData>>;

  /** Each day's blocks by stored mass, every figure a bound. */
  blocks(query?: BlocksQuery): Promise<Stamped<BlocksData>>;

  /** The declared tags grouped over the window, with exposure and both figures. */
  tags(query?: TagsQuery): Promise<Stamped<TagsData>>;

  /** Which holders stored one block, and when. Event grain. */
  blockHolders(blockId: string, query?: BlockHoldersQuery): Promise<Stamped<BlockHoldersData>>;

  /** One holder's store timeline. */
  holderTimeline(holder: HolderId, query?: TimelineQuery): Promise<Stamped<TimelineData>>;

  // ── Level 2, evidence ──────────────────────────────────────────────────────────────────────

  /** Terminal, raw-window-bounded. There is nothing beneath it. */
  evidence(query?: EvidenceQuery): Promise<Stamped<EvidenceData>>;

  // ── Pre-contract reads ─────────────────────────────────────────────────────────────────────

  /**
   * Reads whose endpoints do not exist yet, built fixture-first against the shapes proposed in
   * `domain/lens.ts`.
   *
   * **Optional is the design, not a shortcut.** The fixture source implements them; the live
   * source leaves them absent until the analyzer lands the endpoints, and a panel whose read is
   * absent renders its awaiting-endpoint state. This is what lets a panel exist on the page
   * before its data does, without a feature ever importing the corpus directly: the corpus
   * stays behind the seam, reachable only through the rig, and the bundle audit stays green.
   */
  readonly lens?: LensReads;

  // ── Auth and stream ────────────────────────────────────────────────────────────────────────

  readonly session: SessionApi;

  /**
   * Subscribe to the event stream. Returns the unsubscribe.
   *
   * Every event is a hint to refetch and nothing here is a figure. A resync is delivered as an
   * event rather than swallowed, because the server never pretends to have replayed what it does
   * not hold and neither may we.
   */
  events(listener: StreamListener): Unsubscribe;
}

/** The reads with no endpoint yet. Each method retires into the contract section when its
 * endpoint lands, and the panels that call it move no render code. What remains is the scoped
 * attribution card, which the live card computes from two contract reads and the fixture
 * scripts whole (both registers, every scope, both scenarios). */
export interface LensReads {
  /** The before/after card around a marker, in the operator's scope lens. */
  attribution(query: AttributionQuery): Promise<Stamped<AttributionCard>>;
  /**
   * Identity concentration for one slice and one window: was it one block coming back over
   * and over, or many different ones. Proposed as scope params plus totals on `/v1/blocks`;
   * the drill renders awaiting-endpoint in live mode until it lands.
   */
  identityConcentration(query: ConcentrationQuery): Promise<Stamped<ConcentrationData>>;
}

export interface SessionApi {
  /**
   * Exchange the plaintext token for a session cookie.
   *
   * A JSON body, not an `Authorization` header. The contract is generated from the handlers and
   * says body, and the contract is what this code follows.
   */
  create(token: string): Promise<void>;
  destroy(): Promise<void>;
}

// ── The event stream ─────────────────────────────────────────────────────────────────────────

/**
 * Frames, as the contract schematises their payloads.
 *
 * `open` and `closed` are ours: transport state the stream itself cannot carry, so the dark strip
 * can render an honest idle rather than a stale LIVE. Everything else comes from the document.
 */
export type StreamEvent =
  /** A pass emitted. The cached figures are stale and this names the window to refetch. */
  | { readonly type: 'tick_applied'; readonly data: TickAppliedEvent }
  /** Wall-clock ingest, for the dark strip. No accounting figure rides this stream. */
  | { readonly type: 'ingest_batch'; readonly data: IngestBatchEvent }
  /**
   * The stream cannot replay the gap and says so. Refetch and rejoin; do not assume continuity.
   * Handled inside the data layer, invisible to components. A new `epoch` additionally means the
   * analyzer restarted, so the session died at the same instant.
   */
  | { readonly type: 'resync'; readonly data: ResyncEvent }
  | { readonly type: 'open' }
  | { readonly type: 'closed'; readonly willRetry: boolean };

export type StreamListener = (event: StreamEvent) => void;
export type Unsubscribe = () => void;
