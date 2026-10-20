// SPDX-License-Identifier: AGPL-3.0-only
/** Declared deployments and their attribution: the markers, a marker's card, a recorded annotation. */
import * as w from '../world';
import type {
  AnnotationBody,
  AnnotationData,
  MarkerData,
  MarkerJson,
  MarkersData,
} from '../../../domain/contract';
import type { AttributionCard, AttributionQuery } from '../../../domain/lens';
import { ApiError } from '../../../domain/refusal';
import { attributionFor } from '../ledger';
import { errorBody, requirePass, windowDays } from './shared';

function markerJson(seam: w.Seam): MarkerJson {
  return {
    id: seam.id,
    at_ms: w.dayStartMs(seam.at),
    breaks: seam.breaks,
    kind: seam.kind,
    label: seam.label,
    origin: false,
    provenance: seam.provenance,
    source: seam.provenance === 'observed' ? 'record stream' : 'annotations',
    from_value: seam.from,
    to_value: seam.to,
  };
}

/** `/v1/markers`: the declared deployments and recorded seams inside the window. */
export function markersFor(age: w.AgeScript, query: { window?: string } = {}): MarkersData {
  const days = windowDays(query.window, w.TREND_DAYS);
  const from = w.frontierIndex(age) - days + 1;
  // Declared deployments ride the same read as the seams: one marker vocabulary, two
  // provenances. A deploy carries its minute-precision instant and never breaks the series.
  const deploys: MarkerJson[] = w.DEPLOYS.filter(
    (d) => w.dayIndex(new Date(d.atMs).toISOString().slice(0, 10)) >= from,
  ).map((d) => ({
    id: d.id,
    at_ms: d.atMs,
    breaks: false,
    kind: 'deploy',
    label: d.label,
    origin: false,
    provenance: 'recorded',
    source: 'annotations',
    from_value: d.from,
    to_value: d.to,
  }));
  return { markers: [...w.SEAMS.filter((s) => s.day >= from).map(markerJson), ...deploys] };
}

/** The scoped attribution card, age-gated exactly as the contract reads are. */
export function attributionResponseFor(
  age: w.AgeScript,
  query: AttributionQuery,
): AttributionCard {
  requirePass(age);
  return attributionFor(query);
}

/**
 * A declared deployment, acknowledged. The fixture records row-only and says so: `durable` is
 * the honesty field, and a corpus with no bucket attached must not pretend its markers survive
 * a rebuild. An empty label refuses with its own cause, because a marker with no words marks
 * nothing.
 */
export function recordAnnotationFor(age: w.AgeScript, body: AnnotationBody): AnnotationData {
  requirePass(age);
  if (body.label.trim().length === 0) {
    throw new ApiError(
      400,
      errorBody('annotation_invalid', 'the label is empty after trimming'),
      'the label is empty after trimming',
    );
  }
  return {
    recorded: true,
    durable: false,
    note: 'recorded row-only: no bucket is attached, so this marker will not survive a rebuild',
  };
}

/**
 * `/v1/markers/{id}`: one marker with its before-and-after card, or a refusal where it breaks the series.
 */
export function markerFor(id: string): MarkerData {
  const seam = w.SEAMS.find((s) => s.id === id);
  if (!seam) {
    throw new ApiError(
      404,
      errorBody('unknown_marker', `no marker ${id} in this fleet's annotation stream`, {
        known_markers: w.SEAMS.map((s2) => s2.id),
      }),
      'unknown marker',
    );
  }
  return { marker: markerJson(seam) };
}

