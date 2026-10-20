# Contributing

How to build, test and land a change. `README.md` maps the tree and `docs/design.md` carries
the laws every component obeys; read those first if the words here are new.

## Build

Node is pinned in `.node-version` (and `.nvmrc`); `package.json#engines` refuses another major.

    npm ci                  # never npm install; the lockfile is the build input
    npm run dev             # fixture mode, the corpus at steady state
    npm run build           # typecheck, bundle, then audit the artifact for external loads

`.npmrc` sets `ignore-scripts=true` and `save-exact=true`: no dependency runs code at install
time, and no version range reaches the lockfile. `deps.md` lists every dependency with the
reason it is here; a package enters through that file.

`VITE_SOURCE=live npm run dev` runs against an analyzer on `127.0.0.1:8088`, which needs
`--api-dev-origin http://localhost:5173` on the analyzer side.

## Test

    npm run typecheck
    npm run lint            # the layer boundaries and the laws on glass
    npm test                # vitest, including the gate tests

`test/gates.test.ts` lints deliberate violations through the real configuration and asserts
that every rule fires, so a gate that only ever passed is not a gate anyone trusts.
`docs/gates.md` names every check and what it guards.

## The contract

`contract/openapi.json` is a verbatim copy of the analyzer's at the commit `contract/PIN.md`
names, and `src/data/generated/api.d.ts` is generated from it. Neither is edited by hand.
To move the pin:

    cp ../analyzer/contract/openapi.json contract/openapi.json
    npm run gen:client

Then update the commit, the date and the SHA-256 in `contract/PIN.md`, add a row to its
history table, and let `npm run typecheck` name every file the change reached.
`test/contract-pin.test.ts` fails when the digest and the bytes disagree. A spec that looks
wrong is a finding to report in the analyzer repository, not to patch here.

## The contributor licence agreement

This repository accepts contributions under the InferTap Contributor License Agreement,
`CLA.md`. It is modelled on the Apache ICLA and it grants InferTap the right to relicense,
which is what lets the project change its licence later without asking every contributor
again. You keep your copyright.

Sign it once: comment on your first pull request with exactly

    I have read the CLA Document and I hereby sign the CLA

The CLA assistant records the signature and checks every later pull request; a pull
request from an unsigned author is held until the comment is there. Contributing on behalf
of an employer is section 7 of the agreement.

## Landing a change

- One task per commit. Say what changed and why in the commit message.
- Changes land through pull requests; CI runs typecheck, lint, the tests, the build with its
  bundle audits, the licence floor, the third-party notices, `npm audit` at high severity,
  the SPDX headers and the generated-client no-op check. Push only when those pass locally.
- A new dependency enters through `deps.md` with its reason, and `THIRD-PARTY-NOTICES` is
  regenerated in the same commit (`npm run notices`).
- Every source file starts with `// SPDX-License-Identifier: AGPL-3.0-only`
  (`/* ... */` in a stylesheet); `node scripts/spdx-check.mjs` lists any that do not.
- `.github/CODEOWNERS` names who reviews which area.
