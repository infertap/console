// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource, type Resource } from '../../data/react';
import type { FiguresData, HoldersData, RosterData, RunRow, Stamped } from '../../domain/contract';
import { DEFAULT_WINDOW, stopLabel } from '../../domain/windows';
import { compact, count, integer, percent } from '../../design-system/format/numbers';
import { InfoHover } from '../../design-system/info/InfoHover';
import { memberRates, rate } from './rates';
import { Block } from '../../design-system/layout/Block';
import { Drill } from '../../design-system/layout/Drill';
import { Link, type RouteProps } from '../../design-system/navigation/router';
import { Refusal } from '../../design-system/refusal/Refusal';
import table from '../../design-system/table/Table.module.css';
import styles from './Entity.module.css';

/**
 * The fleet browse: the facet hierarchy's front door.
 *
 * fleet → workload → instance → rank reads down this one page: the workloads as a strip of
 * chips on top (collapsing to a sentence where the fleet carries one, which is the default
 * first-run state), the instance index beneath, worst rate first because that is the order a
 * diagnosis walks. Every row is a door; the figures are the same ratios the entity pages
 * headline, so the browse and the destination cannot disagree.
 *
 * The model stays facets, not a tree: the strip and the index are two cuts of one fleet, and
 * nothing here asserts a containment the data cannot guarantee.
 */


/** Level 1: the fleet, the front door of the facet hierarchy. */
export default function FleetRoute(_props: RouteProps): ReactNode {
  const workloads = useResource('fleet:workloads', (ds) =>
    ds.figures({ window: DEFAULT_WINDOW, grain: 'day', dims: ['workload', 'class'] }),
  );
  const nodes = useResource('fleet:nodes', (ds) =>
    ds.figures({ window: DEFAULT_WINDOW, grain: 'day', dims: ['instance', 'class'] }),
  );
  const roster = useResource('fleet:roster', (ds) => ds.roster({ limit: 200 }));
  // The per-rank rows carry each node's declared workload; the index shows it as a door to
  // the middle facet.
  const holders = useResource('fleet:holders', (ds) => ds.holders({ limit: 200 }));

  return (
    <Drill title="Fleet" crumbs={[{ to: '/', label: 'Dashboard' }]}>
      <WorkloadStrip workloads={workloads} />
      <InstanceIndex nodes={nodes} roster={roster} holders={holders} />
    </Drill>
  );
}

/** The workloads, as chips with their rates: the middle facet's doors. Collapses to a
 * sentence where the fleet carries one. */
function WorkloadStrip({ workloads }: { workloads: Resource<Stamped<FiguresData>> }): ReactNode {
  const head = `workloads · ${stopLabel(DEFAULT_WINDOW)}`;
  const hover = <InfoHover of="entity_scope" label="scope" />;
  if (workloads.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        {workloads.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>The strip fills with the first analysis pass.</p>
        ) : (
          <Refusal
            refusal={{
              cause: workloads.error.cause ?? 'engine_unavailable',
              message: workloads.error.message,
            }}
          />
        )}
      </Block>
    );
  }
  if (workloads.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        {null}
      </Block>
    );
  }
  const cells = [...memberRates(workloads.value.data, 'workload').entries()]
    .filter(([, c]) => c.total > 0)
    .sort((a, b) => b[1].recompute - a[1].recompute);
  const fleetRecompute = cells.reduce((a, [, c]) => a + c.recompute, 0);

  if (cells.length <= 1) {
    // The single-workload collapse: the middle facet steps out of the way, and navigation
    // goes fleet → instance directly. Most deployments declare no workload labels, so this
    // is the default first-run state, not a corner case.
    return (
      <p className={styles['stamp']}>
        {cells.length === 1 ? (
          <>
            one workload: every run is <b>{cells[0]?.[0]}</b>, so the instances below are the
            whole story ·{' '}
            <Link to={`/workload/${encodeURIComponent(cells[0]?.[0] ?? '')}`}>
              its page ›
            </Link>
          </>
        ) : (
          'no classified workload mass in the window yet'
        )}
      </p>
    );
  }

  return (
    <Block head={head} extras={hover}>
      <div className={styles['chipRow']}>
        {cells.map(([key, c]) => (
          <Link key={key} to={`/workload/${encodeURIComponent(key)}`} className={styles['chip']}>
            <span className={key === 'undeclared' ? styles['undeclared'] : undefined}>{key}</span>
            <b>{rate(c.recompute / c.total)}</b>
            <i>{percent(fleetRecompute > 0 ? c.recompute / fleetRecompute : 0, 0)} of fleet</i>
          </Link>
        ))}
      </div>
      <p className={styles['stamp']}>
        rate of its own cache work recomputed · weight of the fleet&#8217;s recompute · a
        declared, time-varying label, never a container
      </p>
    </Block>
  );
}

/** One row per slot, worst rate first: the order a diagnosis walks. */
function InstanceIndex({
  nodes,
  roster,
  holders,
}: {
  nodes: Resource<Stamped<FiguresData>>;
  roster: Resource<Stamped<RosterData>>;
  holders: Resource<Stamped<HoldersData>>;
}): ReactNode {
  const head = `instances · by recompute rate · ${stopLabel(DEFAULT_WINDOW)}`;
  const hover = <InfoHover of="entity_scope" label="scope" />;
  if (nodes.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        {nodes.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>
            The index fills with the first analysis pass. Nothing here is a zero.
          </p>
        ) : (
          <Refusal
            refusal={{
              cause: nodes.error.cause ?? 'engine_unavailable',
              message: nodes.error.message,
            }}
          />
        )}
      </Block>
    );
  }
  if (nodes.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        {null}
      </Block>
    );
  }

  const cells = [...memberRates(nodes.value.data, 'instance').entries()]
    .filter(([, c]) => c.total > 0)
    .sort((a, b) => b[1].recompute / b[1].total - a[1].recompute / a[1].total);
  const worstRate = cells[0] === undefined ? 0 : cells[0][1].recompute / cells[0][1].total;

  const runByInstance = new Map<string, RunRow>();
  if (roster.status === 'ready') {
    for (const row of roster.value.data.rows ?? []) {
      const known = runByInstance.get(row.instance);
      if (known === undefined || row.last_seen_ms > known.last_seen_ms) {
        runByInstance.set(row.instance, row);
      }
    }
  }
  const workloadByInstance = new Map<string, string>();
  if (holders.status === 'ready') {
    for (const row of holders.value.data.rows ?? []) {
      if (row.workload != null && !workloadByInstance.has(row.holder.instance)) {
        workloadByInstance.set(row.holder.instance, row.workload);
      }
    }
  }

  return (
    <Block head={head} extras={hover}>
      <div className="table-scroll">
        <table className={table['table']}>
          <thead>
            <tr>
              <th>instance</th>
              <th title="judged by the server at read time against real now, one platform threshold">
                status
              </th>
              <th className={table['num']} title="of its own cache work recomputed over the window">
                rate
              </th>
              <th className={table['num']}>repeat compute</th>
              <th>workload</th>
              <th title="the slot's current occupant; a slot outlives its pods">pod</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cells.map(([instance, c]) => {
              const run = runByInstance.get(instance);
              const workload = workloadByInstance.get(instance);
              const r = c.recompute / c.total;
              return (
                <tr key={instance} className={table['row']}>
                  <td>
                    <Link className={table['link']} to={`/instance/${encodeURIComponent(instance)}`}>
                      {instance}
                    </Link>
                  </td>
                  <td>
                    {run === undefined ? (
                      <span className={table['quiet']}>·</span>
                    ) : (
                      <span
                        className={styles['status']}
                        data-tone={
                          run.state === 'active'
                            ? 'active'
                            : run.reason === 'silent'
                              ? 'faulted'
                              : run.reason === 'stopped'
                                ? 'stopped'
                                : 'unheard'
                        }
                        title={`${
                          run.state === 'active'
                            ? 'heartbeating'
                            : run.reason === 'silent'
                              ? 'silent: past the platform threshold with no stop record. The absence of the goodbye is the signal'
                              : run.reason === 'stopped'
                                ? 'stopped cleanly: an announced departure, a deploy rather than a fault'
                                : 'never declared itself: a coverage gap rather than a health claim'
                        } · judged by the server at read time against real now, one platform threshold`}
                      >
                        <i className={styles['statusMark']} aria-hidden="true" />
                        {run.state}
                      </span>
                    )}
                  </td>
                  <td className={table['num']}>
                    <span className={styles['shareBar']} aria-hidden="true">
                      <i style={{ width: `${Math.max(2, worstRate > 0 ? (r / worstRate) * 100 : 0)}%` }} />
                    </span>
                    {rate(r)}
                  </td>
                  <td className={table['num']} title={`of ≥ ${integer(c.total)} stored tokens`}>
                    {`≥ ${compact(c.recompute)}`}
                  </td>
                  <td className={workload === undefined ? table['undeclared'] : undefined}>
                    {workload === undefined ? (
                      'undeclared'
                    ) : (
                      <Link className={table['link']} to={`/workload/${encodeURIComponent(workload)}`}>
                        {workload}
                      </Link>
                    )}
                  </td>
                  <td className={run?.pod == null ? table['undeclared'] : table['quiet']}>
                    {run?.pod ?? 'unobserved'}
                  </td>
                  <td className={table['chev']}>›</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles['stamp']}>
        {count(cells.length, 'slot')} with classified mass · worst rate first, because a busy
        node is not a wasteful one and this column already made the division · each node&#8217;s
        page holds its ranks, one step finer
      </p>
    </Block>
  );
}
