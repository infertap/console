// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource } from '../../data/react';
import type { RosterData } from '../../domain/contract';
import { clock, compact, count, duration, integer, percent } from '../../design-system/format/numbers';
import { Drill } from '../../design-system/layout/Drill';
import { Block, Section } from '../../design-system/layout/Block';
import { InfoHover } from '../../design-system/info/InfoHover';
import { KpiRow } from '../../design-system/figure/KpiRow';
import { Link, type RouteProps } from '../../design-system/navigation/router';
import { WireStateChip } from '../../design-system/state/StateChip';
import table from '../../design-system/table/Table.module.css';
import styles from './Health.module.css';

/**
 * Level 1: Health, where a nonzero trust chip gets investigated.
 *
 * The v3 surgery, per the ruling set and the product's own history: model identity is DECLARED,
 * never probed (the probe was retracted); no recovery section, because gauges for deleted
 * machinery lie; and the two tables this page exists for lead it: the delivery ledger (of what
 * the taps produced, what arrived, per process) and the staleness investigation (who is quiet,
 * last heard, judged against each process's own threshold).
 */
export default function HealthRoute(_props: RouteProps): ReactNode {
  const health = useResource('health:page', (ds) => ds.health({}));
  const delivery = useResource('delivery:page', (ds) => ds.delivery());
  const roster = useResource('roster:page', (ds) => ds.roster({}));
  // Both bases ride the instance coverage rows since pin `2d0db9e`, with the sums that make
  // the token-weighted one mergeable. The client-side join this replaced is deleted.
  const coverage = useResource('coverage:instance', (ds) => ds.coverage({ by: 'instance' }));

  return (
    <Drill
      title="Health"
      crumbs={[
        { to: '/', label: 'Dashboard' },
        { to: '/#trust', label: 'Trust' },
      ]}
      stamp="delivery, staleness, coverage and identity. Everything here is observed, and nothing here is a scrape"
    >
      {/* ── 1 · Delivery: the fleet-truth ledger ─────────────────────────────────────────── */}
      {delivery.status === 'ready' && (
        <Section name="Delivery" id="delivery" definition="delivery">
          <Block
            head="per tap process · since install"
            extras={<InfoHover of="delivery" label="delivery" />}
          >
            {(() => {
              const d = delivery.value.data;
              const problems = d.rows.filter(
                (r) =>
                  r.segments_missing_unexplained > 0 ||
                  r.segments_declared_dropped > 0 ||
                  r.records_dropped_at_source > 0,
              );
              return (
                <>
                  <KpiRow
                    kpis={[
                      {
                        value: d.fleet.fraction != null ? percent(d.fleet.fraction, 2) : 'none yet',
                        label: `captured · ${integer(d.fleet.segments_captured)} of ${integer(d.fleet.segments_expected)} segments`,
                        wide: true,
                      },
                      {
                        value: integer(d.fleet.segments_declared_dropped),
                        label: 'declared dropped',
                        tip: 'the tap reclaimed them under ring pressure and named the range',
                      },
                      {
                        value: integer(d.fleet.segments_missing_unexplained),
                        label: 'missing · no declaration',
                        tip: 'sequence gaps nothing accounts for: the finding',
                      },
                      {
                        value: integer(d.fleet.records_dropped_at_source),
                        label: 'records dropped at source',
                      },
                    ]}
                  />
                  {problems.length === 0 ? (
                    <p className={styles['none']}>
                      Every tap process delivered whole, or declared what it dropped. That is a
                      measured result over {count(d.rows.length, 'tap process', 'tap processes')},
                      not an absence of looking.
                    </p>
                  ) : (
                    <>
                      <div className="table-scroll">
                        <table className={table['table']}>
                          <thead>
                            <tr>
                              <th>tap process</th>
                              <th>engine</th>
                              <th className={table['num']}>captured</th>
                              <th className={table['num']}>declared dropped</th>
                              <th
                                className={table['num']}
                                title="a sequence gap with no drop declaration"
                              >
                                missing · no declaration
                              </th>
                              <th className={table['num']}>records dropped at source</th>
                            </tr>
                          </thead>
                          <tbody>
                            {problems.map((r) => (
                              <tr key={r.incarnation}>
                                <td className={table['quiet']}>{r.incarnation}</td>
                                {/* A third kind of absence: a run known only through someone
                                    else's drop declaration named no instance. The fact is
                                    stated, not dressed as undeclared or unattributed. */}
                                <td className={r.instances.length === 0 ? table['quiet'] : undefined}>
                                  {r.instances.length === 0
                                    ? 'no instance named'
                                    : r.instances.join(', ')}
                                </td>
                                <td className={table['num']}>
                                  {`${integer(r.segments_captured)} of ${integer(r.segments_expected)}`}
                                </td>
                                <td className={table['num']}>
                                  {integer(r.segments_declared_dropped)}
                                </td>
                                <td className={table['num']}>
                                  <b>{integer(r.segments_missing_unexplained)}</b>
                                </td>
                                <td className={table['num']}>
                                  {integer(r.records_dropped_at_source)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className={styles['stamp']}>
                        <b>{integer(problems.length)}</b> of{' '}
                        <b>{integer(d.rows.length)}</b> tap processes with delivery findings ·
                        the rest delivered whole or declared their drops
                      </p>
                    </>
                  )}
                </>
              );
            })()}
          </Block>
        </Section>
      )}

      {/* ── 2 · Staleness: the investigation behind the trust chips ──────────────────────── */}
      {roster.status === 'ready' && (
        <Section name="Staleness" id="stale" definition="staleness">
          <Block
            head="quiet tap processes · per-process thresholds"
            extras={<InfoHover of="staleness" label="staleness" />}
          >
            <StalenessTable roster={roster.value.data} />
          </Block>
        </Section>
      )}

      {/* ── 3 · Coverage by engine: two bases, where divergence is the point ─────────────── */}
      {coverage.status === 'ready' && (
        <Section name="Coverage" id="cov" definition="coverage_bases">
          <Block
            head="both bases · per engine · lowest first"
            extras={<InfoHover of="coverage_bases" label="coverage bases" />}
          >
            {(() => {
              // Merge day rows per engine by the sums, never by averaging fractions:
              // instance-time = Σcovered / Σwindow, token-weighted = Σwsum / Σtokens.
              const byInstance = new Map<
                string,
                { covered: number; window: number; wsum: number; mass: number }
              >();
              for (const r of coverage.value.data.rows) {
                const key = r.instance ?? 'fleet';
                const entry =
                  byInstance.get(key) ?? { covered: 0, window: 0, wsum: 0, mass: 0 };
                entry.covered += r.covered_ms;
                entry.window += r.window_ms;
                entry.wsum += r.token_wsum ?? 0;
                entry.mass += r.token_mass ?? 0;
                byInstance.set(key, entry);
              }
              const rows = [...byInstance.entries()]
                .map(([instance, e]) => ({
                  instance,
                  fraction: e.window > 0 ? e.covered / e.window : 0,
                  tokenWeighted: e.mass > 0 ? e.wsum / e.mass : undefined,
                }))
                .sort((a, b) => a.fraction - b.fraction);
              const meter = (v: number): ReactNode => (
                <span className={styles['meterCell']}>
                  <i className={styles['meter']} data-low={v < 0.75 ? 'true' : undefined}>
                    <i style={{ width: `${Math.round(v * 100)}%` }} />
                  </i>
                  {percent(v, 1)}
                </span>
              );
              return (
                <>
                  <div className="table-scroll">
                    <table className={table['table']}>
                      <thead>
                        <tr>
                          <th>engine</th>
                          <th
                            className={table['num']}
                            title="was telemetry present · covered time ÷ window time"
                          >
                            instance-time
                          </th>
                          <th
                            className={table['num']}
                            title="at what coverage the mass was observed"
                          >
                            token-weighted
                          </th>
                          <th title="a large gap between the bases means a few blind minutes held much of the mass" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.instance}>
                            <td>{r.instance}</td>
                            <td className={table['num']}>{meter(r.fraction)}</td>
                            <td className={table['num']}>
                              {r.tokenWeighted !== undefined ? (
                                meter(r.tokenWeighted)
                              ) : (
                                <span
                                  className={table['quiet']}
                                  title="this engine has no classified mass in the window, so there is nothing to weight: absence, never a zero"
                                >
                                  not yet served
                                </span>
                              )}
                            </td>
                            <td className={table['quiet']}>
                              {r.tokenWeighted !== undefined &&
                              Math.abs(r.fraction - r.tokenWeighted) > 0.1
                                ? 'diverging'
                                : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={styles['stamp']}>
                    <b>{integer(rows.length)}</b> engines shown · lowest instance-time first
                  </p>
                </>
              );
            })()}
          </Block>
        </Section>
      )}

      {/* ── 4 · Model identity: declared, per the standing ruling ────────────────────────── */}
      {health.status === 'ready' && (
        <Section name="Model identity" id="model" definition="model_identity">
          <Block
            head="declared per engine · never guessed"
            extras={<InfoHover of="model_identity" label="model identity" />}
          >
            <div className={styles['chips']}>
              <WireStateChip
                raw="fine"
                provenance="declared"
                value={`${integer(health.value.data.models.observed)} declared`}
                size="small"
              />
              <WireStateChip
                raw="unobserved"
                provenance="not collected"
                value={`${integer(health.value.data.models.undeclared)} undeclared`}
                size="small"
              />
            </div>
            {health.value.data.models.undeclared > 0 && (
              <div className={styles['notice']}>
                <p className={styles['noticeHead']}>
                  model undeclared on {count(health.value.data.models.undeclared, 'engine')}
                </p>
                <p className={styles['noticeBody']}>
                  Cross-engine findings for these engines are <b>indeterminate</b>. Per-engine
                  figures are <b>unaffected</b>.
                </p>
                <p className={styles['noticeRemedy']}>
                  To declare: template the kv-events topic (kv@pod@model), or set model in
                  --provenance.
                </p>
              </div>
            )}
          </Block>
        </Section>
      )}

      {/* ── 5 · Ingest: the batches ledger ───────────────────────────────────────────────── */}
      {health.status === 'ready' && (
        <Section name="Ingest" id="ingest" definition="ingest">
          <Block head="batches ledger" extras={<InfoHover of="ingest" label="ingest" />}>
            <div className={styles['grid']}>
              <Stat
                label="segments acknowledged"
                value={integer(health.value.data.ingest.batches_total)}
              />
              <Stat
                label="segments in backlog"
                value={
                  health.value.data.ingest.backlog_files === null ||
                  health.value.data.ingest.backlog_files === undefined
                    ? 'not served'
                    : integer(health.value.data.ingest.backlog_files)
                }
              />
              <Stat
                label="bytes in backlog"
                value={
                  health.value.data.ingest.backlog_bytes === null ||
                  health.value.data.ingest.backlog_bytes === undefined
                    ? 'not served'
                    : `${compact(health.value.data.ingest.backlog_bytes)}B`
                }
              />
              <Stat
                label="lag"
                value={
                  health.value.data.ingest.lag_ms === null ||
                  health.value.data.ingest.lag_ms === undefined
                    ? 'none'
                    : duration(health.value.data.ingest.lag_ms)
                }
              />
              <Stat
                label="last segment at"
                value={
                  health.value.data.ingest.last_segment_at_ms
                    ? clock(health.value.data.ingest.last_segment_at_ms)
                    : 'none yet'
                }
              />
              <Stat
                label="records since install"
                value={integer(health.value.data.ingest.events_since_install)}
              />
            </div>
          </Block>
        </Section>
      )}

      {/* ── Degradations: real findings must render, whatever the mock omitted ───────────── */}
      {health.status === 'ready' && health.value.data.degradations.length > 0 && (
        <Section name="Degradations" id="degradations">
          <Block head="each states what it degraded, what it did not, and what to do">
            <div className="table-scroll">
              <table className={table['table']}>
                <thead>
                  <tr>
                    <th>class</th>
                    <th>degraded</th>
                    <th>scope</th>
                    <th>unaffected</th>
                    <th>remedy</th>
                    <th className={table['num']}>incidents</th>
                  </tr>
                </thead>
                <tbody>
                  {health.value.data.degradations.map((d, i) => (
                    <tr key={`${d.class}-${i}`}>
                      <td>{d.class}</td>
                      <td>{d.degraded}</td>
                      {/* The blast radius, and what it did NOT reach. Both are required. */}
                      <td className={table['quiet']}>{d.scope}</td>
                      <td className={table['quiet']}>{d.unaffected}</td>
                      <td>{d.remedy}</td>
                      <td className={table['num']}>{integer(d.incidents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>
        </Section>
      )}
    </Drill>
  );
}

/** The words each status reason wears on this page. */
const REASON_WORDS: Readonly<Record<string, string>> = {
  silent: 'silent',
  stopped: 'stopped cleanly',
  ungraded: 'never declared',
};

function StalenessTable({ roster }: { roster: RosterData }): ReactNode {
  // The investigation lists what is not heartbeating; active processes are the quiet wall this
  // table exists to subtract. Silent leads because it is the alarming reason.
  const rows = [...(roster.rows ?? [])]
    .filter((r) => r.state === 'inactive')
    .sort((a, b) => (b.silent_for_ms ?? 0) - (a.silent_for_ms ?? 0));
  const counts = roster.state_counts ?? {};

  return (
    <>
      {rows.length === 0 ? (
        <p className={styles['none']}>
          Every tap process is heartbeating within the platform threshold. That is a measured
          result, not an absence of looking.
        </p>
      ) : (
        <div className="table-scroll">
          <table className={table['table']}>
            <thead>
              <tr>
                <th>tap process</th>
                <th>engine</th>
                <th title="the server's judgment, computed at read time against real now">reason</th>
                <th className={table['num']}>last heard</th>
                <th
                  className={table['num']}
                  title="one platform threshold: how long a silence must run before it is called"
                >
                  threshold
                </th>
                <th className={table['num']}>quiet for</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.incarnation}>
                  <td className={table['quiet']}>{r.incarnation}</td>
                  <td>
                    <Link className={table['link']} to={`/instance/${encodeURIComponent(r.instance)}`}>
                      {r.instance}
                    </Link>
                  </td>
                  <td>
                    <WireStateChip
                      raw={
                        r.reason === 'silent'
                          ? 'impaired'
                          : r.reason === 'stopped'
                            ? 'unobserved'
                            : 'indeterminate'
                      }
                      provenance="at read time"
                      value={REASON_WORDS[r.reason ?? ''] ?? (r.reason || 'inactive')}
                      size="small"
                    />
                  </td>
                  <td className={table['num']}>{clock(r.last_seen_ms)}</td>
                  <td className={table['num']}>
                    {r.threshold_ms != null ? duration(r.threshold_ms) : '·'}
                  </td>
                  <td className={table['num']}>
                    {r.silent_for_ms != null ? <b>{duration(r.silent_for_ms)}</b> : '·'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles['stamp']}>
        {(['silent', 'stopped', 'ungraded', 'active'] as const)
          .filter((k) => (counts[k] ?? 0) > 0)
          .map((k) =>
            k === 'active'
              ? `${integer(counts[k] ?? 0)} active, not listed`
              : `${integer(counts[k] ?? 0)} ${REASON_WORDS[k] ?? k}`,
          )
          .join(' · ')}
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div>
      <div className={styles['statValue']}>{value}</div>
      <div className={styles['statLabel']}>{label}</div>
    </div>
  );
}
