// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource } from '../../data/react';
import { integer } from '../../design-system/format/numbers';
import { Drill } from '../../design-system/layout/Drill';
import { Plate } from '../../design-system/layout/Plate';
import { classLabel, rankLabel, readFromLabel } from '../../domain/language';
import { Link, type RouteProps } from '../../design-system/navigation/router';
import { Refusal } from '../../design-system/refusal/Refusal';
import table from '../../design-system/table/Table.module.css';

/**
 * Level 1: one block, and which holders stored it.
 *
 * **`holders_stored`, never `holders_resident`.** This counts holders that stored the block at
 * some point in the window, not holders that held it at one instant. A block that moved around
 * the fleet counts high here and low under a co-residency test, and only the capacity register
 * answers the second question.
 */
export default function BlockRoute({ params }: RouteProps): ReactNode {
  const id = params['id'] ?? '';
  const block = useResource(`block:${id}`, (ds) => ds.blockHolders(id, { limit: 30 }));
  // Where the rows came from: a request that left the box took seconds,
  // and the stamp says so; the box answering from its own partitions says nothing.
  const origin = block.status === 'ready' ? readFromLabel(block.value.data.read_from) : null;

  return (
    <Drill
      title={id}
      crumbs={[
        { to: '/', label: 'Dashboard' },
        { to: '/fleet', label: 'Fleet' },
      ]}
      stamp={
        block.status === 'ready' ? (
          <>
            which ranks stored this block, and when. Event grain, reaching back to{' '}
            <b>{block.value.data.bound.raw_from_day ?? 'no records'}</b>
            {origin !== null && <>, {origin}</>}
          </>
        ) : undefined
      }
    >
      {block.status === 'ready' && (
        <Plate
          name="Ranks that stored this block"
          definition="evidence"
          footer={
            <>
              Ranks that STORED it over the window, not ranks that held it at one instant. A
              block that moved around the fleet counts high here and low under Duplicate KV
              footprint. <Link to={`/evidence?block=${encodeURIComponent(id)}`}>records behind this ›</Link>
            </>
          }
        >
          {block.value.data.refused ? (
            <Refusal refusal={block.value.data.refused} density="inline" />
          ) : (
            <table className={table['table']}>
              <thead>
                <tr>
                  <th>rank</th>
                  <th>at</th>
                  <th>class</th>
                  <th className={table['num']}>tokens</th>
                </tr>
              </thead>
              <tbody>
                {(block.value.data.rows ?? []).map((row, i) => (
                  <tr className={table['row']} key={`${row.holder.instance}-${i}`}>
                    <td>
                      <Link
                        className={table['link']}
                        to={`/instance/${encodeURIComponent(row.holder.instance)}/rank/${row.holder.dp_rank}/${row.holder.group_idx}`}
                      >
                        {rankLabel(row.holder, (block.value.data.rows ?? []).some((r) => r.holder.group_idx > 0))}
                      </Link>
                    </td>
                    <td>{new Date(row.at_ms).toISOString().slice(11, 19)}Z</td>
                    <td>{classLabel(row.class)}</td>
                    <td className={table['num']}>{integer(row.n_tokens)}</td>
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
