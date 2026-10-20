# Gates

Every check this repo runs, what it actually guards, and how it is known to work.

**A gate that has only ever passed is one nobody knows works.** The analyzer's culture is that a
ratchet gets broken on purpose once, watched to fail, and restored. Here that ritual is
automated: `test/gates.test.ts` lints deliberate violations through the real config and asserts
the real rule fires, so the verification re-runs on every CI run instead of living in somebody's
memory of a Tuesday.

## Architecture and law, in `test/gates.test.ts`

| the violation | the rule that catches it |
|---|---|
| a feature importing a sibling feature | `layers/dependencies` |
| the design system reaching into the data layer | `layers/dependencies` |
| a component importing the generated client | `no-restricted-imports` |
| a feature calling `fetch` | `no-restricted-globals` |
| a feature opening the event stream itself | `no-restricted-globals` |
| an em dash in a customer-facing string | `law/no-em-dash` |
| an em dash in JSX text | `law/no-em-dash` |
| a number formatted outside the design system | `no-restricted-syntax` |
| a file in `src/` belonging to no layer | `layers/no-unknown-files` |

Three negative controls sit beside them, and they carry more weight than they look like they do:
a feature importing the shared layers, a feature importing its own files, and the data layer
reading the generated client must all pass **and must not trip `no-unknown-dependencies`**.

**Why that last clause matters, learned the hard way.** The layer rules resolve each relative
import to a path and the path to a layer. When that resolution breaks, a module classifies as no
layer and a *different* rule fires: the positive gates still look green while checking nothing
at all. That happened once, under the plugin these local rules replaced, when its resolver
setting was deleted. A boundary lint that silently stops resolving is invisible to a passing
build, and the negative controls are the only thing that sees it.

Feature isolation is the `own-feature` entry: a feature reaches its own folder and no sibling's.
Allowing any `feature` there instead fails exactly one test, the one that should fail.

The rules are local (`eslint-rules/layers.js`) because the plugin they replace matched paths
through `micromatch`, which carries `braces`, a high advisory with no patched release. A prefix
answers everything the policy asks.

## Contract, in `test/contract-parity.test.ts`

| what it guards | how it fails |
|---|---|
| the closed cause set matches the contract, both directions | a cause added or removed upstream |
| the data layer calls every published path, and invents none | an endpoint lands and nothing reads it |
| every schema describes what it requires | **exact**: a new violation fails, and so does a fix |
| the envelope is `{stamp, data}` and nothing else on every JSON 200 | a third top-level key |

The third row is a ratchet with its exceptions written down. `Stamp` is the only entry, because
its `required` names `pass` and `raw_horizon` while its `properties` describe neither. When the
analyzer fixes that, **this test goes red**, which is the signal to delete the workaround in
`domain/contract.ts` rather than let it outlive its reason.

## The corpus, in `test/fixture-parity.test.ts` and `world.test.ts`

The spec's own schemas validate every fixture response, resolved by JSON Pointer into the
document so the `$ref`s resolve against the contract as published rather than against a lifted
fragment. It caught a malformed stamp on its first run, which became contract finding 10.

The paging path is walked to exhaustion at `limit = 1`, and a cursor minted under one pass is
asserted to be refused against another. At the v1 envelope one page holds the table, so this is
the path nobody would otherwise exercise, and a cursor mechanism never followed to exhaustion is
one that breaks the day the envelope lifts.

`world.test.ts` promotes the mock's arithmetic from a computed footer to assertions: the two
windows sum to the full figure, the classes sum to their total, all 468 holders sum to the fleet
figure, every seam's date derives from its day index, and no age ever produces a zero value.

## The artifact, in `scripts/audit-bundle.mjs`

Runs at the end of `npm run build`. An air-gapped browser must render this perfectly, so the
claim is checked against the built output rather than against intent: reviewing source for CDN
links catches what a human notices, and this catches what a transitive dependency emitted.

The pattern is deliberately blunt and the exceptions are listed with reasons, because a check
that tries to decide which URLs are "really" fetched will one day decide wrongly and say nothing.

**Verified failing:** injecting `<script src="https://cdn.example.com/a.js">` into `dist` fails
the audit and names the file.

## Supply chain, in `scripts/check-licences.mjs`

Every package in the install tree, not just the direct dependencies, because what ships is the
tree. **Verified failing:** removing `MIT` from the floor flags 228 packages.

One exception, on the record: `lightningcss` is MPL-2.0 and build-time only. MPL obligations
attach to distributing the covered files, which this repo never does.

## The canary can be switched off without anybody deciding to

`.github/workflows/canary.yml` runs on GitHub's scheduler at `17 */4 * * *`, which is minute 17
of every fourth hour, UTC. Three properties of that mechanism are worth knowing, because each is
a way the check stops happening without failing:

1. **Only the default branch's copy of the file is ever scheduled.** A change to the canary on a
   branch does nothing until it lands on `main`, and `workflow_dispatch` cannot reach it either.
2. **Scheduled runs are best-effort.** GitHub delays them under load and drops them during
   incidents. The `:17` offset avoids the on-the-hour queue, but "every four hours" is a target
   rather than a guarantee. Acceptable here: the horizon that matters is "before somebody builds
   on a broken contract", not "instantly".
3. **GitHub disables scheduled workflows in a repository with 60 days of no activity.** No
   commits, no runs, no pull requests, and the cron is switched off. Not paused with a warning:
   off.

**The third one is the real hazard, and it is exactly the failure mode this document exists to
name.** A canary that looks scheduled, reads as coverage, and is not running is worse than no
canary at all, and a private repository worked on in bursts is precisely the case that triggers
it. Nothing in this repo can detect that state from the inside, because the mechanism that would
report it is the mechanism that stopped.

**What to do about it, in order of how much it costs.** The cheapest is to know: this paragraph
exists so that somebody returning after a quiet stretch checks the Actions tab before trusting
green. The next cheapest is to look at the canary's last successful run whenever the pin moves,
since a pin bump is exactly when its silence would matter. The real fix, if this repo ever goes
quiet for long stretches, is to trigger the canary from somewhere that does not sleep — the
analyzer's CI on a contract change, or any scheduler outside GitHub — which trades the clean
toolchain-locality argument in `docs/decisions.md` §1 for a check that cannot be switched off by
inactivity. That is a real trade and it should be made deliberately rather than discovered.

## Owed

**Pixel snapshots of the honest-states catalogue.** `src/features/gallery/Gallery.test.tsx`
asserts structure: every state renders, every cause renders, a figure carries its coverage and
basis, an unmeasured position contains no digits. It would catch a cause dropped from the
catalogue or a figure rendered without provenance.

It would **not** catch the unexamined hatch becoming a solid fill, because that is CSS and jsdom
does not apply it. That regression is exactly the one the brief names as a defect, so the check
that matters here is a real browser rendering the gallery and diffing the image.

The reason it is not in yet is a genuine tension rather than an oversight: a browser-based runner
downloads a browser binary at install time, which is at odds with `ignore-scripts=true` and with
a CI that must work from `npm ci` offline. The options are to vendor a pinned browser into the CI
image, or to accept a network step in one job that the rest of the pipeline does not have. That
is a call worth making deliberately, so it is recorded here rather than resolved quietly in a
config file.
