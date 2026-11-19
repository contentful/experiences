import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLOCKS, INLINES } from '@contentful/rich-text-types';
import { readContent } from './Content.tsx';

const text = { nodeType: 'text', data: {}, value: 'Content', marks: [] };
const node = (nodeType, content = [], data = {}) => ({
  nodeType,
  data,
  content,
});
const paragraph = (content = [text]) => node(BLOCKS.PARAGRAPH, content);
const document = (content) => node(BLOCKS.DOCUMENT, content);
const binding = (document) => ({ title: 'Title', text: 'Text', richText: { document } });

test('accepts supported Rich Text structures without changing the binding', () => {
  const content = binding(
    document([
      paragraph([node(INLINES.HYPERLINK, [text], { uri: 'https://example.com' })]),
      node(BLOCKS.UL_LIST, [node(BLOCKS.LIST_ITEM, [paragraph()])]),
      node(BLOCKS.TABLE, [node(BLOCKS.TABLE_ROW, [node(BLOCKS.TABLE_CELL, [paragraph()])])]),
      node(BLOCKS.EMBEDDED_RESOURCE, [], {
        target: { sys: { type: 'ResourceLink', linkType: 'Contentful:Entry', urn: 'crn:entry' } },
      }),
    ])
  );
  const original = globalThis.structuredClone(content);
  assert.deepEqual(readContent(content, 'codedComponent'), original);
  assert.deepEqual(content, original);
  assert.doesNotThrow(() => readContent(binding(document([])), 'codedComponent'));
});

for (const [name, value] of [
  ['nested paragraphs', document([paragraph([paragraph()])])],
  ['top-level table cell', document([node(BLOCKS.TABLE_CELL, [paragraph()])])],
  ['list without list items', document([node(BLOCKS.UL_LIST, [paragraph()])])],
  ['table without rows', document([node(BLOCKS.TABLE, [paragraph()])])],
  [
    'inline containing a block',
    document([paragraph([node(INLINES.HYPERLINK, [paragraph()], { uri: 'https://example.com' })])]),
  ],
  ['malformed text', document([paragraph([{ ...text, value: 123 }])])],
  ['null child', document([paragraph([null])])],
  ['unknown child type', document([node('unknown-node')])],
  ['missing document', undefined],
]) {
  test(`rejects ${name} at the binding boundary`, () => {
    assert.throws(() => readContent(binding(value), 'codedComponent'), /richText\.document/);
  });
}
