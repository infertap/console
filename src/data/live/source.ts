// SPDX-License-Identifier: AGPL-3.0-only
import { config } from '../../config';
import type {
  AnnotationBody,
  AnnotationData,
  BandsData,
  BandsQuery,
  BlockHoldersData,
  BlockHoldersQuery,
  BlocksData,
  TagsData,
  TagsQuery,
  BlocksQuery,
  ReplicationData,
  ReplicationQuery,
  WhalesData,
  WhalesQuery,
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
  InstanceDuplicationData,
  InstanceDuplicationQuery,
  ResyncEvent,
  RosterData,
  RosterQuery,
  StampData,
  Stamped,
  TimelineData,
  TimelineQuery,
  WindowQuery,
} from '../../domain/contract';
import type { DataSource, SessionApi, StreamListener, Unsubscribe } from '../source';
import { getStamped, postStamped, send, url } from './http';

/**
 * The live seam: the generated route table plus the session cookie, same-origin.
 *
 * Two behaviours live here and nowhere else, because both are transport facts that components
 * must never learn:
 *
 * - **401 is a session fact.** It throws an `ApiError` whose `needsSession` is true, and the app
 *   shell turns that into the login flow. No panel knows what a cookie is.
 * - **Resync is a refetch, not an outage.** The server says it cannot replay the gap; we stay
 *   connected and tell the app to refetch. Every event is a hint and refetching is always
 *   correct, because the API is read-only.
 */
export class LiveDataSource implements DataSource {
  readonly kind = 'live' as const;

  stamp(): Promise<Stamped<StampData>> {
    return getStamped('/v1/stamp');
  }

  figures(query: FiguresQuery = {}): Promise<Stamped<FiguresData>> {
    return getStamped('/v1/figures', {}, query);
  }

  holders(query: HoldersQuery = {}): Promise<Stamped<HoldersData>> {
    return getStamped('/v1/holders', {}, query);
  }

  roster(query: RosterQuery = {}): Promise<Stamped<RosterData>> {
    return getStamped('/v1/roster', {}, query);
  }

  coverage(query: CoverageQuery = {}): Promise<Stamped<CoverageData>> {
    return getStamped('/v1/coverage', {}, query);
  }

  delivery(): Promise<Stamped<DeliveryData>> {
    return getStamped('/v1/delivery');
  }

  analyzeNow(): Promise<Stamped<AnalyzeData>> {
    return postStamped('/v1/analyze');
  }

  markers(query: WindowQuery = {}): Promise<Stamped<MarkersData>> {
    return getStamped('/v1/markers', {}, query);
  }

  health(query: WindowQuery = {}): Promise<Stamped<HealthData>> {
    return getStamped('/v1/health', {}, query);
  }

  placement(query: WindowQuery = {}): Promise<Stamped<PlacementData>> {
    return getStamped('/v1/residual/placement', {}, query);
  }

  whales(query: WhalesQuery = {}): Promise<Stamped<WhalesData>> {
    return getStamped('/v1/residual/whales', {}, query);
  }

  replication(query: ReplicationQuery = {}): Promise<Stamped<ReplicationData>> {
    return getStamped('/v1/residual/replication', {}, query);
  }

  figureBands(query: BandsQuery = {}): Promise<Stamped<BandsData>> {
    return getStamped('/v1/figures/bands', {}, query);
  }

  instanceDuplication(
    instance: string,
    query: InstanceDuplicationQuery = {},
  ): Promise<Stamped<InstanceDuplicationData>> {
    return getStamped('/v1/instances/{instance}/duplication', { instance }, query);
  }

  declareAnnotation(body: AnnotationBody): Promise<Stamped<AnnotationData>> {
    return postStamped('/v1/annotations', body);
  }

  day(day: string, query: DayQuery = {}): Promise<Stamped<DayData>> {
    return getStamped('/v1/days/{day}', { day }, query);
  }

  marker(id: string, query: MarkerQuery = {}): Promise<Stamped<MarkerData>> {
    return getStamped('/v1/markers/{id}', { id }, query);
  }

  blocks(query: BlocksQuery = {}): Promise<Stamped<BlocksData>> {
    return getStamped('/v1/blocks', {}, query);
  }

  tags(query: TagsQuery = {}): Promise<Stamped<TagsData>> {
    return getStamped('/v1/tags', {}, query);
  }

  blockHolders(
    blockId: string,
    query: BlockHoldersQuery = {},
  ): Promise<Stamped<BlockHoldersData>> {
    return getStamped('/v1/blocks/{block_id}/holders', { block_id: blockId }, query);
  }

  holderTimeline(holder: HolderId, query: TimelineQuery = {}): Promise<Stamped<TimelineData>> {
    return getStamped(
      '/v1/holders/{instance}/{dp_rank}/{group_idx}/timeline',
      { instance: holder.instance, dp_rank: holder.dp_rank, group_idx: holder.group_idx },
      query,
    );
  }

  evidence(query: EvidenceQuery = {}): Promise<Stamped<EvidenceData>> {
    return getStamped('/v1/evidence', {}, query);
  }

  readonly session: SessionApi = {
    // A JSON body, not a bearer header. The contract is generated from the handlers.
    create: (token: string) => send('POST', '/v1/session', { token }),
    destroy: () => send('DELETE', '/v1/session'),
  };

  events(listener: StreamListener): Unsubscribe {
    // `EventSource` sends `Last-Event-ID` on reconnect natively, which is exactly the header the
    // daemon's three resync cases are decided against. Hand-rolling the stream would mean
    // re-implementing that and getting it subtly wrong.
    const stream = new EventSource(url('/v1/events'), { withCredentials: true });
    let closed = false;

    stream.addEventListener('open', () => listener({ type: 'open' }));

    stream.addEventListener('tick_applied', (event) => {
      listener({ type: 'tick_applied', data: parse<TickAppliedEvent>(event) });
    });
    stream.addEventListener('ingest_batch', (event) => {
      listener({ type: 'ingest_batch', data: parse<IngestBatchEvent>(event) });
    });
    stream.addEventListener('resync', (event) => {
      listener({ type: 'resync', data: parse<ResyncEvent>(event) });
    });

    stream.addEventListener('error', () => {
      // `EventSource` reconnects on its own unless it is CLOSED. Reporting which of the two this
      // is keeps the strip honest: a reconnecting stream is not the same claim as a dead one.
      const willRetry = stream.readyState !== EventSource.CLOSED;
      if (!willRetry && closed) return;
      listener({ type: 'closed', willRetry });
    });

    return () => {
      closed = true;
      stream.close();
    };
  }
}

function parse<T>(event: Event): T {
  return JSON.parse((event as MessageEvent<string>).data) as T;
}

/** Live mode never runs against fixtures, and this states it rather than assuming it. */
export const liveIsConfigured = (): boolean => config.source === 'live';
