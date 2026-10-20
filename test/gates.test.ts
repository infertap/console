// SPDX-License-Identifier: AGPL-3.0-only
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * **Every gate, verified failing.**
 *
 * A gate that has only ever passed is one nobody knows works. The analyzer's culture is that a
 * ratchet is broken on purpose once, watched to fail, and restored; this file makes that
 * permanent instead of ceremonial. Each case is a violation the architecture is supposed to
 * reject, linted through the real config, asserting the real rule fires.
 *
 * If a rule is renamed, weakened, or silently stops resolving imports, a test here goes red.
 * That is the failure mode these checks exist to catch, and it is the one that would otherwise
 * be invisible: a boundary lint that cannot resolve a module reports nothing and looks green.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const eslint = new ESLint({ cwd: root });

async function ruleIdsFor(filePath: string, code: string): Promise<string[]> {
  const results = await eslint.lintText(code, { filePath: resolve(root, filePath) });
  return results.flatMap((r) => r.messages.map((m) => m.ruleId ?? 'fatal'));
}

interface Gate {
  readonly what: string;
  readonly file: string;
  readonly code: string;
  readonly rule: string;
}

const GATES: readonly Gate[] = [
  {
    what: 'a feature importing a sibling feature',
    file: 'src/features/dashboard/Violation.tsx',
    code: `import Health from '../health/HealthRoute';\nexport const x = Health;\n`,
    rule: 'layers/dependencies',
  },
  {
    what: 'the design system reaching into the data layer',
    file: 'src/design-system/Violation.ts',
    code: `import { createDataSource } from '../data';\nexport const x = createDataSource;\n`,
    rule: 'layers/dependencies',
  },
  {
    what: 'a component importing the generated client',
    file: 'src/features/dashboard/Violation.ts',
    code: `import type { components } from '../../data/generated/api';\nexport type X = components;\n`,
    rule: 'no-restricted-imports',
  },
  {
    what: 'a feature calling fetch',
    file: 'src/features/dashboard/Violation.ts',
    code: `export const load = () => fetch('/v1/figures');\n`,
    rule: 'no-restricted-globals',
  },
  {
    what: 'a feature opening the event stream itself',
    file: 'src/features/dashboard/Violation.ts',
    code: `export const s = new EventSource('/v1/events');\n`,
    rule: 'no-restricted-globals',
  },
  {
    what: 'an em dash in a customer-facing string',
    file: 'src/features/dashboard/Violation.ts',
    code: `export const label = 'coverage is a floor — never an estimate';\n`,
    rule: 'law/no-em-dash',
  },
  {
    what: 'an em dash in JSX text',
    file: 'src/features/dashboard/Violation.tsx',
    code: `export const P = () => <p>a lower bound — not a guess</p>;\n`,
    rule: 'law/no-em-dash',
  },
  {
    what: 'a number formatted outside the design system',
    file: 'src/features/dashboard/Violation.ts',
    code: `export const pct = (n: number) => n.toFixed(2);\n`,
    rule: 'no-restricted-syntax',
  },
  {
    what: 'a file in src/ belonging to no layer',
    file: 'src/utils/Violation.ts',
    code: `export const helper = () => 1;\n`,
    rule: 'layers/no-unknown-files',
  },
];

describe('the architecture gates fire', () => {
  for (const gate of GATES) {
    it(`rejects ${gate.what}`, async () => {
      const ids = await ruleIdsFor(gate.file, gate.code);
      expect(ids).toContain(gate.rule);
    });
  }
});

describe('the architecture gates do not fire on legal code', () => {
  it('allows a feature to import the shared layers', async () => {
    const ids = await ruleIdsFor(
      'src/features/dashboard/Legal.ts',
      `import { config } from '../../config';\n` +
        `import type { Figure } from '../../domain/contract';\n` +
        `import { createDataSource } from '../../data';\n` +
        `export const x = [config, createDataSource] as const;\n` +
        `export type Y = Figure;\n`,
    );
    expect(ids).not.toContain('layers/dependencies');
    expect(ids).not.toContain('layers/no-unknown-dependencies');
  });

  it('allows a feature to import its own files', async () => {
    const ids = await ruleIdsFor(
      'src/features/holders/Legal.ts',
      `import HolderRoute from './HolderRoute';\nexport const x = HolderRoute;\n`,
    );
    expect(ids).not.toContain('layers/dependencies');
  });

  it('allows the data layer to read the generated client', async () => {
    const ids = await ruleIdsFor(
      'src/data/Legal.ts',
      `import type { paths } from './generated/api';\nexport type X = paths;\n`,
    );
    expect(ids).not.toContain('layers/dependencies');
    expect(ids).not.toContain('no-restricted-imports');
  });
});
