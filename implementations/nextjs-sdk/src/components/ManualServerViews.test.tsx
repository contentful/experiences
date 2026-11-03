import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createWebSnapshotRuntime,
  type ContentfulExperiences,
  type PortableRenderPlan,
  type TrackingAttribution,
} from '@contentful/experiences-web';
import { ExperiencesProvider } from '@contentful/experiences-nextjs/client';
import { ManualServerViews, registerManualServerViews } from './ManualServerViews';
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
const plan: PortableRenderPlan = {
  nodes: [
    {
      registration: { kind: 'component', id: 'codedComponent' },
      attribution: { scopes: [outer, inner], roots: [outer, inner] },
      props: {
        content: {
          title: 'Server content',
          text: 'Retained without browser rendering',
          richText: { document: { nodeType: 'document', data: {}, content: [] } },
        },
        design: {},
        designRaw: {},
      },
      slots: {},
    },
  ],
  attribution: { scopes: { outer, inner } },
  diagnostics: [],
  metadata: { privateMarker: 'must-not-be-serialized' },
  debug: false,
};

test('adopts escaped server markup with its styles and tracking attributes intact', (t) => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, 'React', previousReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });
  const html = renderToStaticMarkup(
    React.createElement(
      'article',
      {
        className: 'entry-card',
        style: { color: 'red', fontSize: 16 },
        'data-ctfl-attribution': JSON.stringify({ scopes: { inner } }),
        'data-ctfl-scopes': 'inner',
        'data-ctfl-track-views': false,
      },
      '<img src=x onerror="bad()"> & literal text'
    )
  );
  const sdk = createWebSnapshotRuntime() as unknown as ContentfulExperiences;
  const adopted = renderToStaticMarkup(
    React.createElement(
      ExperiencesProvider,
      { sdk },
      React.createElement(ManualServerViews, { html })
    )
  );
  assert.equal(adopted, `<div>${html}</div>`);
  assert.ok(!adopted.includes('<img'));
});

test('server output preserves automatic defaults and disables every automatic kind on both manual copies', (t) => {
  // Next preserves JSX for its compiler; the standalone tsx runner uses React.createElement.
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { value: React, configurable: true });
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, 'React', previousReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });
  for (const routeKey of [
    '/pages?mode=server-only',
    '/?mode=server-only&analytics=off',
    '/page-two?mode=server-only&analytics=off',
  ]) {
    const content = ServerPresentations({
      all: [{ experienceId: 'experience', plan }],
      routeKey,
      ids: ['experience'],
    });
    assert.notEqual(content.type, ManualServerViews);
    // Render without an SDK provider: analytics-off SSR must remain independent of context.
    const html = renderToStaticMarkup(content);
    assert.equal((html.match(/Server content/g) ?? []).length, 3);
    for (const kind of ['views', 'hovers', 'clicks']) {
      assert.equal(
        (html.match(new RegExp(`data-ctfl-track-${kind}="false"`, 'g')) ?? []).length,
        2
      );
    }
    assert.equal((html.match(/data-ctfl-scopes="outer inner"/g) ?? []).length, 3);
    assert.equal((html.match(/data-ctfl-clickable="true"/g) ?? []).length, 3);
    assert.ok(html.includes('data-reference-manual-views'));
    assert.ok(html.includes('Experiences for manual view registration'));
    assert.ok(!html.includes('must-not-be-serialized'));
  }
  const app = ServerPresentations({
    all: [{ experienceId: 'experience', plan }],
    routeKey: '/?mode=server-only',
    ids: ['experience'],
  });
  assert.equal(app.type, ManualServerViews);
  assert.equal((renderToStaticMarkup(app.props.children).match(/Server content/g) ?? []).length, 3);

  const fragment = plan.nodes[0]!;
  const nestedPlan: PortableRenderPlan = {
    ...plan,
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
  };
  const original = globalThis.structuredClone(nestedPlan);
  function freeze(value: object) {
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') freeze(child);
    }
    Object.freeze(value);
  }
  freeze(nestedPlan);
  for (const routeKey of ['/pages?mode=server-only', '/?mode=server-only']) {
    const content = ServerPresentations({
      all: [{ experienceId: 'experience', plan: nestedPlan }],
      routeKey,
      ids: ['experience'],
    });
    const html = renderToStaticMarkup(
      content.type === ManualServerViews ? content.props.children : content
    );
    const fragmentRoots = html.match(/<article\b[^>]*>/g) ?? [];
    const experienceRoots = html.match(/<section\b[^>]*data-ctfl-scopes="outer"[^>]*>/g) ?? [];
    assert.equal(fragmentRoots.length, 3);
    assert.equal(experienceRoots.length, 3);
    assert.ok(fragmentRoots.every((root) => root.includes('data-ctfl-clickable="true"')));
    assert.ok(experienceRoots.every((root) => !root.includes('data-ctfl-clickable')));
    assert.ok(experienceRoots.every((root) => root.includes('data-kept="yes"')));
    // Both manual copies keep click tracking disabled, even on clickable fragments.
    assert.equal(
      fragmentRoots.filter((root) => root.includes('data-ctfl-track-clicks="false"')).length,
      2
    );
    assert.equal((html.match(/Slot: slot/g) ?? []).length, 3);
    assert.equal((html.match(/Experience-only template/g) ?? []).length, 3);
    assert.equal((html.match(/Server content/g) ?? []).length, 3);
    assert.deepEqual(nestedPlan, original);
  }
});

test('manual registration uses the final real root in each nearest container and clears old elements', () => {
  function element(scopes: string, data: Record<string, TrackingAttribution>) {
    return {
      getAttribute: () => scopes,
      closest: (selector: string) => {
        assert.equal(selector, '[data-ctfl-attribution]');
        return { getAttribute: () => JSON.stringify({ scopes: data }) };
      },
    } as unknown as HTMLElement;
  }
  const replacement = { ...inner, variantId: 'replacement' };
  const first = element('outer inner', { outer, inner });
  const repeated = element('outer inner', { outer, inner: replacement });
  const unattributed = element('missing', {});
  const enabled: { element: HTMLElement; data: TrackingAttribution }[] = [];
  const cleared: HTMLElement[] = [];
  const tracking = {
    enableElement(kind: string, element: HTMLElement, options: { data?: TrackingAttribution }) {
      assert.equal(kind, 'views');
      assert.ok(options.data);
      enabled.push({ element, data: options.data });
    },
    clearElement(kind: string, element: HTMLElement) {
      assert.equal(kind, 'views');
      cleared.push(element);
    },
  };
  const container = {
    querySelectorAll: (selector: string) => {
      assert.equal(selector, '[data-reference-manual-views] [data-ctfl-scopes]');
      return [first, repeated, unattributed];
    },
  } as unknown as HTMLElement;
  const cleanup = registerManualServerViews(container, tracking);
  assert.deepEqual(enabled, [
    { element: first, data: inner },
    { element: repeated, data: replacement },
  ]);
  assert.deepEqual(cleared, []);
  cleanup();
  assert.deepEqual(cleared, [first, repeated]);
  registerManualServerViews(container, tracking)();
  assert.equal(enabled.length, 4);
  assert.deepEqual(cleared, [first, repeated, first, repeated]);
});
