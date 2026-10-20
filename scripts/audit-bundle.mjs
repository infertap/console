#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The air-gap audit, over the built output.
 *
 * An air-gapped browser must render this perfectly. That is not a preference: the daemon serves
 * the bundle it shipped with, on hosts that frequently cannot reach the internet at all, and a
 * single font or script fetched from a CDN turns a working console into a hanging page with no
 * error anybody can read.
 *
 * So the claim is checked against the artifact rather than against intent. Reviewing the source
 * for CDN links catches what a human notices; this catches what a transitive dependency emitted.
 *
 * Run after `vite build`. CI runs it in the build job.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const DIST = resolve(process.argv[2] ?? 'dist');

/** Anything that would make the browser open a socket to somewhere that is not this origin. */
const FORBIDDEN = [
  { name: 'an absolute http(s) URL', re: /\bhttps?:\/\/(?!localhost|127\.0\.0\.1)[^\s"'`)<>\\]+/g },
  { name: 'a protocol-relative URL', re: /(?:src|href)\s*=\s*["']\/\//g },
  { name: 'a websocket URL', re: /\bwss?:\/\//g },
];

/**
 * Inert occurrences, each one justified.
 *
 * The pattern above is deliberately blunt, because a check that tries to decide which URLs are
 * "really" fetched is a check that will one day decide wrongly and say nothing. So it flags
 * every external URL and the exceptions live here, where adding one is a diff somebody reviews.
 * That is the same discipline the analyzer's network fence runs on: an exception is a diff,
 * never a drift.
 *
 * Nothing here is fetched. If an entry ever could be, it does not belong on this list.
 */
const ALLOWED = [
  {
    prefix: 'http://www.w3.org/',
    why: 'XML namespace identifiers. `createElementNS` requires the literal string; nothing resolves it.',
  },
  {
    prefix: 'https://react.dev',
    why: "React's error messages cite their own docs. The string is thrown, never followed.",
  },
];

const allowed = (hit) => ALLOWED.some((entry) => hit.startsWith(entry.prefix));

/**
 * Text that names a URL without fetching it.
 *
 * Source maps carry the original comments, and this repo's comments cite the analyzer's docs and
 * the spec by URL-shaped paths. A licence header naming a project's homepage is not a network
 * call either. The audit is about what the RUNTIME loads, so those are excluded by file type
 * rather than by pattern, which keeps the exclusion honest and small.
 */
const SCANNED = new Set(['.html', '.js', '.css']);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

let failures = 0;
let scanned = 0;

for (const file of walk(DIST)) {
  if (!SCANNED.has(extname(file))) continue;
  scanned += 1;
  const text = readFileSync(file, 'utf8');
  // Strip source-map comments: the map is a build artifact the browser fetches same-origin, and
  // its contents are checked as their own file if they are .js.
  const body = text.replace(/\/\/# sourceMappingURL=.*$/gm, '');
  for (const { name, re } of FORBIDDEN) {
    const hits = [...new Set([...body.matchAll(re)].map((m) => m[0]))].filter((h) => !allowed(h));
    if (hits.length > 0) {
      failures += 1;
      console.error(`${file}: ${name}`);
      for (const hit of hits.slice(0, 10)) console.error(`    ${hit}`);
    }
  }
}

if (scanned === 0) {
  console.error(`nothing to audit in ${DIST}: run vite build first`);
  process.exit(1);
}

if (failures > 0) {
  console.error(
    `\n${failures} external reference(s) in the built output. This bundle would not render on an air-gapped host.`,
  );
  process.exit(1);
}

/**
 * The rig audit: no synthetic corpus in a shipped bundle.
 *
 * **v1.0.0 shipped one.** `readSource` defaulted to `fixture`, `npm run build` sets no
 * `VITE_SOURCE`, and the release ran plain `npm run build` -- so the analyzer embedded a console
 * that drew invented figures on a customer's machine and never called the API. Everything
 * upstream was green: the content hash matched, `version` reported, the assets served. Only the
 * meaning was wrong.
 *
 * `src/dev` is now dropped by tree-shaking, but that is a claim about a bundler and bundlers
 * change. This checks the artifact, which is the thing that ships. The strings are the rig's own
 * words, lower-case in source and upper-cased by CSS -- searched case-insensitively for exactly
 * that reason, since a case-sensitive grep is what hid this from me the first time I looked.
 */
const RIG_MARKERS = [
  'static rig',
  'no daemon attached',
  'synthetic data',
];

let rigHits = 0;
for (const file of walk(DIST)) {
  if (!SCANNED.has(extname(file))) continue;
  const body = readFileSync(file, 'utf8').toLowerCase();
  for (const marker of RIG_MARKERS) {
    if (body.includes(marker)) {
      rigHits += 1;
      console.error(`${file}: contains the development rig (${JSON.stringify(marker)})`);
    }
  }
}

if (rigHits > 0) {
  console.error(
    `\nThe built bundle carries the synthetic-data rig. A customer must never be able to reach it:` +
      ` build with NODE_ENV=production / \`vite build\` so \`import.meta.env.DEV\` is false, and keep` +
      ` every reference to src/dev behind that literal.`,
  );
  process.exit(1);
}

/**
 * The corpus audit: no synthetic DATA in a shipped bundle, as opposed to no synthetic BANNER.
 *
 * **The check above passed while v1.0.2 shipped the whole corpus.** It looks for the rig's three
 * UI strings, and those were absent — the banner was gone. The generator was not: `POPULATIONS`,
 * the hardcoded ETR figures and every invented holder sat in the production bundle, because
 * `package.json` declared no `sideEffects` and `world.ts` computes at module top level, so Rollup
 * could not prove the module droppable even though its only importer sits behind
 * `import.meta.env.DEV`. `console/PIN.toml` said "no fixture corpus" and was wrong.
 *
 * A check that tests something adjacent to its claim is worse than no check, because the claim
 * then reads as verified. So this asserts the thing itself.
 *
 * **The markers are DERIVED, never listed.** A hand-written list is how the check above went
 * stale: it froze the rig's vocabulary of the day. This reads the fixture's own sources, takes the
 * string literals that appear THERE and nowhere else in `src/`, and requires none of them in the
 * artifact. Rename a model, add a workload, change the populations, and the audit follows without
 * anyone remembering to update it. Literals shared with real application code are excluded by
 * construction — they are not evidence of the corpus.
 */
const CORPUS_DIRS = ['src/data/fixture', 'src/dev'];
const SRC = resolve('src');

const literalsIn = (files) => {
  const out = new Set();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    // Single, double and backtick literals. Length 14+ so short shared words (`fine`, `store`,
    // route fragments) never become markers; those are domain vocabulary, not corpus evidence.
    for (const m of text.matchAll(/['"`]([^'"`\n]{14,})['"`]/g)) out.add(m[1]);
  }
  return out;
};

const allSrc = [...walk(SRC)].filter((f) => ['.ts', '.tsx'].includes(extname(f)));
const isCorpus = (f) => CORPUS_DIRS.some((d) => f.includes(resolve(d)));
const corpusFiles = allSrc.filter((f) => isCorpus(f) && !f.endsWith('.test.ts'));
const appFiles = allSrc.filter((f) => !isCorpus(f));

// **Excluded against the app's raw TEXT, not against its quoted literals.** Comparing literals to
// literals looked right and produced a false positive on the first run: `order_statistic` is a
// quoted string in the fixture and a bare object key in `domain/refusal.ts`, so a literal-to-
// literal comparison called shared vocabulary corpus-only and failed a clean bundle. An audit that
// cries wolf is an audit somebody switches off, so the exclusion is deliberately over-broad —
// a marker must appear NOWHERE in application source to count as evidence.
//
// **Whitespace is normalised on both sides**, which the second false positive taught. The fixture
// carries the product's own sentence "A fleet change, not a measurement change…" — the same words
// `MarkerRoute.tsx` puts on glass, because the words-on-glass law makes the fixture speak the
// product's vocabulary. In the fixture it is one quoted line; in the route it is JSX text wrapped
// across three. A raw `includes` sees two different strings and calls shared copy corpus-only.
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const appText = flat(appFiles.map((f) => readFileSync(f, 'utf8')).join('\n'));
const markers = [...literalsIn(corpusFiles)].filter((s) => !appText.includes(flat(s)));

if (markers.length === 0) {
  console.error(
    'corpus audit: derived NO markers from ' +
      `${corpusFiles.length} fixture sources, so this check would pass on anything. That means the` +
      ' corpus moved, was renamed, or shares every literal with app code — fix the check, do not' +
      ' delete it.',
  );
  process.exit(1);
}

let corpusHits = 0;
for (const file of walk(DIST)) {
  if (!SCANNED.has(extname(file))) continue;
  const body = readFileSync(file, 'utf8');
  for (const marker of markers) {
    if (body.includes(marker)) {
      corpusHits += 1;
      console.error(`${file}: carries fixture-only data (${JSON.stringify(marker.slice(0, 60))})`);
    }
  }
}

if (corpusHits > 0) {
  console.error(
    `\nThe built bundle carries the synthetic corpus. It is not rendered while \`readSource\`` +
      ` returns \`live\`, but it ships to customers, and every claim that it does not is false while` +
      ` this fails. Check that \`package.json\` still declares \`sideEffects\` so unused modules can` +
      ` be dropped, and that nothing outside \`import.meta.env.DEV\` reaches src/data/fixture.`,
  );
  process.exit(1);
}

console.log(`corpus audit: ${markers.length} fixture-only markers, none in the bundle`);

console.log(`air-gap audit: ${scanned} files, no external references, no rig`);
