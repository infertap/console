// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource } from '../../data/react';
import { Drill } from '../../design-system/layout/Drill';
import { Figure } from '../../design-system/figure/Figure';
import { count, integer, percent } from '../../design-system/format/numbers';
import { classLabel, rankLabel } from '../../domain/language';
import { Link, type RouteProps } from '../../design-system/navigation/router';
import { Plate } from '../../design-system/layout/Plate';
import { Refusal } from '../../design-system/refusal/Refusal';
import table from '../../design-system/table/Table.module.css';
import styles from './Drill.module.css';

/**
 * Level 1: one UTC day.
 *
 * **The evidence bound is carried, never inferred from an empty drill.** A retention bound is
 * not an absence of activity, so a day past the raw horizon says the horizon stops there rather
 * than showing an empty table that reads as "nothing happened".
 */
export default function DayRoute({ params }: RouteProps): ReactNode {
  const date = params['date'] ?? '';
  const day = useResource(`day:${date}`, (ds) => ds.day(date, { limit: 10 }));

  return (
    <Drill
      title={date}
      crumbs={[
        { to: '/', label: 'Dashboard' },
        { to: '/', label: 'Recomputed prefill' },
      ]}
      stamp={
        day.status === 'ready' ? (
          <>
            one UTC day, rank grain. Event grain is bounded by the raw horizon, which reaches{' '}
            <b>{day.value.data.evidence_bound.raw_from_day ?? 'no records'}</b>
          </>
        ) : undefined
      }
    >
      {day.status === 'failed' && (
        <Refusal
          refusal={{
            cause: day.error.cause ?? 'engine_unavailable',
            message: day.error.message,
            ...(day.error.bound === undefined ? {} : { bound: day.error.bound }),
          }}
        />
      )}

      {day.status === 'ready' && (
        <>
          <Plate name="This day" definition="repeat_compute">
            <div className={styles['split']}>
              {day.value.data.by_class.map((entry) => (
                <div key={entry.class}>
                  <p className={styles['label']} style={{ marginBottom: '0.4rem' }}>
                    {classLabel(entry.class)}
                  </p>
                  <Figure value={entry.tokens} unit="tokens" register="recompute" />
                </div>
              ))}
            </div>
          </Plate>

          <Plate
            name="Ranks on this day"
            definition="holders"
            footer={
              day.value.data.holders_page.total_rows !== null &&
              day.value.data.holders_page.total_rows !== undefined ? (
                <>{count(day.value.data.holders_page.total_rows, 'rank')} stored on this day.</>
              ) : undefined
            }
          >
            {/* One SECTION refuses, never the response: the class split and the evidence bound
                above are unpaged, still valid, and still on the page. */}
            {day.value.data.holders_refused ? (
              <Refusal refusal={day.value.data.holders_refused} density="inline" />
            ) : (
              <table className={table['table']}>
                <thead>
                  <tr>
                    <th>rank</th>
                    <th className={table['num']}>recomputed prefill</th>
                    <th className={table['num']}>share of fleet total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(day.value.data.holders ?? []).map((row) => {
                    const id = `${row.holder.instance}/${row.holder.dp_rank}/${row.holder.group_idx}`;
                    return (
                      <tr className={table['row']} key={id}>
                        <td>
                          <Link
                            className={table['link']}
                            to={`/instance/${encodeURIComponent(row.holder.instance)}/rank/${row.holder.dp_rank}/${row.holder.group_idx}`}
                          >
                            {rankLabel(row.holder, (day.value.data.holders ?? []).some((r) => r.holder.group_idx > 0))}
                          </Link>
                        </td>
                        <td className={table['num']}>{`≥ ${integer(row.tokens.value)}`}</td>
                        <td className={table['num']}>
                          {percent(row.share_of_fleet_total.value, 1)}
                        </td>
                        <td className={table['chev']}>›</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Plate>

          <Plate
            name="Records behind this"
            definition="evidence"
            lead="click descends one level toward evidence, and never sideways into interpretation"
          >
            {day.value.data.evidence_available ? (
              // Records are drilled by holder or by block: a day's records are every block of
              // the day. The day's heaviest holder is the one most readers want first.
              (() => {
                const top = (day.value.data.holders ?? [])[0];
                if (!top) return <>no holder stored on {date}</>;
                const from = Date.parse(`${date}T00:00:00Z`);
                const triple = `${top.holder.instance}/${top.holder.dp_rank}/${top.holder.group_idx}`;
                return (
                  <Link
                    to={`/evidence?holder=${encodeURIComponent(triple)}&window=${from},${from + 86_400_000}`}
                  >
                    open the records of {top.holder.instance} on {date} ›
                  </Link>
                );
              })()
            ) : (
              // Carried rather than inferred: the horizon is a fact about retention, and an
              // empty table here would read as a fact about the fleet.
              <Refusal
                refusal={{
                  cause: 'outside_raw_horizon',
                  message: `event grain is retained about ${day.value.data.evidence_bound.declared_days ?? 0} days, and ${date} is ${day.value.data.evidence_bound.reason ?? 'outside it'}`,
                  bound: day.value.data.evidence_bound,
                }}
                density="inline"
              />
            )}
          </Plate>
        </>
      )}
    </Drill>
  );
}
