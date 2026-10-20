// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import type { Resource } from '../../../data/react';
import type { BandsData, Stamped } from '../../../domain/contract';
import { bandsView } from '../../../domain/bands';
import { bucketLabel, servedWindow } from '../../../domain/windows';
import { clock, day, percent } from '../../../design-system/format/numbers';
import { InfoHover } from '../../../design-system/info/InfoHover';
import { Block } from '../../../design-system/layout/Block';
import { Refusal } from '../../../design-system/refusal/Refusal';
import { RankSeries } from '../RankSeries';
import styles from '../Entity.module.css';

/** Panel 3: the ranks as rate series, each rank's share of the node's recompute. */
export function RanksBlock({
  ranks,
  winLabel,
}: {
  ranks: Resource<Stamped<BandsData>>;
  winLabel: string;
}): ReactNode {
  const head = `its ranks · share of the node's recompute · ${winLabel}`;
  const hover = <InfoHover of="entity_scope" label="scope" />;
  if (ranks.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        {ranks.error.isNotYetMeasured ? (
          <p className={styles['awaiting']}>The ranks fill with the first analysis pass.</p>
        ) : (
          <Refusal
            refusal={{
              cause: ranks.error.cause ?? 'engine_unavailable',
              message: ranks.error.message,
            }}
          />
        )}
      </Block>
    );
  }
  if (ranks.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        {null}
      </Block>
    );
  }
  const data = ranks.value.data;
  const view = bandsView(data, 'holder');
  const desc = servedWindow(data, winLabel);
  // Per bucket, each rank's share of the node's recompute: balanced ranks sit together at
  // 1/dp_size, and a rank hoarding the node's churn is a line nobody has to describe.
  const nodePerBucket = view.members[0]?.rows.map((_, i) =>
    view.members.reduce((a, m) => a + (m.rows[i]?.reduce((x, y) => x + y, 0) ?? 0), 0),
  ) ?? [];
  return (
    <Block head={head} extras={hover}>
      <RankSeries
        members={view.members.map((m) => {
          const [, rank, group] = m.key.split('/');
          return {
            key: m.key,
            label: `rank ${rank ?? '?'} / g${group ?? '?'}`,
            values: m.rows.map((bands, i) => {
              const node = nodePerBucket[i] ?? 0;
              const own = bands.reduce((a, b) => a + b, 0);
              return node > 0 ? own / node : 0;
            }),
            total: m.total,
          };
        })}
        labelOf={(i) => bucketLabel(desc, i)}
        tipLabelOf={(i) => {
          const at = desc.startMs + i * desc.bucketMs;
          return desc.bucketMs < 86_400_000 ? `${day(at)} ${clock(at)}` : day(at);
        }}
        tickEvery={desc.tickEvery}
        unit="share of the node's recompute per bucket · one line per rank · each rank opens its store timeline"
        fmt={(v) => percent(v, 0)}
        linkTo={(key) => {
          const [inst, rank, group] = key.split('/');
          if (inst === undefined || rank === undefined || group === undefined) return null;
          return `/instance/${encodeURIComponent(inst)}/rank/${rank}/${group}`;
        }}
        title="Each rank's share of this node's recompute per bucket, one line per rank. Balanced ranks sit together; a diverging line is the diagnosis."
      />
    </Block>
  );
}
