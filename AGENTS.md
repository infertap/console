# For coding agents

This file is for any AI coding agent working in this repository. It is short on purpose:
the rules are in `CONTRIBUTING.md`, and they apply to an agent exactly as they apply to a
person.

- Read `CONTRIBUTING.md` first, then the laws in `docs/design.md`. Every component obeys
  them, and the lint rules enforce most of them; `docs/gates.md` says which.
- One task per commit. Run `npm run typecheck`, `npm run lint`, `npm test` and
  `npm run build` before a push; CI runs the same and more, and its verdict is read after
  every push.
- Never edit `contract/openapi.json` or `src/data/generated/api.d.ts` by hand. The spec is
  the analyzer's; move the pin as `CONTRIBUTING.md` describes or report the finding there.
- Words on glass come from `src/domain/language.ts`. Wire words never render.
- A contribution from an agent is a contribution: it goes through a pull request, a
  maintainer's review and the CLA like any other.
