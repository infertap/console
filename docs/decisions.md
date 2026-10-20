# Decisions

What was decided at the scaffold session, and why. Each entry names the alternative it beat, so
a later reader can tell whether the reason still holds.

---

## 1. Where the generation check runs, and what generates

**Decided: `openapi-typescript` as a dev dependency, a hand-rolled transport over the generated
types, and a scheduled canary in this repo.**

The analyzer's read API document framed a choice between typed-struct-grade schemas and
generate-from-the-hand-written-block plus a parity test. **That question was answered upstream**
before this repo existed: `utoipa` landed, the schemas derive from the wire
types, and `$ref` targets read off `ToSchema` so renaming a wire struct moves the reference with
it. There was nothing left for this session to pick.

What this repo inherited was the next question: **where the generation check runs.** Three
mechanisms, and knowing which one guards which property is worth more than an extra job added
for the feeling of coverage:

| mechanism | what it guards | where it lives |
|---|---|---|
| the analyzer's `contract` job | freshness: the committed spec matches what the binary emits | analyzer |
| `openapi::tests` | the properties generation depends on: refs resolve, enums present, operationIds unique | analyzer |
| **a real generator run** | **the thing itself** | **here, `.github/workflows/canary.yml`** |

The trade is not detection. A break is caught either way. It is **attribution latency and
toolchain locality**: consumer-side-only enforcement means a spec regression lands green
upstream and surfaces days later as a foreign repository's build failure. Putting Node in the
analyzer's CI would close that gap at the price of a foreign toolchain in a pipeline that is
otherwise all cargo-native. Running it here on a schedule closes it to hours and names the
analyzer commit, and the analyzer's CI stays pure.

It also matches the production posture: the daemon serves the console bundle it shipped with, so
skew is nearly impossible in a deployment. The canary protects development, which is where the
risk actually is.

**What the canary needs to run, and why it is not free.** The job lives in `console` and reads
`analyzer`, and GitHub scopes the automatic `GITHUB_TOKEN` to the repository the job runs in, so
one owner is not enough: it needs a credential.

**It reuses the analyzer's own pattern rather than inventing a second one.** That repo already
solves this problem for its contract submodule, and copying it was worth more than the deploy key
this session first reached for:

- **Same secret name, `CONTRACT_PAT`**, because it is the same concept: the credential that lets
  CI read the contract from wherever it lives. In `console` it wants Contents:Read on
  `infertap/analyzer`; in `analyzer` it wants Contents:Read on the tap. One name, one idea.
- **Not `actions/checkout`'s `token:` input.** The analyzer's workflows carry the reason in a
  comment, and it is a trap worth inheriting: that credential is reused for the primary clone, so
  a PAT scoped to one repository makes checking out the OTHER fail with 403. A plain clone with
  the token in a git URL rewrite keeps the PAT at exactly one repository's Contents:Read.
- **Actions pinned by commit SHA with the tag in a comment.** A tag is a mutable pointer somebody
  else controls, and a repository that commits its lockfile, pins its Node version and refuses
  install scripts should not then execute whatever `@v7` means today. The console pins the same
  SHAs the analyzer does.

Until the secret exists the workflow **fails on that step and names the remedy**, rather than
dying inside a checkout with a permissions error. A scheduled job that cannot run, but looks
scheduled, reads as coverage nobody has.

It is also honestly deferrable. The canary guards against the contract moving during development,
and while the pin is re-vendored by hand at a far tighter loop than four hours it protects
against a risk that is not yet live. It wants to exist before a second person touches either
repository, and not necessarily before that.

---

## 2. Fixture provenance

**Decided: a generator in this repo, emitting contract-shaped envelopes, validated against the
committed spec.**

The first ask was "the corpus golden bytes." Those do not exist as bytes.
`crates/api/tests/goldens.rs` asserts in-process against a live pass over three store records and
one batch; nothing is written to disk, and this repo does not edit the analyzer. Even dumped,
that dataset renders no 90-day trend, no 468 holders, no three seams and no four ages.

The brief's real concern was that hand-written fixtures drift into flattery. The mock's
`data-v2.js` was never hand-written JSON either: it is a seeded generator with arithmetic
invariants computed at the bottom of the file. So the choice was not "golden bytes versus
hand-written" but **what checks the generator**.

Three things do:

1. **`test/fixture-parity.test.ts`** validates every response against `contract/openapi.json`'s
   own schemas, resolved by JSON Pointer into the document so the `$ref`s resolve against the
   contract as published. Before per-path schemas existed this would have passed trivially and
   read as coverage. It does not pass trivially now: **it caught a malformed stamp on its first
   run**, which the analyzer then fixed.
2. **`src/data/fixture/world.test.ts`** promotes the mock's invariants from a computed footer to
   assertions. Later plus earlier equals the full window, the classes sum to their total, all 468
   holders sum to the fleet figure, every seam's date derives from its day index.
3. **The corpus is shaped by the contract, not by the mock.** Where they disagree the contract
   wins and the disagreement is recorded. The clearest case: the mock draws one 90-day series
   across a `semantics_version` seam with a labelled break, and the API cannot do that. A segment
   under superseded semantics serializes `figures: null` with its refusal, so a third of that
   trend is unstatable rather than annotated. Rendering it the mock's way would be the console
   inventing a number the meter refuses to state.

What this proves: every response the corpus emits would deserialize on the other side of the
seam. What it does not prove: that the analyzer would emit these values. Nothing on this side of
the repo split can prove that, which is what the canary and live mode are for, and saying so is
cheaper than pretending otherwise.

---

## 3. React 19 and Vite

**Decided over Preact and over no framework.**

`<Figure>` requiring coverage, register and basis is the central law made unrenderable-if-
violated, and that wants typed props checked at compile time. React gives that, gives
route-level splitting through `lazy()`, and is the thing a second engineer reads without a
preamble. Preact would have saved a few kilobytes over a bundle whose weight is not the
constraint. Going frameworkless would have meant hand-rolling a render and state model, which is
real work and real risk against the four-ages requirement, where one layout must resolve through
four states without reflowing.

Three runtime packages ship: `react`, `react-dom`, and React's own `scheduler`. Everything else
in `deps.md` is build-time.

---

## 4. The chart layer: the mock's SVG, ported

**Decided over uPlot, the one heavyweight dependency that had been on the table.**

The mock's trend is about 150 lines of hand-drawn SVG, and every feature of it is a law rather
than a chart option: hatched unexamined regions that never render as zero, a coverage ribbon
under the series instead of a competing line, labelled seam rules carrying footnote daggers,
the live-edge figure pinned in the right gutter, the customer's declared threshold as a thin
labelled rule. uPlot draws to canvas, so all of that becomes custom plugin work, which is
redrawing the instrument rather than porting it. The mock is the design source of truth and the
instruction was to port it.

The volume argument does not hold either: the trend is 90 points, the holders table is order
hundreds of rows, and uPlot earns its place at a hundred thousand points with live streaming.

**The trigger that reopens this, so it is a decision and not inertia:** a series past roughly
2000 points, or live streaming at event grain. Both are measurements the analyzer owes before
any finer rollup exists, so neither can arrive by surprise. The chart
lives behind one module so the swap stays contained.

---

## 5. No router dependency

URL is state everywhere is a law here rather than a convention, which makes what a router owes
this product small and specific: parse the address, keep it in sync with what is on screen, and
never invent a state the address cannot express. `src/design-system/navigation/router.tsx` is
about a hundred lines. A routing dependency would have been the largest thing in the bundle
after React and would have brought routing concepts this product has ruled out.

The navigation primitives live in the **design system**, not in `app/`, and the boundary lint is
what established that: every feature renders links, because hover teaches and click descends, so
a feature that could not link could not obey the drill grammar. The route table stays in `app/`
where composition belongs. That correction was made by a failing lint rather than by review,
which is the argument for the lint.

---

## 6. Enforcement, and what it costs to be sure

Every architectural rule here is checked, and **every check is verified failing** in
`test/gates.test.ts` rather than as a one-time ritual somebody remembers performing. Nine
violations are linted through the real config and asserted to produce the real rule.

This was not ceremony. Deliberately breaking the resolver configuration showed three tests going
red, including a negative control, and revealed that with import resolution broken a *different*
rule fires: the positive gates would still have looked green while checking nothing. That is
exactly the failure mode these tests exist to catch, and it is invisible to a passing build.

---

## 7. Sign-in, deferred to its own design pass

**Decided 2026-08-05: the mechanism ships, the screen does not.**

The reason is not time. **There is no login in the mock** — nine pages, none of them auth, no
sign-in copy anywhere in the design source. Every other surface in this console is a port of a
design that was reviewed, checked against a screenshot of the original, and corrected three
separate times where it had drifted. A sign-in screen would be the one screen invented at the end
of a long session with nothing to check against, and it gates every other screen, so a plausible
and slightly wrong version is expensive.

**What ships, and is not placeholder:**

- The token posts as a JSON body, per the contract, not a bearer header.
- Nothing stores the token. The cookie is `HttpOnly`, so this code cannot read it by design and
  can only discover the session is gone when a 401 arrives.
- **Session loss is an app-level state.** A panel can honestly say a figure is past the raw
  horizon; no panel can usefully say "you are not signed in", because that is not a fact about
  the panel. On a genuine first load every read 401s at once, and five plates each correctly
  reporting the same fact is a worse render than one. The provider raises one flag and the shell
  renders the prompt in place of the outlet.
- **Signing in does not navigate.** The shell swaps the outlet while the address stays where it
  was, so a reader who pasted `/holder/i-004/0/1` lands back on `/holder/i-004/0/1`. URL is
  state, and an interruption is not a reason to discard what somebody asked for.
- The strip renders nothing without a session rather than a stale LIVE. It carries observed
  facts and it has observed none.

**What the design pass owes, and the questions it has to answer:**

- **What an operator sees the first time they open this product.** That is the real subject, and
  it deserves the treatment the four ages got rather than a form with a submit button.
- **The threat model is not a public login page.** The daemon binds loopback by default, the
  console is served from the daemon's own mount, and the expectation is that an operator reaches
  it having already SSH'd to the host. Somebody who has crossed that boundary is in a different
  posture, and a screen written for the open internet would be dressing up a door that is already
  inside the building.
- **Sign-out has nowhere to live yet.** `DELETE /v1/session` is built and approved upstream, on
  the reasoning that a realm which can be entered and not left is a gap, and nothing in this UI
  calls it. The rail's system group is the current lean.
- **Whether the corpus should refuse a scripted token.** It always succeeds today, which means
  the failure render — the one an operator meets when they paste a truncated token — is a state
  nobody has ever seen. Everything else in this product gets built and photographed before it
  ships, and that argues for scripting a refusal.
- **The password-manager posture.** `autoComplete` is off, which blocks managers. A viewer token
  is arguably exactly the sort of thing an operator should keep in one. A security call rather
  than a design one.

**Blocked on nothing.** `token issue | rotate | list` landed in the analyzer CLI, so a human can
mint a credential and a real session is exercisable for the first time. The pass can be built
against something real instead of against prose, which is a reason to do it properly rather than
a reason to do it now.

---

## 8. The unlistable-holders count, deleted rather than relabelled

**Decided 2026-08-06: the console states the bound and renders no number, because the contract
publishes no such population.**

The mock's worst-holders footer and trust strip both carried a count of holders that reported
and no pass had covered, drawn from `POP.holders_unexamined` in `data-v2.js`. The port
reproduced it with a function in `DocumentRoute` that returned `1` whenever anything at all was
listable. **It was a constant wearing a metric's clothes.** It moved with nothing, it was
measured by nothing, and it rendered in two positions a reader is entitled to read as fact.

That is Law 1 inverted. A product that will not let a number render without its coverage, and
that hatches unexamined regions rather than zeroing them, cannot then invent a figure of its own
and set it beside the measured ones.

**Why it could not simply be wired up.** The population is real; nothing on the wire states it:

| candidate | what it actually counts | why it does not answer |
|---|---|---|
| `Page.total_rows` on `/v1/holders` | holders a pass covered and listed | the covered population, which is the smaller of the two |
| `Comparability.holders_observed` on `/v1/residual` | holders inside comparable stores | a different bound (raw window) and a different scope (same-model groups) |
| `RosterData.state_counts` | producer **runs**, per its own doc comment | run grain, never holder grain |

Differencing any two of those would produce a number whose denominator and numerator come from
different windows at different grains. That is the quiet-wrong class this repo spends its whole
budget avoiding, and it is worse than the placeholder, not better.

**What replaced it.** Two renders, both of published fact:

- The worst-holders footer now names the population it counted: *holders a pass covered*, not
  *holders that reported*. Those are different numbers and the old copy printed the first under
  the name of the second. The footer then states the bound, that holders which reported without
  being covered are outside that denominator and no read says how many.
- The trust strip renders `RosterData.cannot_tell_you`, which is required on the wire, was
  carried by the fixture corpus from the first commit, and had never been rendered anywhere:
  *"the roster is observed. A holder that never reported leaves no trace here, so this is not an
  inventory of what exists"*. The analyzer's own sentence about its blind spot, in the position
  the invented count used to hold.

The trust tile label moved with it, `holders reporting` to `holders covered`, for the same
reason: it is fed by `total_rows`.

**This is the mock losing to the contract**, which is the standing rule, and it is recorded here
because that rule requires the disagreement to be written down. The mock was drawn before the
API existed and its footer asserted a population the API never grew a field for. If the analyzer
later publishes a reported-but-uncovered count, this becomes a figure with a basis and both
surfaces can carry it; until then the honest render of a number nobody measured is no number.
