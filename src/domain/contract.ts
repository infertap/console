// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The contract, under domain names.
 *
 * This is the ONLY file outside `src/data` that names the generated client. Everything else
 * imports from here, so regenerating `api.d.ts` against a newer spec surfaces as type errors in
 * one place with a name attached, rather than as a scatter of red across the features.
 *
 * Generated from `contract/openapi.json`, which is vendored from the analyzer at the commit
 * recorded in `contract/PIN.md`. Do not edit either by hand.
 */
import type { components, operations } from '../data/generated/api';

type S = components['schemas'];

// ── The envelope ─────────────────────────────────────────────────────────────────────────────

/** Every 200 in this API is a stamp and a data body. Nothing arrives unstamped. */
export interface Stamped<T> {
  readonly stamp: Stamp;
  readonly data: T;
}

/**
 * The tick a response describes: the edges the last applied tick reached. Each is null before
 * a tick has stated it, which is the t0 state rather than a missing value.
 */
export type TickJson = S['Stamp']['tick'];

export type Stamp = S['Stamp'];

export type WindowJson = S['WindowJson'];

// ── The figure ───────────────────────────────────────────────────────────────────────────────

/**
 * A measured quantity. All four fields are always present, in the Rust type, on the wire and
 * here, which is what makes a naked number unrenderable rather than merely discouraged.
 */
export type Figure = S['Figure'];

// ── Response bodies, by endpoint family ──────────────────────────────────────────────────────

export type FiguresData = S['FiguresData'];
export type Segment = S['Segment'];
export type Bucket = S['Bucket'];
export type DimValue = S['DimValue'];

export type CoverageStatement = S['CoverageStatement'];

export type HoldersData = S['HoldersData'];
export type HolderRow = S['HolderRow'];
export type HolderId = S['HolderId'];
export type Page = S['Page'];

export type RosterData = S['RosterData'];
export type RunRow = S['RunRow'];
export type ClipScope = S['ClipScope'];

export type CoverageData = S['CoverageData'];
export type CoverageRow = S['CoverageRow'];

export type AnalyzeData = S['AnalyzeData'];
export type DeliveryData = S['DeliveryData'];
export type DeliveryTotals = S['DeliveryTotals'];
export type DeliveryRow = S['DeliveryRow'];

export type MarkersData = S['MarkersData'];
export type MarkerJson = S['MarkerJson'];

export type HealthData = S['HealthData'];
export type IngestJson = S['IngestJson'];
export type DegradationJson = S['DegradationJson'];
export type ModelCounts = S['ModelCounts'];
export type SpanJson = S['SpanJson'];

export type DayData = S['DayData'];
export type DayHolder = S['DayHolder'];
export type ClassMass = S['ClassMass'];
export type ReachJson = S['ReachJson'];

export type EvidenceData = S['EvidenceData'];
export type EvidenceRecord = S['EvidenceRecord'];


export type PlacementData = S['PlacementData'];
export type PlacementRow = S['PlacementRow'];
export type WithinEngineRow = S['WithinEngineRow'];

export type BlocksData = S['BlocksData'];
export type TagsData = S['TagsData'];
export type BlockRow = S['BlockRow'];
export type BlockHoldersData = S['BlockHoldersData'];
export type BlockHolderRow = S['BlockHolderRow'];

export type TimelineData = S['TimelineData'];
export type TimelineRow = S['TimelineRow'];

export type MarkerData = S['MarkerData'];

export type WhalesData = S['WhalesData'];
export type WhaleJson = S['WhaleJson'];

export type ReplicationData = S['ReplicationData'];
export type CopiesBucketJson = S['CopiesBucketJson'];
export type CopiesMemberJson = S['CopiesMemberJson'];

export type BandsData = S['BandsData'];
export type BandRowJson = S['BandRowJson'];

export type InstanceDuplicationData = S['InstanceDuplicationData'];
export type InstanceDupRowJson = S['InstanceDupRowJson'];

export type AnnotationBody = S['AnnotationBody'];
export type AnnotationData = S['AnnotationData'];

export type StampData = S['StampData'];

// ── The event stream ─────────────────────────────────────────────────────────────────────────

/**
 * The `data:` payload of each frame kind.
 *
 * In the contract. The frame grammar itself stays prose because OpenAPI
 * cannot describe one, but the payloads are the part with fields to rename, so these are
 * generated and the canary watches them like everything else.
 */
export type TickAppliedEvent = S['TickAppliedEvent'];
export type IngestBatchEvent = S['IngestBatchEvent'];
export type ResyncEvent = S['ResyncEvent'];

// ── Refusals and errors ──────────────────────────────────────────────────────────────────────

/**
 * An in-band refusal: a bounded question the meter declines to answer, returned with a 200
 * because a refusal is a result rather than a failure.
 *
 * Carries the closed cause set and a `bound`. `<Refusal>` is a designed render over the cause set, so
 * the component is typed against the enum directly and a cause the analyzer adds is a compile
 * error here rather than a blank chip.
 *
 * `bound` is deliberately untyped: what makes a refusal actionable differs by cause, and it is
 * absent only where the cause is self-describing.
 */
export type Refusal = S['Refusal'];

/** The out-of-band error body. Same cause vocabulary as the in-band refusal. */
export type ApiErrorBody = S['Error'];

/**
 * The closed cause set, generated upstream from `error::Cause::all()` — the same slice the error
 * path switches on — so the document cannot list a cause the code lacks or omit one it has.
 */
export type Cause = S['Cause'];

// ── Query vocabularies, closed by the contract ───────────────────────────────────────────────

export type Grain = NonNullable<NonNullable<operations['listFigures']['parameters']['query']>['grain']>;
export type CoverageBy = NonNullable<NonNullable<operations['listCoverage']['parameters']['query']>['by']>;
export type Dim = NonNullable<NonNullable<operations['listFigures']['parameters']['query']>['dims']>[number];
export type HolderClass = NonNullable<NonNullable<operations['listHolders']['parameters']['query']>['class']>;

/**
 * Query shapes, as the contract declares them.
 *
 * Pagination is an opaque `cursor` bound to the stamp that minted it, on holders, roster and
 * evidence. A page is therefore a claim about one tick: presented against a newer one it is
 * refused with `cursor_stale` rather than silently answering about different rows. `limit` caps
 * at 200, and `Page.next_cursor` is null on the last page and only there.
 *
 * At the v1 envelope one page usually holds the table, which is exactly why the paging path
 * needs exercising rather than assuming: a path nobody walks is a path that breaks quietly when
 * the envelope lifts. The fixture corpus pages at `limit = 1` for that reason.
 */
export type FiguresQuery = NonNullable<operations['listFigures']['parameters']['query']>;
export type HoldersQuery = NonNullable<operations['listHolders']['parameters']['query']>;
export type CoverageQuery = NonNullable<operations['listCoverage']['parameters']['query']>;
export type EvidenceQuery = NonNullable<operations['listEvidence']['parameters']['query']>;
export type RosterQuery = NonNullable<operations['listRoster']['parameters']['query']>;
export type WindowQuery = NonNullable<operations['listMarkers']['parameters']['query']>;
export type DayQuery = NonNullable<operations['getDayDetail']['parameters']['query']>;
export type BlocksQuery = NonNullable<operations['listBlocks']['parameters']['query']>;
export type TagsQuery = NonNullable<operations['listTags']['parameters']['query']>;
export type BlockHoldersQuery = NonNullable<operations['listBlockHolders']['parameters']['query']>;
export type WhalesQuery = NonNullable<operations['getWhales']['parameters']['query']>;
export type ReplicationQuery = NonNullable<operations['getReplication']['parameters']['query']>;
export type BandsQuery = NonNullable<operations['getBands']['parameters']['query']>;
export type TimelineQuery = NonNullable<operations['getHolderTimeline']['parameters']['query']>;
export type MarkerQuery = NonNullable<operations['getMarker']['parameters']['query']>;
export type InstanceDuplicationQuery = NonNullable<
  operations['getInstanceDuplication']['parameters']['query']
>;
