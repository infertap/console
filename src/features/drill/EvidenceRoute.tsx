// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource } from '../../data/react';
import { Drill } from '../../design-system/layout/Drill';
import { integer, percent } from '../../design-system/format/numbers';
import { classLabel, readFromLabel } from '../../domain/language';
import { useQueryParam, type RouteProps } from '../../design-system/navigation/router';
import { Plate } from '../../design-system/layout/Plate';
import { Refusal } from '../../design-system/refusal/Refusal';
import styles from '../../design-system/table/Table.module.css';

/**
 * Level 2: evidence. **Terminal. There is nothing beneath it.**
 *
 * The individual store records a figure was computed from, at event grain, bounded by the raw
 * horizon. A drill past that horizon returns nothing and says so with its bound, because the
 * reader has descended three times to get here and deserves to know whether they found an empty
 * day or the edge of what is retained.
 */
export default function EvidenceRoute(_props: RouteProps): ReactNode {
  const [block] = useQueryParam('block');
  const [holder] = useQueryParam('holder');
  const [window] = useQueryParam('window');
  const subject = block ?? holder ?? '';
  // The clicked bucket's span, where a chart sent the reader here: event grain as an index
  // lookup rather than a paged scroll.
  const span = /^(\d+),(\d+)$/.exec(window ?? '');
  const spanLabel =
    span?.[1] && span[2]
      ? `${new Date(Number(span[1])).toISOString().slice(0, 16).replace('T', ' ')}Z → ${new Date(Number(span[2])).toISOString().slice(11, 16)}Z`
      : null;
  const holderInstance = holder?.split('/')[0] ?? '';

  const evidence = useResource(
    `evidence:${block ?? ''}:${holder ?? ''}:${window ?? ''}`,
    (ds) =>
      ds.evidence({
        ...(block ? { block } : {}),
        ...(holder ? { holder } : {}),
        ...(window ? { window } : {}),
        limit: 24,
      }),
  );
  // Where the rows came from: a block re-derived from the log, or a holder's ring.
  const origin = evidence.status === 'ready' ? readFromLabel(evidence.value.data.read_from) : null;

  return (
    <Drill
      terminal
      title={`Records behind ${subject || 'this'}`}
      crumbs={[
        { to: '/', label: 'Dashboard' },
        ...(block ? [{ to: `/block/${block}`, label: block }] : []),
        ...(holder
          ? [{ to: `/instance/${encodeURIComponent(holderInstance)}`, label: holderInstance }]
          : []),
      ]}
      stamp={
        evidence.status === 'ready' ? (
          <>
            event grain, raw window bounded.
            {spanLabel !== null && (
              <>
                {' '}
                Scoped to <b>{spanLabel}</b>, the clicked bucket&#8217;s own span.
              </>
            )}{' '}
            Retained about <b>{evidence.value.data.reach.declared_days ?? 0} days</b>, reaching
            back to <b>{evidence.value.data.reach.raw_from_day ?? 'no records'}</b>
            {origin !== null && <>, {origin}</>}
          </>
        ) : undefined
      }
    >
      {evidence.status === 'ready' && (
        <Plate name="Store records" definition="evidence">
          {evidence.value.data.refused ? (
            <Refusal refusal={evidence.value.data.refused} />
          ) : (
            <table className={styles['table']}>
              <thead>
                <tr>
                  <th>at</th>
                  <th>block</th>
                  <th className={styles['num']}>tokens</th>
                  <th>class</th>
                  <th className={styles['num']}>coverage</th>
                </tr>
              </thead>
              <tbody>
                {(evidence.value.data.records ?? []).map((record, i) => (
                  <tr key={`${record.block_id}-${i}`}>
                    <td>{new Date(record.at_ms).toISOString().slice(11, 19)}Z</td>
                    <td>{record.block_id}</td>
                    {/* A single row's mass is a column the analysis wrote, not an aggregate
                        this layer derived, which is why it carries no bound glyph. */}
                    <td className={styles['num']}>{integer(record.n_tokens)}</td>
                    <td>{classLabel(record.class)}</td>
                    <td className={styles['num']}>{percent(record.coverage, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Plate>
      )}
    </Drill>
  );
}
