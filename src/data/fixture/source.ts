// SPDX-License-Identifier: AGPL-3.0-only
import { placementFor } from './placement';
import type { Age } from '../../config';
import { config } from '../../config';
import type {
  AnnotationBody,
  AnnotationData,
  BandsData,
  BlockHoldersData,
  BlocksData,
  TagsData,
  InstanceDuplicationData,
  PlacementData,
  ReplicationData,
  WhalesData,
  AnalyzeData,
  CoverageData,
  DeliveryData,
  DayData,
  EvidenceData,
  FiguresData,
  HealthData,
  HolderId,
  HoldersData,
  MarkerData,
  MarkersData,
  RosterData,
  StampData,
  Stamped,
  TimelineData,
} from '../../domain/contract';
import type {
  DataSource,
  LensReads,
  SessionApi,
  StreamEvent,
  StreamListener,
  Unsubscribe,
} from '../source';
import * as r from './responses';
import * as w from './world';

/**
 * The corpus, behind the seam.
 *
 * **Nothing here is a mock in the testing sense.** It is the same world the design was reviewed
 * against, rendered as the bytes the contract declares, so a component built against it is built
 * against the API's shapes rather than against a convenience. Swapping in `LiveDataSource` moves
 * no render code, which is the property the whole seam exists to hold.
 *
 * Every figure it returns is synthetic, and the app says so on the page: `isSynthetic(config)`
 * drives the label, and the label is a product requirement rather than a courtesy.
 */
export interface FixtureOptions {
  readonly age?: Age;
  /**
   * Milliseconds between scripted ingest bursts, and between scripted passes.
   *
   * Zero means no timers at all, which is what tests and snapshots use: a corpus that moves on a
   * wall clock cannot be photographed. The app supplies real intervals.
   */
  readonly ingestEveryMs?: number;
  readonly passEveryMs?: number;
}

/**
 * The data source over the scripted corpus: every read answered from the world, every response contract-shaped.
 */
export class FixtureDataSource implements DataSource {
  readonly kind = 'fixture' as const;

  #age: w.AgeScript;
  #listeners = new Set<StreamListener>();
  #timers: ReturnType<typeof setInterval>[] = [];
  #segment = 0;
  #options: FixtureOptions;

  constructor(options: FixtureOptions = {}) {
    this.#options = options;
    this.#age = w.AGE_SCRIPT[options.age ?? config.fixtureAge];
    this.#segment = this.#age.segments;
  }

  /** The mock banner's control. Switching age re-renders the same layout in a different state. */
  setAge(age: Age): void {
    this.#age = w.AGE_SCRIPT[age];
    this.#segment = this.#age.segments;
  }

  /** Rewind to the scripted age, discarding any passes the session has run. */
  reset(): void {
    this.setAge(this.#age.key);
  }

  get age(): w.AgeScript {
    return this.#age;
  }

  /**
   * Wrap a response in its envelope.
   *
   * **Takes a thunk, not a value, so a refusal becomes a rejection rather than a synchronous
   * throw.** The corpus builds responses eagerly, and `requirePass` throws where the API would
   * answer 503. A `DataSource` whose methods can throw before returning a promise does not
   * behave like the network, and a consumer written against it would break the day it met the
   * real thing. This is the seam's whole reason for existing, so it has to be right here.
   */
  #wrap<T>(produce: () => T): Promise<Stamped<T>> {
    try {
      return Promise.resolve({ stamp: r.stampFor(this.#age), data: produce() });
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  stamp(): Promise<Stamped<StampData>> {
    return this.#wrap(() => r.stampDataFor(this.#age));
  }

  figures(query = {}): Promise<Stamped<FiguresData>> {
    return this.#wrap(() => r.figuresFor(this.#age, query));
  }

  /** The pre-contract reads, served by the corpus. The live source leaves this absent. */
  readonly lens: LensReads = {
    attribution: (query) => this.#wrap(() => r.attributionResponseFor(this.#age, query)),
    identityConcentration: (query) =>
      this.#wrap(() => r.identityConcentrationFor(this.#age, query)),
  };

  whales(query = {}): Promise<Stamped<WhalesData>> {
    return this.#wrap(() => r.whalesFor(this.#age, query));
  }

  replication(query = {}): Promise<Stamped<ReplicationData>> {
    return this.#wrap(() => r.replicationFor(this.#age, query));
  }

  instanceDuplication(
    instance: string,
    query = {},
  ): Promise<Stamped<InstanceDuplicationData>> {
    return this.#wrap(() => r.instanceDuplicationFor(this.#age, instance, query));
  }

  figureBands(query = {}): Promise<Stamped<BandsData>> {
    // The corpus's scenario knob rides the rig, not the wire: the real read has one outcome.
    return this.#wrap(() => r.bandsFor(this.#age, query, this.#scenario));
  }

  /** The rig's scenario switch. Corpus state, so it lives on the source like the age does. */
  setScenario(scenario: 'win' | 'reg'): void {
    this.#scenario = scenario;
  }

  #scenario: 'win' | 'reg' = 'win';

  declareAnnotation(body: AnnotationBody): Promise<Stamped<AnnotationData>> {
    return this.#wrap(() => r.recordAnnotationFor(this.#age, body));
  }

  holders(query = {}): Promise<Stamped<HoldersData>> {
    return this.#wrap(() => r.holdersFor(this.#age, query));
  }

  roster(query = {}): Promise<Stamped<RosterData>> {
    return this.#wrap(() => r.rosterFor(this.#age, query));
  }

  coverage(query = {}): Promise<Stamped<CoverageData>> {
    return this.#wrap(() => r.coverageFor(this.#age, query));
  }

  delivery(): Promise<Stamped<DeliveryData>> {
    return this.#wrap(() => r.deliveryFor(this.#age));
  }

  analyzeNow(): Promise<Stamped<AnalyzeData>> {
    return this.#wrap(() => r.analyzeNowFor());
  }

  markers(query = {}): Promise<Stamped<MarkersData>> {
    return this.#wrap(() => r.markersFor(this.#age, query));
  }

  health(): Promise<Stamped<HealthData>> {
    return this.#wrap(() => r.healthFor(this.#age));
  }

  placement(): Promise<Stamped<PlacementData>> {
    return this.#wrap(() => placementFor(this.#age));
  }

  day(day: string, query = {}): Promise<Stamped<DayData>> {
    return this.#wrap(() => r.dayFor(this.#age, day, query));
  }

  marker(id: string): Promise<Stamped<MarkerData>> {
    return this.#wrap(() => r.markerFor(id));
  }

  blocks(query = {}): Promise<Stamped<BlocksData>> {
    return this.#wrap(() => r.blocksFor(this.#age, query));
  }

  tags(): Promise<Stamped<TagsData>> {
    return this.#wrap(() => r.tagsFor(this.#age));
  }

  blockHolders(blockId: string, query = {}): Promise<Stamped<BlockHoldersData>> {
    return this.#wrap(() => r.blockHoldersFor(this.#age, blockId, query));
  }

  holderTimeline(holder: HolderId, query = {}): Promise<Stamped<TimelineData>> {
    return this.#wrap(() => r.timelineFor(this.#age, holder, query));
  }

  evidence(query = {}): Promise<Stamped<EvidenceData>> {
    return this.#wrap(() => r.evidenceFor(this.#age, query));
  }

  readonly session: SessionApi = {
    // The corpus has no auth realm. A fixture that pretended to reject a token would be teaching
    // the login flow a lesson only the live source can actually give it.
    create: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  };

  // ── The scripted stream ────────────────────────────────────────────────────────────────────

  events(listener: StreamListener): Unsubscribe {
    this.#listeners.add(listener);
    listener({ type: 'open' });
    if (this.#listeners.size === 1) this.#startScript();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#stopScript();
    };
  }

  /**
   * Fire a scripted event by hand.
   *
   * The gallery and the tests drive the stream through this rather than through a clock, because
   * a state you can only reach by waiting is a state nobody photographs.
   */
  emit(event: StreamEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  /** One ingest burst. Ingestion is bursty, so the strip renders bursts. */
  emitIngestBatch(): void {
    this.#segment += 1;
    const at = this.#age.atMs;
    this.emit({
      type: 'ingest_batch',
      data: {
        segment: `segment-${String(400 + this.#segment).padStart(4, '0')}.jsonl`,
        records: 186_224,
        span: { domain: 'cache', start_ms: at - 480_000, end_ms: at - 300_000 },
        at_ms: at,
      },
    });
  }

  /**
   * One completed pass.
   *
   * **The corpus advances before the event goes out**, which is what makes the slide-forward a
   * real change in the data rather than an animation over a fixed series. A day that did not
   * exist becomes the live edge, the fourteen-day window and the raw horizon move with it, and
   * every read after this event returns the new frontier because the reads derive from it.
   *
   * This is the event the hero listens for: the figures it holds are stale, and `classified_day`
   * names the window to refetch. It carries the discriminator too, so a parameter change arriving
   * mid-session is visible as a seam rather than as figures that quietly moved.
   */
  emitPassCompleted(): void {
    if (this.#age.passes === 0) {
      // The first pass is the t1 to t2 transition: the document stops saying "no pass has run"
      // and starts saying how much of the window it has covered.
      this.#age = w.AGE_SCRIPT.t2;
    } else {
      this.#age = w.advanced(this.#age);
    }

    const window = w.stampedWindow(this.#age);
    this.emit({
      type: 'tick_applied',
      data: {
        classified_day: w.frontierDay(this.#age),
        window: {
          start_day: window.start,
          end_day: window.end,
          start_ms: w.dayStartMs(window.start),
          end_ms: w.dayStartMs(window.end) + 86_400_000,
        },
        discriminator: w.DISCRIMINATOR_CURRENT,
        semantics_version: w.SEMANTICS_CURRENT,
        at_ms: this.#age.atMs,
      },
    });
  }

  #startScript(): void {
    const ingest = this.#options.ingestEveryMs ?? 0;
    const pass = this.#options.passEveryMs ?? 0;
    if (ingest > 0) this.#timers.push(setInterval(() => this.emitIngestBatch(), ingest));
    if (pass > 0) this.#timers.push(setInterval(() => this.emitPassCompleted(), pass));
  }

  #stopScript(): void {
    for (const t of this.#timers) clearInterval(t);
    this.#timers = [];
  }
}
