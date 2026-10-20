// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { Resource } from '../../../data/react';
import type { FiguresData, Stamped } from '../../../domain/contract';
import { compact } from '../../../design-system/format/numbers';
import { InfoHover } from '../../../design-system/info/InfoHover';
import { Block } from '../../../design-system/layout/Block';
import { Refusal } from '../../../design-system/refusal/Refusal';
import { MemberDistribution } from '../MemberDistribution';
import { rate } from '../rates';
import styles from '../Entity.module.css';
import { peerCells } from './peers';

/** Panel 6: peers as a RATE. Ranked by mass, a busy node looks like an offender when it is
 * proportionate; ranked by rate, busy and wasteful separate, which is the question. */
export function PeersBlock({
  peers,
  subject,
  winLabel,
}: {
  peers: Resource<Stamped<FiguresData>>;
  subject: string;
  winLabel: string;
}): ReactNode {
  const head = `among its peers · recompute rate · ${winLabel}`;
  const hover = <InfoHover of="entity_scope" label="scope" />;
  if (peers.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        {peers.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>The comparison fills with the first analysis pass.</p>
        ) : (
          <Refusal
            refusal={{
              cause: peers.error.cause ?? 'engine_unavailable',
              message: peers.error.message,
            }}
          />
        )}
      </Block>
    );
  }
  if (peers.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        {null}
      </Block>
    );
  }
  const { windowByInstance } = peerCells(peers.value.data);
  const members = [...windowByInstance.entries()]
    .filter(([, c]) => c.total > 0)
    .map(([key, c]) => ({
      key,
      label: key,
      total: c.recompute / c.total,
      detail: `≥ ${compact(c.recompute)} recomputed of ≥ ${compact(c.total)} stored`,
    }));
  return (
    <Block head={head} extras={hover}>
      <MemberDistribution
        members={members}
        noun="instance"
        subjectKey={subject}
        linkTo={(key) => (key === subject ? null : `/instance/${encodeURIComponent(key)}`)}
        fmt={rate}
      />
    </Block>
  );
}
