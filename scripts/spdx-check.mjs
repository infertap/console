#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Every source file carries the licence as its first line (second, after a shebang):
 *
 *     // SPDX-License-Identifier: AGPL-3.0-only      .ts .tsx .js .mjs
 *     /* SPDX-License-Identifier: AGPL-3.0-only *\/   .css
 *
 * so a file copied out of the tree still says what it is licensed under. Judged by exit
 * code, run by CI and listed in CONTRIBUTING.md. Lists every offender, then fails once.
 *
 * `src/data/generated/` is generated from the analyzer's contract and is never edited by
 * hand, so it carries no header; the mockups are design artifacts, not source.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const LINE = { js: '// SPDX-License-Identifier: AGPL-3.0-only', css: '/* SPDX-License-Identifier: AGPL-3.0-only */' };
const KIND = { ts: 'js', tsx: 'js', js: 'js', mjs: 'js', css: 'css' };
const EXEMPT = [/^src\/data\/generated\//, /^mockups\//];

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

let missing = 0;
for (const file of tracked) {
  const kind = KIND[file.split('.').pop()];
  if (!kind || EXEMPT.some((re) => re.test(file))) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // tracked files may be deleted in the working tree
  }
  const lines = text.split('\n');
  const first = lines[0]?.startsWith('#!') ? lines[1] : lines[0];
  if (first !== LINE[kind]) {
    console.error(`spdx-check: ${file}: the first line must be \`${LINE[kind]}\``);
    missing = 1;
  }
}
if (!missing) console.log('spdx-check: every source file carries the header');
process.exit(missing);
