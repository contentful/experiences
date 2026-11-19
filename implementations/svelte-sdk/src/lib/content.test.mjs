import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLOCKS, INLINES, MARKS } from '@contentful/rich-text-types';
import { readContent, renderContentRichText } from './content.ts';

const text = (value, marks = []) => ({ nodeType: 'text', data: {}, value, marks });
const node = (nodeType, content = [], data = {}) => ({ nodeType, data, content });
const paragraph = (content) => node(BLOCKS.PARAGRAPH, content);
const document = (content) => node(BLOCKS.DOCUMENT, content);
const hyperlinkDocument = (uri, content = [text('Link')]) =>
  document([paragraph([node(INLINES.HYPERLINK, content, { uri })])]);

test('unsafe URL schemes and control characters render harmless children', () => {
  for (const uri of [
    'javascript:alert(document.domain)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\nscript:alert(1)',
    'java\rscript:alert(1)',
    'java\tscript:alert(1)',
    '\u0000javascript:alert(1)',
    '\u001fjavascript:alert(1)',
    'javascript:\u007falert(1)',
    'https://example.com/\u0085path',
    'https://example.com/\npath',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'blob:https://example.com/id',
    'ftp://example.com/file',
    'https://[invalid',
    '',
    '   ',
  ]) {
    const input = hyperlinkDocument(uri, [text('<Keep & text>', [{ type: MARKS.BOLD }])]);
    // Exercise the actual binding validator: structural validity does not establish URL safety.
    const content = readContent(
      { title: 'Title', text: 'Text', richText: { document: input } },
      'card'
    );
    assert.equal(
      renderContentRichText(content.richText.document),
      '<p><b>&lt;Keep &amp; text&gt;</b></p>',
      JSON.stringify(uri)
    );
  }
});

test('HTTP(S), mailto, tel, relative, query and hash links retain anchors', () => {
  for (const uri of [
    'https://example.com/path',
    'http://example.com/path',
    'HTTPS://example.com/path',
    'mailto:reader@example.com',
    'tel:+123456789',
    '/catalog',
    './catalog',
    '../catalog',
    'catalog/item',
    '//example.com/path',
    '?page=2',
    '#section',
    '/catalog/javascript:example',
  ]) {
    assert.equal(
      renderContentRichText(hyperlinkDocument(uri)),
      `<p><a href="${uri}">Link</a></p>`,
      uri
    );
  }
});

test('hyperlink attributes and child text escape markup and quote breakout', () => {
  const uri = 'https://example.com/?q=" onmouseover="alert(1)&value=<tag>\'&quot;';
  assert.equal(
    renderContentRichText(hyperlinkDocument(uri, [text('<script>"\'&</script>')])),
    '<p><a href="https://example.com/?q=&quot; onmouseover=&quot;alert(1)&amp;value=&lt;tag&gt;&#39;&amp;quot;">&lt;script&gt;&quot;&#39;&amp;&lt;/script&gt;</a></p>'
  );
  // Ampersand escaping prevents HTML character references from introducing a scheme colon.
  assert.equal(
    renderContentRichText(hyperlinkDocument('javascript&#58;alert(1)')),
    '<p><a href="javascript&amp;#58;alert(1)">Link</a></p>'
  );
});

test('normal document formatting, lists and tables keep the official rendering', () => {
  const input = document([
    node(BLOCKS.HEADING_2, [text('Heading')]),
    paragraph([text('Bold', [{ type: MARKS.BOLD }]), text(' & plain')]),
    node(BLOCKS.UL_LIST, [node(BLOCKS.LIST_ITEM, [paragraph([text('Item')])])]),
    node(BLOCKS.QUOTE, [paragraph([text('Quote')])]),
    node(BLOCKS.TABLE, [
      node(BLOCKS.TABLE_ROW, [
        node(BLOCKS.TABLE_HEADER_CELL, [paragraph([text('Header')])]),
        node(BLOCKS.TABLE_CELL, [paragraph([text('Cell')])]),
      ]),
    ]),
    node(BLOCKS.HR),
  ]);
  const original = structuredClone(input);
  const content = readContent(
    { title: 'Title', text: 'Text', richText: { document: input } },
    'card'
  );
  assert.equal(
    renderContentRichText(content.richText.document),
    '<h2>Heading</h2><p><b>Bold</b> &amp; plain</p><ul><li><p>Item</p></li></ul><blockquote><p>Quote</p></blockquote><table><tr><th><p>Header</p></th><td><p>Cell</p></td></tr></table><hr/>'
  );
  assert.deepEqual(input, original);
  assert.equal(renderContentRichText(document([])), '');
});
