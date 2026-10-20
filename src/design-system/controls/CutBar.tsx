// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import styles from './CutBar.module.css';

/**
 * The cut selector: segmented button groups, each with a small-caps label.
 *
 * **Containment is the rule this control exists under**: a cut bar lives in the head of the one
 * panel it changes, and changes only what that panel contains. There are no global pickers, so
 * this component never reaches for shared state; the owning panel passes state down and receives
 * the pick back, and URL is state at that layer.
 *
 * Per the v3.1 affordance rule, a box is something you can press: the segmented group keeps its
 * box and responds on hover, which is what separates it from a label.
 */

export interface CutOption {
  readonly id: string;
  readonly label: string;
}

export interface CutGroup {
  readonly label: string;
  readonly options: readonly CutOption[];
  readonly current: string;
  readonly onSelect: (id: string) => void;
}

export function CutBar({ groups }: { groups: readonly CutGroup[] }): ReactNode {
  return (
    <div className={styles['bar']}>
      {groups.map((group) => (
        <div className={styles['group']} role="group" aria-label={group.label} key={group.label}>
          <span className={styles['label']}>{group.label}</span>
          <div className={styles['cut']}>
            {group.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={styles['button']}
                aria-pressed={option.id === group.current}
                onClick={() => group.onSelect(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
