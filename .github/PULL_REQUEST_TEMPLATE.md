## What this changes

<!-- One task per pull request. Say what changed and why; the commit message carries the detail. -->

## Behaviour

<!-- Pick one and say how you know. -->

- [ ] Behaviour-preserving: no rendered word, figure or route changed.
- [ ] Behaviour changes: which panel, law or contract moved, and why that is the intended change.

## Checks

- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass locally.
- [ ] A moved contract pin updates `contract/PIN.md` (commit, date, SHA-256, history row) and regenerates the client in the same commit.
- [ ] A new dependency is in `deps.md` with its reason, and `THIRD-PARTY-NOTICES` is regenerated.
- [ ] Documentation that describes what changed is updated in the same commit.
- [ ] I have signed the CLA (`CLA.md`), or I am a listed maintainer.
