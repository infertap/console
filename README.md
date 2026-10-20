# console

The InferTap console: the dashboard the analyzer serves, compiled into its binary and read
from the analyzer's versioned API.

**Working on it?** [`CONTRIBUTING.md`](CONTRIBUTING.md) is the way in: build, the gates,
the contract pin, the CLA.

The analyzer's read API (`docs/read-api.md` in the analyzer repository) is the contract this
repo renders, and `contract/PIN.md` names the commit it is pinned to. The console adds nothing
to what that contract states; the laws below say how it renders it.

## Running it

```
npm ci                  # never npm install; the lockfile is the build input
npm run dev             # fixture mode, the corpus at steady state
npm run build           # typecheck, bundle, then audit the artifact for external loads
npm test                # includes the gate tests, which assert every lint rule FIRES
npm run lint            # the layer boundaries and the laws on glass
```

`VITE_SOURCE=live npm run dev` runs against a daemon on `127.0.0.1:8088`, which needs
`--api-dev-origin http://localhost:5173` on the daemon side. `VITE_FIXTURE_AGE=t0` opens the
corpus at install time rather than steady state. Both are read in `src/config`, which is the only
module in this repo that touches the environment.

## Where things are

```
contract/openapi.json         vendored from the analyzer at the pin in contract/PIN.md
src/config/                   one module. API base, posture flags, fixture or live
src/domain/                   the contract under domain names, plus the view models
src/data/                     THE SEAM. generated client, live source, fixture corpus
src/design-system/            Figure, chips, charts, tables, layout, navigation
src/features/                 dashboard, health, holders, drill, auth, system, gallery
src/app/                      the composition root and the route table
mockups/                      the v3 design mockups the pages were built to; the rulings sit in their comments
```

**All server interaction goes through `DataSource`** (`src/data/source.ts`). Two implementations,
chosen once at bootstrap by config: `LiveDataSource` against same-origin `/v1`, and
`FixtureDataSource` over a seeded corpus whose every response is validated against the committed
spec. No component imports the generated client, calls `fetch`, or opens an `EventSource`, and
that is lint-enforced rather than remembered. Hooking up the standing rig is therefore
configuration, not code.

**Features never import each other.** They import the shared layers only, and
the local layer rules (`eslint-rules/layers.js`) fail the build otherwise. `test/gates.test.ts` verifies each rule
actually fires, because a gate that has only ever passed is one nobody knows works.

Decisions with their reasoning are in `docs/decisions.md`, every gate and how it is known to
work is in `docs/gates.md`, and every dependency justifies itself in `deps.md`.

## Laws, for whoever writes the next component

These are not style preferences. Each one is a claim this product makes about what it is.

1. **A number renders with its coverage, its register and its basis, or it does not render.**
   `Covered<T>` arrives as `{value, register, coverage, coverage_kind}` with all four always
   present. Never pull `.value` out and render it alone, and never format a number outside the
   design system. Both are lint errors.
2. **The two coverage bases are never interchangeable.** Token-weighted answers "at what coverage
   was this mass observed". Instance-time answers "was telemetry present at all". A fleet can sit
   at 99% on one and 40% on the other. A coverage figure rendered beside numbers states the basis
   of those numbers.
3. **The two registers never share an axis.** Recompute is `--petrol`, capacity is `--ochre`, an
   unrelated hue family, and the response says `never_summed_with` so the rule holds across the
   repo split.
4. **Words on glass are labels, units, provenance and definitions.** Never an interpretation, an
   adjective, advice, a recommendation, or a currency figure. State words come only from the
   five honest states and render as provenance-labelled chips.
5. **A refusal is a designed render, never a generic error.** The cause set is closed and typed;
   switch on it exhaustively. A refusal states its bound, because one that does not is the vague
   404 the whole scheme exists to prevent.
6. **Unexamined regions hatch. They never render as zero.** Before the first pass the API refuses
   with `no_pass_yet`, and that is a page state rather than a failure anybody caused.
7. **Summaries compress volume, never valence.** The impaired and unexamined counts appear in the
   summary whenever they exist, however small they are against the total.
8. **Hover teaches, click descends.** A definition says what a thing measures, how it is
   computed, its basis and its bound. It never reads the shape of the data. Clicking moves one
   level toward evidence and never sideways into interpretation.
9. **Motion only when data moved or the user acted.** Ingest renders as bursts because ingestion
   is bursty. Idle renders as honest idle, with only the freshness clock moving. Nothing loops,
   and `prefers-reduced-motion` resolves every sequence to its end state.
10. **Colour carries semantic state only.** Deltas render in neutral ink with their sign and carry
    magnitude geometrically: a rising token mass mostly tracks rising traffic, and colouring it
    would be a conclusion the meter has no basis for.
11. **URL is state.** Every view is addressable. Anything a reader might send to a colleague lives
    in the address.
12. **Perf budget: P95 panel under 150 ms, and no readable spinner.** A spinner that flashes for
    80 ms is worse than nothing appearing for 80 ms.
13. **No em dashes in UI strings.** Lint error. Use a colon, a full stop, or a comma.
14. **In fixture mode every figure wears the synthetic label.** Not a courtesy. A number that
    cannot be traced to a pass must say so.

## The IA, three levels

**Level 0 is the document.** One scrolling page that is the argument, in reading
order: verdict, the 90 day trend, what changed, worst holders, capacity, trust. The
trend appears exactly once in the product. The section index is a sticky margin nav
scoped to the document; it is not navigation between screens.

**Level 1 is drill pages**, each URL addressable with a breadcrumb back to the
document section that owns it: holders, holder, day, marker, health.

**Level 2 is evidence.** "Records behind this", raw window bounded, terminal
everywhere. There is nothing beneath it.

The left rail holds **destinations, never sections**: Document, Holders, Health,
then a system group of Declared inputs and About. Drill pages live under their
parents and never appear in the rail.

**There is no Reports destination.** `/v1/reports` was sidelined by ruling on
2026-08-04: the route is not reserved and not refusing, it does not exist. A rail
entry pointing at a surface the API has no answer for is a promise this product
cannot keep, and the mock's entry predates that ruling. `DESTINATIONS` in
`src/design-system/chrome/Rail.tsx` is the list; this paragraph describes it.

### Drill grammar

**Hover teaches, click descends.** Hover and the info button give definitions: what
this measures, how it is computed, its basis, its bound. Click moves one level toward
evidence and never sideways into interpretation. Anything clickable says so before it
is clicked.

### There is no first-run page

No route, no wizard, no onboarding overlay. The document has exactly one layout at
every age, and what changes with data is each section's state. Every section ships
three designed states, empty, partial and complete, rendered in place. Nothing appears
that was not always there, nothing relocates after filling, and sections never reflow.
They resolve.

On day one the page wears UNEXAMINED everywhere and looks intentional doing it. The
mock banner carries four snapshots of the same URL, t0 install through t3 steady
state, so a reviewer flips between them and watches only states change.

### The summary law

Summaries compress volume, never valence. The trust strip carries the impaired count
and the unexamined chip whenever they exist, at every age. Degradation is never hidden
by altitude; the detail lives on health.

## The words-on-glass law

This governs every string. The dashboard is a meter of facts. Words on glass are
labels, units, provenance and definitions. Never an interpretation, an adjective,
advice, a recommendation, or a currency figure.

State words come only from the honest-states vocabulary and render as
provenance-labeled chips: fine, impaired, unexamined, indeterminate, unobserved.

Definitions live in the info hover, never in body prose beside a chart, and a
definition teaches the axis: what it measures, how it is computed, its basis, its
bound. It never reads the shape.

The only comparison-shaped element permitted is the customer's own declared
threshold, drawn as their thin labeled rule across our measured mass. Geometry, not
prose.

No em dashes in customer-facing copy.

## Figure and ground

**Exactly one dark surface: the live status strip.** One row carrying the brand, the
wall-clock vitals, and the two controls. The rule behind it is semantic rather than
decorative:

- the **dark strip** carries wall-clock-live facts: LIVE, next tick, segment, lag,
  horizon, discriminator
- the **light canvas** carries pass-clock accounting: every figure that moves only
  when a pass completes

A number never crosses that boundary. If it sits on the strip it is ingest or health;
if it sits on a plate it advances through the slide-forward affordance and nowhere
else.

The rail is one tint step off the canvas with a hard hairline edge and an accent
indicator on the active item. It is distinguished by tint and edge, never by ink,
because a second dark band would spend weight the wall clock has not earned.

Sections render as flat white plates on the cream canvas, with one inter-plate
spacing token visibly larger than any intra-plate gap. The hero is the exception and
stays full-bleed and un-plated: it is the page's single primary gauge. The fleet name
renders once, in the chrome, so the page opens directly on its canonical stamp.

The mock banner is amber test-rig tape, deliberately not product chrome, so it stops
adding mass to the frame in screenshots.

## The de-duplication rule

Every fact renders exactly once, at its strongest position. Where a fact had two
renders, the weaker one was deleted rather than relabelled.

| fact | its one position |
|---|---|
| current fraction | the live edge of the trend, pinned to the last observed point |
| register and denominator | the sums footer |
| next tick | the LIVE badge in the top bar |
| last segment, ingest lag, raw horizon, discriminator | the status line |
| window, last pass, semantics, state | the context bar |
| coverage, holders, instances, producer runs | the trust footer |
| seam detail | the marker chip, on hover, and the marker page on click |

## Document typography and stamping

Major sections take the **serif display tier**. Mono small-caps is demoted to
panel-internal labels only, so the article voice lasts the whole scroll instead of
one section and the section index reads as a table of contents rather than a tab bar
rotated ninety degrees.

**Section names are parameter-free.** A section is named for the question it answers,
never for a current parameter value: Trend, not "90 days". The window lives in the
stamp, where parameters belong. The test applied forward is that every index entry
should still be correct in 2028.

**One canonical stamp, exceptions explicit.** The document declares its stamp once,
under the title. Sections that match stay silent, so a section that deviates is
visible by contrast rather than by volume. At steady state exactly one section stamps
itself, the capacity register with its raw-window bound. While the document fills,
per-section stamps reappearing is itself the progress indicator.

**One rail does both jobs.** The section index docks into the left rail as indented
children of Document, the docs-site pattern. The right flank is freed entirely, which
gives the content column its width back at 1440 and stops two navigation systems
competing to highlight on scroll. Collapsed, the section index stays as ticks so
scroll position is still legible without labels.

## Instrument conventions

- Tabular lining numerals everywhere. Serif for verdict figures and screen titles,
  mono as the provenance voice.
- Axes labeled in real units: tokens, events, fraction of stored mass, ms gaps.
- Coverage renders as a quiet ribbon under each series, never a competing line.
- Seam markers are labeled vertical rules carrying footnote daggers. A seam that
  changes the number's meaning breaks the series; a deploy marks it and does not.
- Unexamined regions hatch out. They never render as zero.
- Every panel carries its own freshness stamp. Nothing implies scrape freshness.
- Colour carries semantic state only. Deltas render in neutral ink with their sign
  and carry magnitude geometrically, because a rising token mass mostly tracks
  rising traffic and colouring it would be a conclusion the meter has no basis for.
- Comparison windows are discriminator-clean by construction. Where a breaking seam
  falls inside one, the window scopes to its longest clean range and says so, and any
  metric that cannot be re-derived over that range is refused with its reason.
- The synthetic fixtures are one coherent dataset: the two comparison windows sum to
  the full-window figure, classes sum to their total, coverage is token-weighted from
  its parts, and every seam's date is computed from its day index so the two can
  never disagree.

| token | meaning |
|---|---|
| `--petrol` | the recompute register, and the site's "measured" colour |
| `--ochre` | the capacity register, an unrelated hue family, so dashboard §1.1's separation of the two registers holds by construction |
| `--crimson` | attention-worthy findings, and nothing else |

## Motion law

Things move when data moved or the user acted. Ingest renders as bursts because
ingestion is bursty. Idle renders as honest idle, with only the freshness clock
moving. Nothing loops. `prefers-reduced-motion` resolves every sequence to its end
state.

## How this talks to the analyzer

**Built, as of the scaffold session.** A typed client generated from `contract/openapi.json`,
which the analyzer generates from its Rust wire types and commits. Panels never touch SQL and
never hand-write a request shape. Per dashboard §9 the panel list, the DAO method list and the
endpoint list are the same list, and `test/contract-parity.test.ts` asserts the data layer calls
every path the contract publishes.

Every figure arrives as a `Covered<T>`: `{value, register, coverage, coverage_kind}`, all four
always present. A number without its coverage is unrepresentable in the Rust type, on the wire,
and in the generated client, and nothing here may reconstruct one by pulling `.value` out and
rendering it alone.

Two coverage bases exist and are never interchangeable. Token-weighted answers "at what coverage
was this mass observed". Instance-time answers "was telemetry present at all". A coverage figure
rendered beside numbers states those numbers' basis.

The stream is `GET /v1/events`: `pass_completed` says the figures are stale and names the window
to refetch, `ingest_batch` feeds the dark strip, `resync` says the server cannot replay the gap
and we should refetch rather than assume continuity. All three are handled inside the data layer
and are invisible to components, which see only that a read re-ran.

## The mock

`mockups/v3/` is the design the pages were built to and stays in the repo; start at
`mockups/v3/index.html`. Open any file directly, there is no server and no network fetch.

```
mockups/v3/index.html                 the dashboard
mockups/v3/holders.html               Ranks
mockups/v3/health.html                the detail behind the trust strip
mockups/assets/console-v3.css         the v3 tokens, over console-v2.css
mockups/assets/console-v2.css         tokens, chrome, instrument components
mockups/assets/console-v2.js          chrome, chips, info hovers, the trend primitive
mockups/assets/data-v2.js             the synthetic world, ported to src/data/fixture/world.ts
mockups/assets/fonts/                 vendored woff2, zero external fetches
```

**Port it, do not redesign it.** Where the mock and the contract disagree the contract wins and
the disagreement gets recorded, because the mock was drawn before some of the API existed. The
known case is the 90-day trend: the mock draws one series across a `semantics_version` seam with
a labelled break, and the API returns `figures: null` with a refusal for the superseded
generation instead. See `docs/decisions.md` §2.

## Identity

Palette and type extend `infertap-site` (`src/styles/global.css`), which already
states the rule the console needs: two colours carry meaning and never decorate.
Chrome is editorial, data surfaces are instrument-grade, and the whole thing is
light-first by decision. A light editorial surface is the moat in a hall of dark
dashboards.

Faces are vendored from the same `@fontsource` packages the site uses, so the
mockups load with zero external fetches, as the product will.

## Viewport scope

**The desk is the target. Mobile is not.** This is a desk-cadence reading instrument,
so the layouts are designed for a laptop or larger and narrow widths are kept
correct rather than optimised.

Correct means the page never scrolls sideways and nothing is clipped: wide content
scrolls inside its own box. It does not mean every element is well placed at 390. In
particular the meter face's live-edge figure sits in the chart's right gutter, so on
a phone it is reached by scrolling the chart rather than on first paint. That is a
known and accepted consequence of pinning the figure to its trajectory, which is the
point of the device, and it is not a defect to fix.

## Checking a mockup

Headless Chrome on macOS clamps its window to roughly 485px, so `--window-size=390`
lays out at 485 and crops the capture, which reads as a broken layout when nothing is
broken. Load the page in a 390px iframe instead and compare
`documentElement.scrollWidth` against `clientWidth`.

## Licence

GNU Affero General Public License, version 3 only (`AGPL-3.0-only`); see [`LICENSE`](LICENSE).
Contributions are accepted under the [`CLA`](CLA.md). Third-party components are enumerated in
[`THIRD-PARTY-NOTICES`](THIRD-PARTY-NOTICES), which travels with the bundle.
