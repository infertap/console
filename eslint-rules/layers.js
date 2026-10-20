// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The layer boundaries, as local rules.
 *
 * Every file under `src/` belongs to one layer of `settings['layers/elements']`, matched in
 * order by path prefix (`*` is one folder, captured as the feature's name). Every relative import
 * resolves to a path, and so to a layer; the allow-list of `layers/dependencies` says which
 * layers each may reach: `feature` any feature, `own-feature` the importing feature's own folder. Package
 * imports name no layer and are outside these rules.
 *
 * These replace `eslint-plugin-boundaries`, which matched paths through `micromatch` and so
 * carried `braces`, a high advisory with no patched release. The rules ask nothing a prefix
 * cannot answer.
 */

import path from 'node:path';

/**
 * @typedef {{ type: string, pattern: string }} Element
 * @typedef {{ type: string, feature?: string }} Layer
 */

/** The repository-relative, forward-slashed path of `file`. */
function relative(cwd, file) {
  return path.relative(cwd, file).split(path.sep).join('/');
}

/**
 * The layer of the repository-relative path `rel`, or `null` for none.
 * @param {Element[]} elements
 * @param {string} rel
 * @returns {Layer | null}
 */
function layerOf(elements, rel) {
  for (const { type, pattern } of elements) {
    const parts = pattern.split('/');
    const segments = rel.split('/');
    if (segments.length < parts.length) continue;
    let feature;
    const matches = parts.every((part, i) => {
      if (part === '*') {
        feature = segments[i];
        return true;
      }
      return part === segments[i];
    });
    if (matches) return feature === undefined ? { type } : { type, feature };
  }
  return null;
}

/** Whether `rel` is under `src/`, where every file belongs to a layer. */
const inSource = (rel) => rel.startsWith('src/');

/** Every import specifier of a module, with the node to report at. */
function importsOf(onImport) {
  const fromSource = (node) => {
    if (node.source && typeof node.source.value === 'string') onImport(node, node.source.value);
  };
  return {
    ImportDeclaration: fromSource,
    ExportAllDeclaration: fromSource,
    ExportNamedDeclaration: fromSource,
    ImportExpression(node) {
      if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
        onImport(node, node.source.value);
      }
    },
  };
}

/** The layer a relative `specifier` in `file` resolves to; `undefined` for a package. */
function targetOf(context, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const cwd = context.cwd;
  const rel = relative(cwd, path.resolve(path.dirname(context.filename), specifier));
  return { rel, layer: layerOf(context.settings['layers/elements'] ?? [], rel) };
}

/** @type {import('eslint').Rule.RuleModule} */
const dependencies = {
  meta: {
    type: 'problem',
    docs: { description: 'A layer imports only the layers it is allowed to reach.' },
    schema: [{ type: 'object', properties: { allow: { type: 'object' } }, required: ['allow'] }],
    messages: {
      disallowed:
        'The {{from}} layer may not import the {{to}} layer ({{specifier}}). Allowed: {{allowed}}.',
    },
  },
  create(context) {
    const elements = context.settings['layers/elements'] ?? [];
    const from = layerOf(elements, relative(context.cwd, context.filename));
    if (from === null) return {};
    const allowed = context.options[0].allow[from.type] ?? [];
    return importsOf((node, specifier) => {
      const target = targetOf(context, specifier);
      if (target === undefined || target.layer === null) return;
      const to = target.layer;
      const ok = allowed.some((type) =>
        type === 'own-feature'
          ? to.type === 'feature' && from.type === 'feature' && to.feature === from.feature
          : type === to.type,
      );
      if (!ok) {
        context.report({
          node,
          messageId: 'disallowed',
          data: {
            from: from.feature ? `${from.type} ${from.feature}` : from.type,
            to: to.feature ? `${to.type} ${to.feature}` : to.type,
            specifier,
            allowed: allowed.join(', ') || 'nothing',
          },
        });
      }
    });
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noUnknownFiles = {
  meta: {
    type: 'problem',
    docs: { description: 'Every file under src/ belongs to a layer.' },
    schema: [],
    messages: { unknown: '{{file}} belongs to no layer of `layers/elements`.' },
  },
  create(context) {
    const rel = relative(context.cwd, context.filename);
    return {
      Program(node) {
        if (inSource(rel) && layerOf(context.settings['layers/elements'] ?? [], rel) === null) {
          context.report({ node, messageId: 'unknown', data: { file: rel } });
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noUnknownDependencies = {
  meta: {
    type: 'problem',
    docs: { description: 'Every relative import into src/ resolves to a layer.' },
    schema: [],
    messages: { unknown: '{{specifier}} resolves to {{target}}, which belongs to no layer.' },
  },
  create(context) {
    return importsOf((node, specifier) => {
      const target = targetOf(context, specifier);
      if (target !== undefined && inSource(target.rel) && target.layer === null) {
        context.report({ node, messageId: 'unknown', data: { specifier, target: target.rel } });
      }
    });
  },
};

export default {
  meta: { name: 'layers', version: '0.1.0' },
  rules: {
    dependencies,
    'no-unknown-files': noUnknownFiles,
    'no-unknown-dependencies': noUnknownDependencies,
  },
};
