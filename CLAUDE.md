# Working in this repo

`AGENTS.md` is the short list for any coding agent. `CONTRIBUTING.md` holds the rules for
everyone. This file adds what to run and what to read before changing a panel.

## Writing

One instruction per sentence. Use the active voice. Use one word for one meaning, and the
same word for the same thing every time. Keep sentences short. Docs state what the code is,
not what it replaced.

## Before a push

    npm run typecheck
    npm run lint
    npm test
    npm run build

All four are judged by exit code. CI runs the same, plus the licence floor, the third-party
notices, `npm audit` at high severity, the SPDX headers and the generated-client no-op
check. After pushing, read CI's jobs:

    gh run list --limit 1
    gh run view <id> --json jobs -q '.jobs[]|"\(.conclusion) \(.name)"'

## The design of record

`mockups/v3/` is the design the console renders: `index.html` (the dashboard),
`holders.html` (Ranks) and `health.html`. The rulings sit in the mockups' header and inline
comments, at the site of each decision. `docs/decisions.md` records the decisions behind the
code with the alternative each one beat.

## The contract

`contract/openapi.json` and `src/data/generated/api.d.ts` are never edited by hand. A change
to a figure's meaning is a change in the analyzer repository first; here it arrives as a pin
move (`CONTRIBUTING.md`).
