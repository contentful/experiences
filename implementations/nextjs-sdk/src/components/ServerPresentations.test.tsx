import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PortableRenderPlan } from '@contentful/experiences-web';
import parse from 'html-react-parser';
import { ServerPresentations } from './ServerPresentations';

const outer = { key: 'outer', entityId: 'experience', entityKind: 'Experience' as const };
const inner = {
  key: 'inner',
  entityId: 'fragment',
  entityKind: 'ExperienceFragment' as const,
  variantId: 'selected',
  parentExperienceId: 'experience',
  entryIds: ['entry'],
};
const fragment: PortableRenderPlan['nodes'][number] = {
  registration: { kind: 'component', id: 'codedComponent' },
  attribution: { scopes: [outer, inner], roots: [outer, inner] },
  props: {
    content: {
      title: 'Server content',
      text: '<img src=x onerror="bad()"> & literal text',
      richText: { document: { nodeType: 'document', data: {}, content: [] } },
      style: { color: 'red', fontSize: 16 },
    },
    design: {},
    designRaw: {},
  },
  slots: {},
};
const plan: PortableRenderPlan = {
  nodes: [
    {
      ...fragment,
      registration: { kind: 'experienceTemplate', id: 'codedExperienceTemplate' },
      attribution: { scopes: [outer, inner], roots: [outer] },
      props: {
        ...fragment.props,
        content: {
          ...fragment.props.content,
          title: 'Experience-only template',
          'data-kept': 'yes',
        },
      },
      slots: { slot: [fragment] },
    },
  ],
  attribution: { scopes: { outer, inner } },
  diagnostics: [],
  metadata: { privateMarker: 'must-not-be-serialized' },
  debug: false,
};

function freeze(value: object) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') freeze(child);
  }
  Object.freeze(value);
}

test('preserves immutable server content and manual tracking policy through HTML adoption', (t) => {
  // Next preserves JSX; the standalone tsx runner uses React.createElement.
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, 'React', previousReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });
  freeze(plan);
  const html = renderToStaticMarkup(
    ServerPresentations({
      all: [{ experienceId: 'experience', plan }],
      routeKey: '/',
      ids: ['experience'],
    })
  );
  const regions = html.split('data-ctfl-manual-views="true"');
  assert.equal(regions.length, 2);
  for (const kind of ['views', 'hovers', 'clicks']) {
    assert.ok(!regions[0]!.includes(`data-ctfl-track-${kind}="false"`));
    assert.equal(
      (regions[1]!.match(new RegExp(`data-ctfl-track-${kind}="false"`, 'g')) ?? []).length,
      4
    );
  }
  const fragments = html.match(/<article\b[^>]*>/g) ?? [];
  const experiences = html.match(/<section\b[^>]*data-ctfl-scopes="outer"[^>]*>/g) ?? [];
  assert.equal(fragments.length, 3);
  assert.equal(experiences.length, 3);
  assert.ok(
    fragments.every(
      (root) =>
        root.includes('data-ctfl-scopes="outer inner"') &&
        root.includes('data-ctfl-clickable="true"') &&
        root.includes('style="color:red;font-size:16px"')
    )
  );
  assert.ok(
    experiences.every(
      (root) => !root.includes('data-ctfl-clickable') && root.includes('data-kept="yes"')
    )
  );
  for (const text of ['Slot: slot', 'Experience-only template', 'Server content']) {
    assert.equal((html.match(new RegExp(text, 'g')) ?? []).length, 3);
  }
  assert.ok(!html.includes('must-not-be-serialized'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.equal(
    renderToStaticMarkup(React.createElement('div', null, parse(html))),
    `<div>${html}</div>`
  );
});
