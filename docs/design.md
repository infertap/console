# Design

What the console is on the glass, and the laws every component obeys. `README.md` maps the
tree; `decisions.md` records why each choice beat its alternative; `gates.md` says which of the
laws below are enforced by a lint rule and how the rule is known to fire.

## The laws

These are not style preferences. Each one is a claim this product makes about what it is.

1. **A number renders with its coverage, its register and its basis, or it does not render.**
   A figure arrives as `{value, register, coverage, coverage_kind}` with all four always
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
6. **Unexamined regions hatch. They never render as zero.** Before the first tick the stamp says
   no day is classified, and that is a page state rather than a failure anybody caused.
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
    cannot be traced to a tick must say so.

## The information architecture

Three levels, and the address names each one.

**Level 0 is the dashboard**, one scrolling page in reading order: repeat compute, placement,
trust. The anchor line is the hero. The thrash lens is the repeat-compute meter's face, with
its curve a drill beneath it. Markers sit on every metric chart, with attribution as an
interaction on the panel rather than a section of its own. Duplication is measured in
token-hours.

**Level 1 is the entity and health pages.** The fleet page is the front door of the facet
hierarchy, fleet to workload to instance to rank; rank is a section of the instance page, not a
destination. The health page is where a nonzero trust chip gets investigated: delivery, ingest,
staleness, model identity, coverage, degradations.

**Level 2 is evidence**: the day, the marker, the block, the records behind a figure. Each is
addressable with a breadcrumb back to the page that owns it. There is nothing beneath it.

The left rail holds **destinations, never sections**: Dashboard, Fleet, Health. A destination
owns the drill pages beneath it, so the rail stays lit while a reader is inside one. `/about`
stays addressable but is not in the rail, because a rail entry is a promise of a daily
destination. There is no Reports destination: the API has no such route, and a rail entry
pointing at a surface the API has no answer for is a promise this product cannot keep.
`DESTINATIONS` in `src/design-system/chrome/Rail.tsx` is the list.

### There is no first-run page

No route, no wizard, no onboarding overlay. The dashboard has exactly one layout at every age,
and what changes with data is each section's state. Every section ships its designed states,
rendered in place. Nothing appears that was not always there, nothing relocates after filling,
and sections never reflow. They resolve.

On day one the page wears UNEXAMINED everywhere and looks intentional doing it. The fixture
corpus scripts four ages of the same address, `t0` install through `t3` steady state
(`VITE_FIXTURE_AGE`), so a reviewer flips between them and watches only states change.

### The summary law

Summaries compress volume, never valence. The trust section carries the impaired count and the
unexamined chip whenever they exist, at every age. Degradation is never hidden by altitude; the
detail lives on health.

## The words on glass

This governs every string. The dashboard is a meter of facts. Words on glass are labels, units,
provenance and definitions. Never an interpretation, an adjective, advice, a recommendation, or
a currency figure. Wire words never render: every label comes from `src/domain/language.ts`.

State words come only from the honest-states vocabulary in `src/domain/state.ts` and render as
provenance-labelled chips: fine, impaired, unexamined, indeterminate, unobserved.

Definitions live in the info hover, never in body prose beside a chart, and a definition teaches
the axis: what it measures, how it is computed, its basis, its bound. It never reads the shape.
The hover vocabulary is `src/design-system/info/definitions.ts`.

Sub-block heads carry the role in plain words ("how soon it comes back", "around each deploy");
the method name is the hover title.

## Figure and ground

**Exactly one dark surface: the status strip.** One row carrying the brand, the wall-clock
vitals and the controls. The rule behind it is semantic rather than decorative:

- the **dark strip** carries wall-clock-live facts: LIVE, the next tick, the last segment,
  ingest lag, the raw horizon, the discriminator
- the **light canvas** carries tick-clock accounting: every figure that moves only when a tick
  completes

A number never crosses that boundary. If it sits on the strip it is ingest or health; if it sits
on a plate it advances only when a tick completes.

The rail is one tint step off the canvas with a hard hairline edge and an accent indicator on
the active item. It is distinguished by tint and edge, never by ink, because a second dark band
would spend weight the wall clock has not earned.

Sections render as flat plates on the canvas, with one inter-plate spacing token visibly larger
than any intra-plate gap. A section is a group, not a box: independent content gets an
independent block, and a control lives in the head of the one block it changes.

In development against the fixture corpus, the test-rig banner is deliberately not product
chrome, so it stops adding mass to the frame in screenshots.

## Every fact renders once

Every fact renders exactly once, at its strongest position. Where a fact would have two
renders, the weaker one is deleted rather than relabelled: the token-weighted coverage figure
renders on the anchor line beside the mass it qualifies and nowhere else, and the trust section
carries instance-time coverage for that reason. A window control changes only what its block
contains; there are no global pickers.

## Typography and stamping

Major sections take the serif display tier. Mono small-caps is demoted to panel-internal labels,
so the article voice lasts the whole scroll.

**Section names are parameter-free.** A section is named for the question it answers, never for
a current parameter value: Repeat compute, not "14 days". The window lives on the block's head,
where parameters belong, as the span the reader picked and the grain the server served.

**A window control names a span, never a grain.** The stops are `14 d`, `48 h`, `3 h` and a
custom range. The grain is what the server served, read off the response's own `bucket_ms` and
stated on the head beside the range. Every panel opens at the same stop, and each panel owns its
window under its own parameter prefix.

## Instrument conventions

- Tabular lining numerals everywhere. Serif for headline figures and screen titles, mono as the
  provenance voice.
- Axes labelled in real units: tokens, token-hours, fraction of stored mass, minutes since
  eviction. Every axis label is a UTC instant, never a relative offset.
- Coverage renders as a quiet ribbon under each series, never a competing line.
- Markers are labelled vertical rules. A marker that changes the number's meaning breaks the
  series and refuses its before/after; a deploy marks the series and does not.
- Unexamined regions hatch out. They never render as zero.
- Every panel states the width it drew and the window it covers. Nothing implies scrape
  freshness.
- Lower bounds render with `≥`. The gap-unobserved mass sits beside the bands, never in the
  stack.
- Members are drawn as a distribution, not a ranked table, because "one offender or all of
  them" is a shape question a sorted table cannot answer.

| token | meaning |
|---|---|
| `--petrol` | the recompute register, and the site's "measured" colour |
| `--ochre` | the capacity register, an unrelated hue family, so the separation of the two registers holds by construction |
| `--crimson` | attention-worthy findings, and nothing else |

## Motion

Things move when data moved or the user acted. Ingest renders as bursts because ingestion is
bursty. Idle renders as honest idle, with only the freshness clock moving. Nothing loops.
`prefers-reduced-motion` resolves every sequence to its end state.

## How this talks to the analyzer

A typed client generated from `contract/openapi.json`, which the analyzer generates from its
Rust wire types and commits. Panels never hand-write a request shape. The panel list, the data
layer's method list and the endpoint list are the same list, and `test/contract-parity.test.ts`
asserts the data layer calls every path the contract publishes.

Every figure arrives as `{value, register, coverage, coverage_kind}`, all four always present.
A number without its coverage is unrepresentable in the Rust type, on the wire and in the
generated client, and nothing here may reconstruct one.

The stream is `GET /v1/events`: `tick_applied` says the figures moved and names the day the
tick classified, `ingest_batch` feeds the status strip, and `resync` says the server cannot
replay the gap, so the data layer refetches rather than assume continuity. All three are handled
inside the data layer and are invisible to components, which see only that a read re-ran.

## The mockups

`mockups/v3/` is the design the pages were built to. Open any file directly; there is no server
and no network fetch.

```
mockups/v3/index.html                 the dashboard
mockups/v3/holders.html               ranks
mockups/v3/health.html                health
mockups/assets/console-v3.css         the v3 tokens, over console-v2.css
mockups/assets/console-v2.css         tokens, chrome, instrument components
mockups/assets/console-v2.js          chrome, chips, info hovers, the trend primitive
mockups/assets/data-v2.js             the synthetic world, ported to src/data/fixture/world.ts
mockups/assets/fonts/                 vendored woff2, zero external fetches
```

Where a mockup and the contract disagree the contract wins and the disagreement is recorded in
`decisions.md`, because the mockups were drawn before some of the API existed.

## Identity

Palette and type are shared with the InferTap site: two colours carry meaning and never
decorate. Chrome is editorial, data surfaces are instrument-grade, and the whole thing is
light-first by decision. Faces are vendored from `@fontsource` packages, so the console loads
with zero external fetches.

## Viewport scope

**The desk is the target. Mobile is not.** This is a desk-cadence reading instrument, so the
layouts are designed for a laptop or larger and narrow widths are kept correct rather than
optimised. Correct means the page never scrolls sideways and nothing is clipped: wide content
scrolls inside its own box. It does not mean every element is well placed at 390 pixels.

When checking a layout at a narrow width, note that headless Chrome on macOS clamps its window
to roughly 485 pixels, so `--window-size=390` lays out at 485 and crops the capture, which reads
as a broken layout when nothing is broken. Load the page in a 390-pixel iframe instead and
compare `documentElement.scrollWidth` against `clientWidth`.
