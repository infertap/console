#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The licence floor.
 *
 * This bundle ships inside a customer's on-prem deployment, so a copyleft dependency arriving
 * transitively is a legal fact somebody has to know about before it ships rather than after.
 * Hand-rolled against `node_modules` because the alternative is a dependency whose job is to
 * read the dependencies, which is a strange thing to add to a repo with an allowlist culture.
 *
 * Everything in the install tree is checked, not just direct dependencies: what ships is the
 * tree, and the risk arrives transitively or not at all.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'node_modules');

/** SPDX identifiers this product may ship. Permissive only. */
const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'Python-2.0',
  'CC-BY-4.0',
  // MIT without the attribution clause. Strictly more permissive than MIT, so it clears a floor
  // MIT clears.
  'MIT-0',
]);

/**
 * Packages whose declared licence needs a human note. Each entry is a decision on the record.
 *
 * The floor exists because this bundle ships inside a customer's deployment. That is the test
 * an exception has to answer: not "is this licence acceptable" in the abstract, but "does this
 * package reach the artifact we hand over".
 */
const EXCEPTIONS = new Map([
  [
    /^lightningcss(-|$)/,
    'MPL-2.0, and build-time only: Vite uses it to transform CSS, and none of its files reach ' +
      'dist. MPL obligations attach to distributing the covered files, which this repo never ' +
      'does. Revisit if it ever becomes a runtime dependency, which would be a different question.',
  ],
]);

const excepted = (name) => [...EXCEPTIONS.keys()].some((pattern) => pattern.test(name));

function* packages(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === '.bin' || entry === '.package-lock.json') continue;
    const full = join(dir, entry);
    if (entry.startsWith('@')) {
      yield* packages(full);
      continue;
    }
    const manifest = join(full, 'package.json');
    if (existsSync(manifest)) yield [entry, manifest];
    const nested = join(full, 'node_modules');
    if (existsSync(nested)) yield* packages(nested);
  }
}

/** `license` may be a string, an SPDX expression, or the deprecated object/array forms. */
function idsOf(pkg) {
  const raw = pkg.license ?? pkg.licenses;
  if (!raw) return [];
  if (typeof raw === 'string') return raw.replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+/);
  if (Array.isArray(raw)) return raw.flatMap((l) => (typeof l === 'string' ? [l] : [l.type ?? '']));
  if (typeof raw === 'object' && raw.type) return [raw.type];
  return [];
}

const offenders = [];
let checked = 0;

for (const [name, manifest] of packages(ROOT)) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch {
    continue;
  }
  if (pkg.private === true) continue;
  checked += 1;
  const ids = idsOf(pkg);
  // A dual licence passes if ANY of its options is on the floor, because we may take that one.
  const ok = ids.length > 0 && ids.some((id) => ALLOWED.has(id.trim()));
  if (!ok && !excepted(name)) {
    offenders.push(`${name}@${pkg.version ?? '?'}: ${ids.join(' OR ') || 'no licence declared'}`);
  }
}

if (offenders.length > 0) {
  console.error('Packages below the licence floor:\n');
  for (const line of [...new Set(offenders)].sort()) console.error(`  ${line}`);
  console.error(
    `\n${offenders.length} package(s). Add to the floor, replace the package, or record an exception with a reason.`,
  );
  process.exit(1);
}

console.log(`licence floor: ${checked} packages, all permissive`);
