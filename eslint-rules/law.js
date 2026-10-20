// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Local rules for the laws that live in docs/design.md and would otherwise live only there.
 *
 * A law a component author has to remember is a law that holds until the day it is busy.
 */

/** @type {import('eslint').Rule.RuleModule} */
const noEmDash = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'No em dashes in customer-facing copy. The house voice uses a colon, a full stop, or a comma.',
    },
    schema: [],
    messages: {
      emDash:
        'Em dash in a UI string. The words-on-glass law takes a colon, a full stop or a comma instead.',
    },
  },
  create(context) {
    const report = (node, text) => {
      if (typeof text === 'string' && (text.includes('—') || text.includes('&mdash;'))) {
        context.report({ node, messageId: 'emDash' });
      }
    };
    return {
      Literal(node) {
        report(node, node.value);
      },
      TemplateElement(node) {
        report(node, node.value.raw);
      },
      JSXText(node) {
        report(node, node.value);
      },
    };
  },
};

export default {
  meta: { name: 'law', version: '0.1.0' },
  rules: { 'no-em-dash': noEmDash },
};
