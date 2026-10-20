// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The development rig: the fixture corpus, and the tape that says it is one.
 *
 * **This layer exists so the mock cannot reach a customer.** Everything here is referenced only
 * from behind `import.meta.env.DEV`, which Vite replaces with `false` in a production build, so
 * Rollup drops the branch, the import, and this whole module with it. `scripts/audit-bundle.mjs`
 * then checks the built artifact for the rig's own words and fails if any survive — because a
 * tree-shaking argument is a claim about a bundler, and the artifact is the thing that ships.
 *
 * Why it is a layer rather than a flag: v1.0.0 shipped a console that rendered SYNTHETIC data on
 * a customer's machine and never called the API. The runtime switch defaulted the wrong way, and
 * the fixture code was present to be switched TO. A default can be got wrong again; code that is
 * not in the bundle cannot be reached by any means.
 */
import type { ReactNode } from 'react';
import { AGES, type Age } from '../config';
import { FixtureDataSource } from '../data/fixture/source';
import type { DataSource } from '../data';
import { useDataSource, usePendingPass } from '../data/react';
import { useQueryParam } from '../design-system/navigation/router';
import chrome from '../design-system/chrome/Chrome.module.css';

/** The corpus, wired the way the rig reviews it. */
export function createFixtureSource(age: Age): DataSource {
  return new FixtureDataSource({
    age,
    // Ingestion is bursty, so the strip renders bursts. Idle renders as honest idle, with only
    // the freshness clock moving.
    ingestEveryMs: 6000,
    passEveryMs: 45_000,
  });
}

/**
 * The test rig tape.
 *
 * Amber, and deliberately not product chrome, so it stops adding mass to the frame in
 * screenshots and nobody mistakes it for a feature. It carries the age switcher, which is how
 * the four ages are reviewed: one URL, one layout, four states.
 */
export function TestRig(): ReactNode {
  const source = useDataSource();
  const { take } = usePendingPass();
  const fixture = source instanceof FixtureDataSource ? source : null;

  return (
    <div className={chrome['rig']} role="note">
      <span className={chrome['rigLabel']}>
        static rig, synthetic data, no daemon attached
      </span>
      {fixture && (
        <span className={chrome['ages']}>
          <span className={chrome['rigLabel']}>age</span>
          {AGES.map((age: Age) => (
            <button
              key={age}
              type="button"
              className={chrome['age']}
              aria-pressed={fixture.age.key === age}
              onClick={() => {
                fixture.setAge(age);
                // Re-read everything: the corpus is a different age now, and every open read
                // describes the old one.
                take();
              }}
            >
              {age}
            </button>
          ))}
          <button
            type="button"
            className={chrome['age']}
            onClick={() => {
              fixture.emitPassCompleted();
            }}
          >
            run a pass
          </button>
        </span>
      )}
      {fixture && <ScenarioSwitch />}
    </div>
  );
}

/**
 * The scripted outcome of the change under test, switchable so the attribution card is
 * reviewed carrying bad news as readily as good. Corpus state, so it lives on the rig; it
 * rides the URL (`sc`) because a reviewer sends a regression view as a link, and it is set on
 * the fixture source too, because the bands read is a contract read whose query carries no
 * scenario: the real endpoint has one outcome, and the knob must never leak into its shape.
 */
function ScenarioSwitch(): ReactNode {
  const source = useDataSource();
  const { take } = usePendingPass();
  const fixture = source instanceof FixtureDataSource ? source : null;
  const [sc, setSc] = useQueryParam('sc');
  const current = sc === 'reg' ? 'reg' : 'win';
  return (
    <span className={chrome['ages']}>
      <span className={chrome['rigLabel']}>scenario</span>
      {(
        [
          ['win', 'affinity win'],
          ['reg', 'regression'],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={chrome['age']}
          aria-pressed={current === key}
          onClick={() => {
            fixture?.setScenario(key);
            setSc(key === 'win' ? null : key);
            take();
          }}
        >
          {label}
        </button>
      ))}
    </span>
  );
}
