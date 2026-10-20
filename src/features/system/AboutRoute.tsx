// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { config } from '../../config';
import { useResource } from '../../data/react';
import { Drill } from '../../design-system/layout/Drill';
import { Plate } from '../../design-system/layout/Plate';
import type { RouteProps } from '../../design-system/navigation/router';
import table from '../../design-system/table/Table.module.css';

/**
 * Versions, and the meaning pair in force.
 *
 * The discriminator and the semantics version are what make two figures comparable or not, so
 * they belong somewhere a reader can quote them from. This is that place.
 */
export default function AboutRoute(_props: RouteProps): ReactNode {
  const stamp = useResource('stamp:about', (ds) => ds.stamp());

  return (
    <Drill title="About" crumbs={[{ to: '/', label: 'Document' }]}>
      {stamp.status === 'ready' && (
        <Plate name="This analyzer">
          <table className={table['table']}>
            <tbody>
              <tr>
                <td className={table['quiet']}>fleet</td>
                <td>{stamp.value.stamp.fleet_id}</td>
              </tr>
              <tr>
                <td className={table['quiet']}>analyzer</td>
                <td>{stamp.value.stamp.analyzer_version ?? 'not stated'}</td>
              </tr>
              <tr>
                <td className={table['quiet']}>semantics</td>
                <td>{stamp.value.stamp.semantics_version}</td>
              </tr>
              <tr>
                <td className={table['quiet']}>discriminator</td>
                <td style={{ wordBreak: 'break-all' }}>{stamp.value.stamp.discriminator}</td>
              </tr>
              <tr>
                <td className={table['quiet']}>raw horizon</td>
                <td>
                  {stamp.value.stamp.raw_horizon.from_day
                    ? `${stamp.value.stamp.raw_horizon.declared_days} d declared, reaching ${stamp.value.stamp.raw_horizon.from_day}`
                    : `${stamp.value.stamp.raw_horizon.declared_days} d declared, nothing ingested yet`}
                </td>
              </tr>
              <tr>
                <td className={table['quiet']}>data source</td>
                <td>{config.source}</td>
              </tr>
            </tbody>
          </table>
        </Plate>
      )}
    </Drill>
  );
}
