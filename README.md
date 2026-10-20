# console

The InferTap console: the dashboard the analyzer serves. It is compiled into the analyzer's
binary and reads the analyzer's versioned API, and it adds nothing to what that API states.

**Working on it?** [`CONTRIBUTING.md`](CONTRIBUTING.md) is the way in: build, the gates, the
contract pin, the CLA. [`docs/design.md`](docs/design.md) holds the laws every component obeys.

## Running it

```
npm ci                  # never npm install; the lockfile is the build input
npm run dev             # fixture mode, the corpus at steady state
npm run build           # typecheck, bundle, then audit the artifact for external loads
npm test                # includes the gate tests, which assert every lint rule FIRES
npm run lint            # the layer boundaries and the laws on glass
```

`VITE_SOURCE=live npm run dev` runs against an analyzer on `127.0.0.1:8088`, which needs
`--api-dev-origin http://localhost:5173` on the analyzer side. `VITE_FIXTURE_AGE=t0` opens the
corpus at install time rather than steady state. Both are read in `src/config`, the only module
that touches the environment.

## Where things are

```
contract/openapi.json         the analyzer's read API, vendored at the pin in contract/PIN.md
src/config/                   one module: API base, posture flags, fixture or live
src/domain/                   the contract under domain names, the state vocabulary, the words
src/data/                     THE SEAM: generated client, live source, fixture corpus
src/design-system/            figures, chips, charts, tables, layout, chrome, navigation
src/features/                 dashboard, entity pages, health, drills, auth, system
src/app/                      the composition root and the route table
mockups/v3/                   the design mockups the pages were built to
```

**All server interaction goes through `DataSource`** (`src/data/source.ts`). Two
implementations, chosen once at bootstrap by config: `LiveDataSource` against same-origin `/v1`,
and `FixtureDataSource` over a seeded corpus whose every response is validated against the
committed spec. No component imports the generated client, calls `fetch`, or opens an
`EventSource`; that is lint-enforced rather than remembered.

**Features never import each other.** They import the shared layers only, and the layer rules
in `eslint-rules/layers.js` fail the build otherwise. `test/gates.test.ts` verifies each rule
fires, because a gate that has only ever passed is one nobody knows works.

| | |
|---|---|
| [`docs/design.md`](docs/design.md) | the laws, the information architecture, the chrome, the words on glass |
| [`docs/decisions.md`](docs/decisions.md) | the decisions behind the code, each with the alternative it beat |
| [`docs/gates.md`](docs/gates.md) | every check this repo runs, what it guards, how it is known to work |
| [`deps.md`](deps.md) | every dependency, with the reason it is here |
| [`contract/PIN.md`](contract/PIN.md) | which analyzer commit the vendored contract came from |

## The contract

The analyzer's read API is the contract. `contract/openapi.json` is a verbatim copy of the
analyzer's document at the pinned commit, `src/data/generated/api.d.ts` is generated from it,
and a scheduled canary regenerates against the analyzer's `main` so a break surfaces within
hours with the analyzer commit named. A change to a figure's meaning is a change in the
analyzer repository first; here it arrives as a pin move.

## Licence

GNU Affero General Public License, version 3 only (`AGPL-3.0-only`); see [`LICENSE`](LICENSE).
Contributions are accepted under the [`CLA`](CLA.md). Third-party components are enumerated in
[`THIRD-PARTY-NOTICES`](THIRD-PARTY-NOTICES), which travels with the bundle.
