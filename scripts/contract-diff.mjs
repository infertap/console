#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Compare the vendored contract against another copy of it.
 *
 * The canary points this at a fresh checkout of the analyzer's `main`. A developer points it at
 * `../analyzer/contract/openapi.json` before bumping the pin. Either way the output is the same:
 * what moved, in terms a reader can act on, rather than a 900-line JSON diff.
 *
 *     node scripts/contract-diff.mjs ../analyzer/contract/openapi.json
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ours = JSON.parse(readFileSync(resolve('contract/openapi.json'), 'utf8'));
const theirsPath = process.argv[2];
if (!theirsPath) {
  console.error('usage: contract-diff.mjs <path to the analyzer openapi.json>');
  process.exit(2);
}
const theirs = JSON.parse(readFileSync(resolve(theirsPath), 'utf8'));

const sets = (doc) => ({
  paths: new Set(Object.keys(doc.paths ?? {})),
  schemas: new Set(Object.keys(doc.components?.schemas ?? {})),
  causes: new Set(doc.components?.schemas?.Cause?.enum ?? []),
});

const a = sets(ours);
const b = sets(theirs);
const diff = (x, y) => [...y].filter((k) => !x.has(k)).sort();

const report = {
  'paths added': diff(a.paths, b.paths),
  'paths removed': diff(b.paths, a.paths),
  'schemas added': diff(a.schemas, b.schemas),
  'schemas removed': diff(b.schemas, a.schemas),
  'causes added': diff(a.causes, b.causes),
  'causes removed': diff(b.causes, a.causes),
};

const changed = [];
for (const name of a.schemas) {
  if (!b.schemas.has(name)) continue;
  const before = JSON.stringify(ours.components.schemas[name], Object.keys(ours.components.schemas[name]).sort());
  const after = JSON.stringify(theirs.components.schemas[name], Object.keys(theirs.components.schemas[name]).sort());
  if (before !== after) changed.push(name);
}
report['schemas changed'] = changed.sort();

const moved = Object.entries(report).filter(([, v]) => v.length > 0);

if (moved.length === 0) {
  console.log(`the contract has not moved since the pin in contract/PIN.md`);
  process.exit(0);
}

console.log('The contract has moved.\n');
for (const [label, values] of moved) {
  console.log(`  ${label}:`);
  for (const value of values) console.log(`    ${value}`);
}
console.log(
  '\nTo adopt: copy the spec into contract/, run `npm run gen:client`, update contract/PIN.md,' +
    '\nand read every type error `npm run typecheck` reports. A pin bump whose errors were not' +
    '\nread is a pin bump nobody verified.',
);
process.exit(1);
