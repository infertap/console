// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The contract pin says which analyzer commit `contract/openapi.json` was copied from, and states
 * its SHA-256. **Until this file existed, nothing compared that number to the bytes.**
 *
 * It went stale exactly as an unchecked number does: the spec was re-synced, the prose was not,
 * and `PIN.md` spent seven days naming a commit and a digest that had stopped describing the file
 * next to it. Nobody noticed, because reading a hash in a paragraph and verifying one are
 * different acts and only the second is repeatable.
 *
 * This is the same lesson the release pipeline learned from a notices file that CLAIMED seven
 * fonts had been attributed. A record is not a check until something compares it.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const pin = readFileSync(resolve(here, '../contract/PIN.md'), 'utf8');
const spec = readFileSync(resolve(here, '../contract/openapi.json'));

describe('the contract pin', () => {
  it('states the sha256 of the spec sitting beside it', () => {
    const claimed = /SHA-256 `([0-9a-f]{64})`/.exec(pin)?.[1];
    // A pin whose hash line has been reworded is a pin this test silently stops guarding, so the
    // absence of the line is a failure rather than a skip.
    expect(claimed, 'contract/PIN.md states no SHA-256').toBeDefined();

    const actual = createHash('sha256').update(spec).digest('hex');
    expect(
      actual,
      'contract/openapi.json does not match the digest in contract/PIN.md.\n' +
        'Re-syncing the spec means updating the commit, the date and the SHA-256 in that file —\n' +
        'the pin moving is the reviewable diff, and a pin that disagrees with its own bytes is\n' +
        'worse than none, because it reads as provenance somebody verified.',
    ).toBe(claimed);
  });

  it('names the analyzer commit the spec came from', () => {
    // Provenance, not verification — the hash above is what is enforced. But a full 40-character
    // sha is what makes `git show <sha>:contract/openapi.json` one command over in the analyzer,
    // which is the whole point of writing it down.
    const sha = /Pinned: \*\*analyzer `([0-9a-f]{40})`\*\*/.exec(pin)?.[1];
    expect(sha, 'contract/PIN.md names no analyzer commit').toBeDefined();
  });
});
