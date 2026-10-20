// SPDX-License-Identifier: AGPL-3.0-only
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import law from './eslint-rules/law.js';
import layers from './eslint-rules/layers.js';

/**
 * The ratchet.
 *
 * Two things are checked here that a reviewer would otherwise have to remember, and the whole
 * argument of `docs/read-api.md` §2.2.1 is that attention is what fails:
 *
 *  1. **Layer boundaries.** Features import from shared layers and never from each other; only
 *     the data layer touches the generated client or the network. A violation is a failed build,
 *     not a comment in review.
 *  2. **The laws on glass.** No em dashes in customer-facing copy; no number formatted outside
 *     the design system, because a number formatted in a feature is a number that got away from
 *     its coverage.
 *
 * Every gate here is verified failing in `docs/gates.md` — a gate that has only ever passed is
 * one nobody knows works.
 */

const LAYERS = [
  // First, so the generated client is its own layer rather than part of `data`: layers match in
  // order, and the whole point is that `data` may read it and nothing else may.
  { type: 'generated', pattern: 'src/data/generated' },
  { type: 'data', pattern: 'src/data' },
  { type: 'config', pattern: 'src/config' },
  { type: 'domain', pattern: 'src/domain' },
  { type: 'design-system', pattern: 'src/design-system' },
  // The capture is what makes feature isolation expressible: a feature may see its own folder
  // and no sibling's.
  { type: 'feature', pattern: 'src/features/*', capture: ['featureName'] },
  { type: 'app', pattern: 'src/app' },
  // The development rig. Its whole purpose is to be UNREACHABLE from a production build: `app`
  // may reach it, and only from behind `import.meta.env.DEV`, so the bundler drops it. Nothing
  // else may reach it at all -- a feature importing the corpus is how synthetic figures get onto
  // a customer's page, which is not hypothetical: v1.0.0 shipped exactly that.
  { type: 'dev', pattern: 'src/dev' },
];

/** Every shared layer a feature is allowed to reach for. */
const SHARED = ['design-system', 'domain', 'data', 'config'];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'mockups/**', 'src/data/generated/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { layers, law },
    settings: {
      'layers/elements': LAYERS,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // A file in src/ that belongs to no layer is how a `utils/` folder is born and how the
      // model quietly stops describing the code.
      'layers/no-unknown-files': 'error',
      'layers/no-unknown-dependencies': 'error',

      'layers/dependencies': [
        'error',
        {
          allow: {
            // The composition root. It is allowed to know everything precisely because it is
            // the one place that chooses an implementation.
            app: ['app', 'feature', 'dev', ...SHARED],
            // The rig may read the shared layers to render itself. Nothing may read the rig
            // except `app`, above.
            dev: SHARED,
            // Feature isolation. A feature sees its own folder, the shared layers, and nothing
            // that belongs to a sibling.
            feature: ['own-feature', ...SHARED],
            // The design system renders domain shapes. It never fetches, so it never sees data.
            'design-system': ['design-system', 'domain', 'config'],
            // Domain owns the types, which come from the contract.
            domain: ['domain', 'generated', 'config'],
            // The one seam. Everything that talks to a server is downstream of here.
            data: ['data', 'generated', 'domain', 'config'],
            // Leaves.
            config: ['config'],
          },
        },
      ],
    },
  },

  // ── The generated client is data-layer property ────────────────────────────────────────────
  // `domain/` is the one exception and it is a narrow one: it re-exports the contract types
  // under domain names so that every other layer has somewhere to import them FROM.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/data/**', 'src/domain/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/data/generated/*', '**/generated/api*'],
              message:
                'The generated client belongs to the data layer. Import the view model from domain/ instead.',
            },
          ],
        },
      ],
    },
  },

  // ── Only the live data source touches the network ──────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/data/live/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Network access lives in src/data/live. Use the DataSource.' },
        { name: 'XMLHttpRequest', message: 'Network access lives in src/data/live.' },
        { name: 'EventSource', message: 'The event stream lives in src/data/live.' },
        { name: 'WebSocket', message: 'This product opens no socket.' },
      ],
    },
  },

  // ── The laws on glass ──────────────────────────────────────────────────────────────────────
  {
    files: ['src/design-system/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'law/no-em-dash': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression > MemberExpression[property.name=/^(toFixed|toLocaleString)$/]",
          message:
            'Format through the design system. A number formatted here is a number that left its coverage behind.',
        },
      ],
    },
  },
  // The number formatters themselves are the exception, and it is a named one.
  {
    files: ['src/design-system/format/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // ── Tests ──────────────────────────────────────────────────────────────────────────────────
  {
    files: ['test/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'layers/no-unknown-files': 'off',
      'layers/no-unknown-dependencies': 'off',
      'layers/dependencies': 'off',
      'no-restricted-globals': 'off',
      'law/no-em-dash': 'off',
    },
  },

  // ── Build files ────────────────────────────────────────────────────────────────────────────
  {
    files: ['*.config.{ts,js}', 'eslint-rules/**/*.js'],
    rules: { 'layers/no-unknown-files': 'off' },
  },

  // ── Repo scripts ───────────────────────────────────────────────────────────────────────────
  // These run under Node, not in a browser. Declared explicitly rather than by pulling in the
  // `globals` package for four names.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
    rules: { 'layers/no-unknown-files': 'off' },
  },
);
