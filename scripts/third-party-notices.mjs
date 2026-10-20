#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Generate THIRD-PARTY-NOTICES for what this bundle actually ships.
 *
 * **Not the same question `check-licences.mjs` asks, and the difference decides what goes in.**
 * That script checks the licence FLOOR across the whole install tree, because a copyleft package
 * arriving transitively is a risk wherever it sits. This one lists what we REDISTRIBUTE, and the
 * obligation to attribute attaches only to that. So it walks the runtime closure — `dependencies`
 * and their own dependencies — and not the two hundred devDependencies that build the bundle and
 * do not enter it.
 *
 * That prunes hard: three packages ship, everything else is toolchain.
 *
 * **The fonts are here because nothing else would ever find them.** Seven `.woff2` files are
 * vendored into `src/design-system/fonts/` and `@font-face`d in `tokens.css`, so Vite bundles them
 * into `dist/assets/` and the analyzer compiles them into its binary. They are not packages.
 * `check-licences.mjs` walks `node_modules` and cannot see them; a cargo-side generator cannot see
 * them; `npm ls` cannot see them. **A vendored asset is invisible to every dependency tool we
 * have**, which is exactly how seven SIL Open Font License files came to ship inside a commercial
 * binary with no attribution attached.
 *
 * That is the general lesson and it is worth more than the fix: the licence controls in this repo
 * cover PACKAGES. Anything copied into `src/` — a font, an icon set, a snippet — arrives outside
 * them and has to be registered by hand, here.
 *
 * Usage:  node scripts/third-party-notices.mjs [--check] > THIRD-PARTY-NOTICES
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LICENCE_FILES = /^(LICEN[CS]E|COPYING|NOTICE)/i;

/**
 * Assets copied into the source tree rather than installed. Each entry is a decision on the
 * record, and each is here because no tool can derive it.
 *
 * The copyright lines are transcribed from the upstream licence files, not reconstructed:
 * IBM/plex `LICENSE.txt` and undercasetype/Fraunces `OFL.txt`.
 */
const VENDORED = [
  {
    name: 'IBM Plex Sans, IBM Plex Mono',
    files: 'src/design-system/fonts/ibm-plex-*.woff2',
    copyright: 'Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"',
    licence: 'SIL Open Font License, Version 1.1',
    source: 'https://github.com/IBM/plex',
  },
  {
    name: 'Fraunces',
    files: 'src/design-system/fonts/fraunces-latin-full-normal.woff2',
    copyright:
      'Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)',
    licence: 'SIL Open Font License, Version 1.1',
    source: 'https://github.com/undercasetype/Fraunces',
  },
];

/** The OFL's own redistribution clause, which is why the block above has to exist at all. */
const OFL_NOTE = `\
    The SIL Open Font License permits bundling these fonts with software, including
    commercial software, and requires that this copyright notice and the licence
    accompany them. The full licence text is at https://openfontlicense.org and in the
    upstream repository named above.`;

/** Runtime closure: `dependencies`, transitively. devDependencies build the bundle, not ship in it. */
function shipped() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const seen = new Map();
  const queue = Object.keys(manifest.dependencies ?? {});
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    const dir = join(ROOT, 'node_modules', name);
    if (!existsSync(join(dir, 'package.json'))) continue;
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    seen.set(name, { pkg, dir });
    for (const dep of Object.keys(pkg.dependencies ?? {})) queue.push(dep);
  }
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function licenceText(dir) {
  if (!existsSync(dir)) return '';
  return readdirSync(dir)
    .filter((f) => LICENCE_FILES.test(f))
    .sort()
    .map((f) => `    --- ${f} ---\n${readFileSync(join(dir, f), 'utf8')}`)
    .join('\n');
}

function render() {
  const out = [
    'THIRD-PARTY NOTICES — InferTap console',
    '',
    'The InferTap console is licensed under the AGPL-3.0-only (see LICENSE). It redistributes the components below, which remain',
    'under their own licences.',
    '',
    'This covers what the built bundle SHIPS: the runtime dependency closure, and the fonts',
    'vendored into the source tree. Build tooling is excluded because it does not enter the',
    'bundle. The console is compiled into the analyzer binary, so these notices travel with the',
    "analyzer's own.",
    '',
    '='.repeat(78),
    '',
    'Fonts bundled into the stylesheet:',
    '',
  ];

  for (const font of VENDORED) {
    out.push(`${font.name}`);
    out.push(`    Files:      ${font.files}`);
    out.push(`    Licence:    ${font.licence}`);
    out.push(`    Source:     ${font.source}`);
    out.push(`    ${font.copyright}`);
    out.push('');
    out.push(OFL_NOTE);
    out.push('');
  }

  const packages = shipped();
  out.push('='.repeat(78), '', `JavaScript packages (${packages.length}):`, '');
  for (const [name, { pkg, dir }] of packages) {
    out.push(`${name} ${pkg.version}`);
    out.push(`    Licence:    ${pkg.license ?? 'see source'}`);
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    if (repo) out.push(`    Repository: ${repo.replace(/^git\+/, '').replace(/\.git$/, '')}`);
    const text = licenceText(dir);
    out.push(text || '    (no licence file in the published package; the identifier above is its\n     package.json declaration)');
    out.push('');
  }
  return out.join('\n') + '\n';
}

const rendered = render();
const committed = join(ROOT, 'THIRD-PARTY-NOTICES');

if (process.argv.includes('--check')) {
  if (!existsSync(committed)) {
    console.error('THIRD-PARTY-NOTICES is not committed; run this script and commit its output');
    process.exit(1);
  }
  if (readFileSync(committed, 'utf8') !== rendered) {
    console.error(
      'THIRD-PARTY-NOTICES is stale. What ships moved and the notices did not.\n' +
        'Regenerate: node scripts/third-party-notices.mjs > THIRD-PARTY-NOTICES',
    );
    process.exit(1);
  }
  console.log('third-party notices: current');
} else {
  process.stdout.write(rendered);
}
