// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { useResource, type Resource } from '../../data/react';
import type { Stamped } from '../../domain/contract';
import type { ConcentrationData } from '../../domain/lens';
import { compact, count, integer, percent } from '../../design-system/format/numbers';
import { InfoHover } from '../../design-system/info/InfoHover';
import { Block } from '../../design-system/layout/Block';
import { Drill } from '../../design-system/layout/Drill';
import { Link, useQueryParam, type RouteProps } from '../../design-system/navigation/router';
import { MemberDistribution } from './MemberDistribution';
import { StatRow, type Tile } from './Tiles';
import { rate } from './rates';
import styles from './Entity.module.css';

/**
 * The identities drill: was it one block coming back over and over, or many different ones.
 *
 * A clicked bucket holds thousands of events, and a reader cannot page through them counting
 * repeats, so the answer is computed over the WHOLE slice and window and stated as figures: a
 * top-identity share that reads high when one hot block is churning and low when the mass is
 * breadth, the distinct count beside it, and the heaviest identities as a distribution whose
 * columns open the block pages where each identity's spread continues. The raw records stay
 * one level beneath, reachable, never the answer themselves.
 *
 * **Pre-contract read.** `/v1/blocks` ranks identities fleet-wide only; the scoped form is
 * proposed to the analyzer (scope params plus totals), the corpus serves it behind the seam,
 * and live mode states the absence rather than borrowing a fleet answer for a rank question.
 */

/** Level 1: the identities a scope's recompute concentrates in. */
export default function IdentitiesRoute(_props: RouteProps): ReactNode {
  const [holder] = useQueryParam('holder');
  const [instance] = useQueryParam('instance');
  const [window] = useQueryParam('window');
  const subject = holder ?? instance ?? '';
  const subjectInstance = holder?.split('/')[0] ?? instance ?? '';

  const span = /^(\d+),(\d+)$/.exec(window ?? '');
  const spanLabel =
    span?.[1] && span[2]
      ? `${new Date(Number(span[1])).toISOString().slice(0, 16).replace('T', ' ')}Z → ${new Date(Number(span[2])).toISOString().slice(11, 16)}Z`
      : 'the stamped window';

  const concentration = useResource(
    `concentration:${subject}:${window ?? ''}`,
    (ds) =>
      ds.lens === undefined
        ? Promise.reject(Object.assign(new Error('no endpoint'), { isAwaitingEndpoint: true }))
        : ds.lens.identityConcentration({
            ...(holder ? { holder } : {}),
            ...(instance && !holder ? { instance } : {}),
            window: window ?? '',
            limit: 10,
          }),
  );

  return (
    <Drill
      title={`Identities behind ${subject || 'this'}`}
      crumbs={[
        { to: '/', label: 'Dashboard' },
        { to: '/fleet', label: 'Fleet' },
        ...(subjectInstance
          ? [{ to: `/instance/${encodeURIComponent(subjectInstance)}`, label: subjectInstance }]
          : []),
      ]}
      stamp={
        <>
          the recompute in <b>{spanLabel}</b>, cut by block identity: one hot block churning
          and many different blocks are the same mass with opposite remedies, and only
          identity tells them apart. Identities are the engine&#8217;s own cache keys, content
          never leaves the fleet, and the cache hits and misses on exactly this granularity.
        </>
      }
    >
      <ConcentrationBlock concentration={concentration} holder={holder} window={window} />
    </Drill>
  );
}

function ConcentrationBlock({
  concentration,
  holder,
  window,
}: {
  concentration: Resource<Stamped<ConcentrationData>>;
  holder: string | null;
  window: string | null;
}): ReactNode {
  const head = 'one block, or many';
  const hover = <InfoHover of="identity_concentration" label="identity concentration" />;

  if (concentration.status === 'loading') {
    return (
      <Block head={head} extras={hover}>
        <p className={styles['awaiting']}>drilling into the records for this span…</p>
      </Block>
    );
  }
  if (concentration.status === 'failed') {
    return (
      <Block head={head} extras={hover}>
        {(concentration.error as { isAwaitingEndpoint?: boolean }).isAwaitingEndpoint === true ? (
          <p className={styles['awaiting']}>
            The scoped identity ranking has no live endpoint yet: `/v1/blocks` answers
            fleet-wide only. The ask is filed with the analyzer; fixture mode serves the
            shape, and this page states the absence rather than borrowing a fleet answer for
            a narrower question.
          </p>
        ) : (
          <p className={styles['awaiting']}>{concentration.error.message}</p>
        )}
      </Block>
    );
  }

  const d = concentration.value.data;
  const top = d.rows[0];
  const topShare = top !== undefined && d.scope_total > 0 ? top.tokens.value / d.scope_total : 0;
  const listed = d.rows.reduce((a, r) => a + r.tokens.value, 0);

  const tiles: Tile[] = [
    {
      value: top === undefined ? 'none' : percent(topShare, 0),
      unit: 'carried by the heaviest identity',
      ...(top === undefined ? {} : { sub: `${top.block_id} · ≥ ${compact(top.tokens.value)} tokens` }),
      tip: 'high reads as one hot block churning; low reads as breadth. Same mass, opposite remedies.',
    },
    {
      value: integer(d.distinct_blocks),
      unit: 'distinct identities recomputed',
      sub: `${count(d.total_events, 'store event')} behind them`,
    },
    {
      value: `≥ ${compact(d.scope_total)}`,
      unit: 'tokens recomputed in the span',
      sub: `the top ${integer(d.rows.length)} carry ${percent(d.scope_total > 0 ? listed / d.scope_total : 0, 0)}`,
    },
  ];

  return (
    <Block head={head} extras={hover}>
      <StatRow tiles={tiles} />
      <MemberDistribution
        members={d.rows.map((r) => ({
          key: r.block_id,
          label: r.block_id,
          total: d.scope_total > 0 ? r.tokens.value / d.scope_total : 0,
          detail: `≥ ${compact(r.tokens.value)} tokens · ${count(r.events, 'event')} · stored on ${count(r.holders_stored, 'holder')}`,
        }))}
        noun="identity"
        linkTo={(key) => `/block/${encodeURIComponent(key)}`}
        fmt={rate}
        listLimit={10}
      />
      <p className={styles['stamp']}>
        top {integer(d.rows.length)} of <b>{integer(d.distinct_blocks)}</b> identities, worst
        first; what the bound excluded stays counted in the totals. Each column opens the
        block&#8217;s own page, where its spread across holders continues.
        {holder !== null && window !== null && (
          <>
            {' '}
            The raw records are one level beneath:{' '}
            <Link to={`/evidence?holder=${encodeURIComponent(holder)}&window=${window}`}>
              records behind this ›
            </Link>
          </>
        )}
      </p>
    </Block>
  );
}
