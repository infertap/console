// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The world, rendered as the bytes the API would send.
 *
 * **Contract-shaped, not mock-shaped.** Every response here is validated against
 * `contract/openapi.json`'s schemas by `test/fixture-parity.test.ts`, which asserts the spec's
 * schemas validate the fixture bytes. It was vacuous before per-path schemas existed. It is not
 * vacuous now.
 *
 * Where the contract and the mockups disagree the contract wins, and the disagreement is
 * recorded in `docs/decisions.md` rather than smoothed over.
 *
 * One file per endpoint family; `shared.ts` holds the stamp, the figure, the day masses and
 * buckets, pagination and the scope slice that every builder uses.
 */

export { figure, stampFor, stampDataFor } from './shared';
export { figuresFor } from './figures';
export { holdersFor, blocksFor, tagsFor, blockHoldersFor, timelineFor } from './holders';
export { rosterFor, coverageFor, deliveryFor, analyzeNowFor, healthFor } from './health';
export { markersFor, attributionResponseFor, recordAnnotationFor, markerFor } from './markers';
export { identityConcentrationFor, replicationFor, instanceDuplicationFor, whalesFor } from './replication';
export { bandsFor } from './bands';
export { dayFor, evidenceFor } from './evidence';
