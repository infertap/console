// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { navigate, type RouteProps } from '../../design-system/navigation/router';

/**
 * The retired URLs, kept answering: URL is state, and a link that shipped must land somewhere
 * true. `/holders` was the Ranks page until the entity pages made rank a section of the
 * instance page; `/holder/:triple` was the rank drill's old spelling before it re-homed under
 * its instance, the one containment the model guarantees.
 */

/** The retired holders ranking's address, sent to the fleet page. */
export function HoldersRedirect(_props: RouteProps): ReactNode {
  useEffect(() => {
    navigate('/fleet', { replace: true });
  }, []);
  return null;
}

/** The rank drill's old spelling, sent to its home under the instance page. */
export function HolderRedirect({ params }: RouteProps): ReactNode {
  const instance = params['instance'] ?? '';
  const dp = params['dp_rank'] ?? '0';
  const group = params['group_idx'] ?? '0';
  useEffect(() => {
    navigate(`/instance/${encodeURIComponent(instance)}/rank/${dp}/${group}`, { replace: true });
  }, [instance, dp, group]);
  return null;
}
