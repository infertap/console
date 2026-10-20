# Dependencies

**Every entry enters through this file with a one-line justification.** The allowlist culture is
ported from the analyzer, where a dependency event is a commit that says what it bought and what
it cost. A package that is not listed here should not be in `package.json`, and a package listed
here that nothing imports should be removed.

Posture, enforced by `.npmrc` and CI:

- `ignore-scripts=true`. No dependency runs code at install time.
- `save-exact=true`, lockfile committed, `npm ci` only. No ranges, no resolution surprises.
- Node pinned in `.node-version`, `.nvmrc` and `package.json#engines`.
- `npm audit` and a licence floor run in CI, where a human reads the result.

## Runtime, 3 packages

The whole shipped dependency set. Everything else in this repo is written here or generated from
the contract.

| package | why |
|---|---|
| `react` | The component model. `<Figure>` requiring coverage, register and basis at the type level is the law made unrenderable-if-violated, and that needs typed props. |
| `react-dom` | Renders it to a browser. |
| `scheduler` | Transitive, React's own. Not chosen. |

**Deliberately absent, and each absence is a decision rather than an oversight:**

- **No chart library.** The trend is a hand-drawn SVG instrument: hatched unexamined regions, a
  coverage ribbon under the series, labelled seam rules carrying footnote daggers, the live-edge
  figure pinned in the right gutter. Every one of those is a law in the README rather than a
  chart feature, and 90 points needs no canvas engine. **The trigger that reopens this**, written
  so it is a decision and not inertia: a series past roughly 2000 points, or live streaming at
  event grain. Both are named in `docs/dashboard.md` §10 as measurements owed before finer
  rollups exist, so neither can arrive by surprise.
- **No router.** URL is state everywhere is a law here, which makes what a router owes this
  product small: parse the address, keep it in sync, never invent a state the address cannot
  express. `src/design-system/navigation/router.tsx` is about a hundred lines and would otherwise
  be the largest thing in the bundle after React.
- **No CSS framework.** Design tokens as CSS custom properties plus CSS modules. The tokens are
  ported from the mock, which is the design source of truth; a framework would bring a second
  opinion about spacing and colour into a product where colour carries semantic state only.
- **No data-fetching library.** `useResource` is forty lines over the `DataSource` seam. What a
  query library adds is caching and revalidation policy, and this product's revalidation policy
  is one line long: refetch when the server says a pass landed.
- **No date library.** The corpus is UTC days and epoch milliseconds, which `Date` handles.
- **No icon set.** The chrome is typographic.
- **No client runtime for the API.** `openapi-typescript` generates types only, and the transport
  is hand-rolled over them in `src/data/live/http.ts` so the route table is checked at compile
  time. What a client runtime would have added beyond that is error handling, and this product
  has opinions about errors that no library shares.

## Build and test

Never shipped. Present because the alternative is worse, and each line says why.

| package | why |
|---|---|
| `vite` | Build and dev server. Origin-relative static output is the shipped artifact. |
| `@vitejs/plugin-react` | JSX transform and fast refresh. |
| `typescript` | Held at 5.9.3, not 7.x: `openapi-typescript@7` peers `^5`, `typescript-eslint@8` peers `<6.1`. Moving it moves both, which is a dependency event rather than a bump. |
| `@types/react`, `@types/react-dom`, `@types/node` | Types for the above. |
| `openapi-typescript` | Generates `src/data/generated/api.d.ts` from the committed spec. Types only, zero runtime. The analyzer hand-verified this exact toolchain at `--strict` with zero `any` before the repo split. |
| `eslint`, `typescript-eslint` | The lint host. |
| `eslint-plugin-react-hooks` | Catches the class of bug that renders stale figures. It rejected the first `useResource` for writing a ref during render and for a cascading `setState`, both of which were real. |
| `@eslint/js` | ESLint's own recommended set. |
| `vitest` | Test runner, shares the Vite transform so tests and the bundle see one build. |
| `jsdom` | DOM for component tests. |
| `@testing-library/react` | Component tests that assert what a reader sees rather than what the tree contains. |
| `ajv` | **Validates every fixture response against the committed spec.** This is the compensating mechanism `read-api.md` §2.2.1 named: assert the spec's schemas validate the bytes. It caught a malformed stamp on its first run and found contract finding 10. |

The architecture ratchet (feature isolation and the data seam) is no dependency: it is local,
in `eslint-rules/layers.js`, because the plugin it replaced carried `braces`, a high advisory
with no patched release. `test/gates.test.ts` verifies each of its rules fires.
