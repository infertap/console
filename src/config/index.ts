// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Configuration, in one module.
 *
 * Nothing else in this repo reads `import.meta.env`. A flag scattered across components is a
 * flag nobody can enumerate, and the posture questions below are exactly the ones an operator
 * will one day ask us to answer precisely.
 */

/** Which implementation of the data seam the app runs against. Chosen once, at bootstrap. */
export type SourceKind = 'fixture' | 'live';

/** The document's four ages, as the fixture corpus scripts them. */
export const AGES = ['t0', 't1', 't2', 't3'] as const;
/** One of the four scripted ages of the fixture corpus. */
export type Age = (typeof AGES)[number];

/**
 * Deployment posture.
 *
 * **Every flag here is a seam, and every flag here is off.** The embedded posture is the only
 * one that ships: the daemon serves this bundle from its own console mount, so the console and
 * the API share an origin and there is no second tenant to name. The envelope fence is a safety
 * limit and not a feature gate, with nothing reserved for a cloud tier, so these exist to be a
 * place for that question to land rather than a plan to answer it.
 */
export interface Posture {
  /** Reserved. One analyzer, one fleet, one console. */
  readonly multiFleet: boolean;
  /**
   * Reserved. The API has no `/v1/reports` route, and the rail must not offer a destination
   * the API has no answer for.
   */
  readonly reportsDestination: boolean;
  /** Reserved. OPEN-1: whether the licence numbers belong on the console at all. */
  readonly licenceFooter: boolean;
}

/** Everything the console reads from its environment, resolved once at bootstrap. */
export interface Config {
  /**
   * Origin-relative, and empty by default. The production posture is same-origin: the daemon
   * serves the bundle, so no host is ever written down and no CORS header is ever emitted.
   * A dev server sets this only when it proxies elsewhere.
   */
  readonly apiBase: string;
  readonly source: SourceKind;
  readonly posture: Posture;
  /** Fixture-mode only. Which age the corpus opens at; the mock banner switches it live. */
  readonly fixtureAge: Age;
}

/**
 * **`live` is the default, and an unset variable must never produce fiction.**
 *
 * This read the other way round until the first real install: absent `VITE_SOURCE` meant
 * `fixture`, `npm run build` sets nothing, and the release workflow runs plain `npm run build`.
 * So v1.0.0 shipped a console that rendered SYNTHETIC data on a customer's box and never called
 * the API — a fully-populated dashboard for a fleet that does not exist, with no sign-in because
 * nothing it drew ever needed one.
 *
 * The direction of a default is a safety property when one branch invents numbers. Getting the
 * mock now takes saying so; getting the truth is what happens when nobody says anything.
 */
function readSource(raw: string | undefined): SourceKind {
  return raw === 'fixture' ? 'fixture' : 'live';
}

function readAge(raw: string | undefined): Age {
  return (AGES as readonly string[]).includes(raw ?? '') ? (raw as Age) : 't3';
}

/** The configuration this bundle runs with, frozen at bootstrap. */
export const config: Config = Object.freeze({
  apiBase: import.meta.env['VITE_API_BASE'] ?? '',
  source: readSource(import.meta.env['VITE_SOURCE']),
  posture: Object.freeze({
    multiFleet: false,
    reportsDestination: false,
    licenceFooter: false,
  }),
  fixtureAge: readAge(import.meta.env['VITE_FIXTURE_AGE']),
});

/**
 * True where every figure on the page is synthetic and must say so.
 *
 * This is not a debug flag. A number that cannot be traced to a pass is a number that must wear
 * a label, and the label is a product requirement rather than a courtesy.
 */
export const isSynthetic = (c: Config = config): boolean => c.source === 'fixture';
