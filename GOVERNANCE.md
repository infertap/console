# Governance

How decisions about the InferTap console are made, today and as the project grows.

## Today: company-led

InferTap maintains the console and decides its direction. The maintainers are listed in
`MAINTAINERS.md`; `.github/CODEOWNERS` maps each area of the tree to who reviews it. The
lead maintainer has the final say on design, scope and releases.

This is a deliberate starting point, not a permanent one. A single accountable owner is
what lets a young project keep its invariants, the laws on glass, the layer boundaries and
the contract pin, while the code moves fast.

## How decisions are made

- **Design changes** are written down before they are built. A proposal states the
  problem, the options, the ruling and what it does to the product; the ruling is recorded
  with its date in `docs/decisions.md`. Contributors are welcome to write proposals; the
  maintainers rule on them.
- **Code changes** land through pull requests, one task per commit, behind the gates in
  `CONTRIBUTING.md`. A maintainer reviews every change to the areas they own.
- **The contract** is the analyzer's. The console renders what the pinned specification
  says and adds nothing to it; a change to a figure's meaning is a change in the analyzer
  repository first.
- **Disagreements** are settled by the reviewing maintainer; escalation is to the lead
  maintainer, whose ruling is final and recorded.

## Becoming a maintainer

A contributor who has landed substantial, reviewed work in an area, understands its
invariants, and reviews others' changes well may be nominated by an existing maintainer.
The lead maintainer confirms; the new maintainer is added to `MAINTAINERS.md` and
`CODEOWNERS`.

## Later: foundation-ready

When the console has maintainers from more than one organisation, this document moves to
a structure that can outlive any one company: a steering group with a documented charter,
maintainer votes for contested decisions, and a path to a neutral foundation. The
licensing choices already allow it: contributions come in under a CLA (`CLA.md`) that
lets the project relicense, so a future home can pick the terms that suit it.

## Changing this document

By pull request, ruled on by the lead maintainer, dated in the commit.
