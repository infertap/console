// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource } from '../../data/react';
import { Drill } from '../../design-system/layout/Drill';
import { Plate } from '../../design-system/layout/Plate';
import type { RouteProps } from '../../design-system/navigation/router';
import { Refusal } from '../../design-system/refusal/Refusal';
import { StateChip } from '../../design-system/state/StateChip';
import styles from '../../design-system/table/Table.module.css';

/**
 * Level 1: one discontinuity marker, reached by clicking its dagger.
 *
 * **`breaks` is decided server-side and rendered, never inferred.** A consumer getting it wrong
 * would either blend two generations or refuse to compare across a deploy, and both are wrong in
 * ways a reader cannot see. So the page states which kind of marker this is and what follows
 * from it.
 */
export default function MarkerRoute({ params }: RouteProps): ReactNode {
  const id = params['id'] ?? '';
  const marker = useResource(`marker:${id}`, (ds) => ds.marker(id));

  return (
    <Drill
      title={marker.status === 'ready' ? marker.value.data.marker.label : id}
      crumbs={[
        { to: '/', label: 'Dashboard' },
        { to: '/', label: 'Recomputed prefill' },
      ]}
    >
      {marker.status === 'failed' && (
        <Refusal
          refusal={{
            cause: marker.error.cause ?? 'unknown_marker',
            message: marker.error.message,
            ...(marker.error.bound === undefined ? {} : { bound: marker.error.bound }),
          }}
        />
      )}

      {marker.status === 'ready' &&
        (() => {
          const m = marker.value.data.marker;
          return (
            <Plate
              name="Marker"
              definition="seams"
              chip={
                <StateChip
                  state={m.breaks ? 'impaired' : 'fine'}
                  provenance={m.provenance}
                  value={m.breaks ? 'series breaks' : 'series continues'}
                />
              }
              footer={
                m.breaks ? (
                  <>
                    Rows either side of this marker were computed under different rules and are
                    not one quantity. Nothing in this product sums across it, and a comparison
                    spanning it either scopes to one side or refuses.
                  </>
                ) : (
                  <>
                    A fleet change, not a measurement change. The series continues across it and
                    rows either side are one quantity.
                  </>
                )
              }
            >
              <table className={styles['table']}>
                <tbody>
                  <tr>
                    <td style={{ color: 'var(--graphite)' }}>at</td>
                    <td>{new Date(m.at_ms).toISOString().slice(0, 10)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--graphite)' }}>kind</td>
                    <td>{m.kind}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--graphite)' }}>provenance</td>
                    <td>{`${m.provenance}, from ${m.source}`}</td>
                  </tr>
                  {m.from_value && (
                    <tr>
                      <td style={{ color: 'var(--graphite)' }}>from</td>
                      <td>{m.from_value}</td>
                    </tr>
                  )}
                  {m.to_value && (
                    <tr>
                      <td style={{ color: 'var(--graphite)' }}>to</td>
                      <td>{m.to_value}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ color: 'var(--graphite)' }}>origin</td>
                    {/* A baseline names a generation's START, not a transition. Carried
                        explicitly so this renders without inferring it from a null. */}
                    <td>{m.origin ? 'yes, this begins an analysis version' : 'no, this is a transition'}</td>
                  </tr>
                </tbody>
              </table>
            </Plate>
          );
        })()}
    </Drill>
  );
}
