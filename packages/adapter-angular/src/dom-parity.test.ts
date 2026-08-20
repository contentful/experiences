/*
 * Angular-only concern, so it lives outside the parity gate in
 * server-renderer.test.ts — there is no Svelte or React test to port it from,
 * because neither framework has the problem.
 *
 * Angular component *selectors* are real DOM elements: a component always has a
 * host element, and that is not configurable. So for as long as the adapter
 * dispatched nodes through components, four elements — `cf-nodes` → `cf-node` →
 * `cf-component-node` → `cf-node-host` — physically nested between a customer
 * component and its slot children, where React renders a fragment and Svelte no
 * element at all.
 *
 * That is not cosmetic. A parent with `display: grid` sees *one* child instead
 * of N, so `gap` and grid tracks apply to a wrapper rather than to the children;
 * and no amount of `display: contents` fixes `.grid > .card`, `:nth-child(n)`,
 * `:first-child`, or the `+`/`~` combinators, because those read the tree, not
 * the layout.
 *
 * Dispatch is therefore structural directives (`*cfNodes` / `*cfNode`), which
 * have no host element. Each leaves a comment anchor and inserts the created
 * component as a *sibling* of it — i.e. a direct child of the customer's own
 * element. Comments are excluded from `Element.children`, so every structural
 * selector above behaves exactly as in React and Svelte (Svelte leaves comment
 * anchors of its own for the same reason).
 *
 * These tests assert the *absence* of adapter elements, so each has a paired
 * positive assertion — an absence test passes trivially if the tree never
 * rendered.
 */

import { describe, expect, it } from 'vitest';

import {
  type ComponentNode,
  type ExperiencePayload,
  resolveExperience,
} from '@contentful/experiences-sdk-core';

import { ContainerFixture } from './test-fixtures/container.fixture.js';
import { HeadingFixture } from './test-fixtures/heading.fixture.js';
import { render } from './test-fixtures/render-harness.js';
import type { Config } from './types.js';

const VIEWPORTS = [{ id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' }];

function componentNode(typeId: string, rest: Omit<ComponentNode, 'component'> = {}): ComponentNode {
  return {
    component: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:Component',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/components/${typeId}`,
      },
    },
    ...rest,
  };
}

/**
 * Every element the adapter used to put in the DOM purely to dispatch a node.
 * None of them may exist. Kept as the historical list on purpose: it is a
 * regression guard, so it should fail loudly if dispatch ever grows a host
 * element back.
 */
const WRAPPER_SELECTORS = ['cf-nodes', 'cf-node', 'cf-component-node', 'cf-node-host'];

const payload: ExperiencePayload = {
  viewports: VIEWPORTS,
  nodes: [
    componentNode('contentful-container', {
      id: 'c',
      slots: {
        children: [
          componentNode('contentful-heading', { id: 'a', contentProperties: { text: 'one' } }),
          componentNode('contentful-heading', { id: 'b', contentProperties: { text: 'two' } }),
          componentNode('contentful-heading', { id: 'd', contentProperties: { text: 'three' } }),
        ],
      },
    }),
  ],
};

const config: Config = {
  components: {
    'contentful-container': ContainerFixture,
    'contentful-heading': HeadingFixture,
  },
};

describe('the adapter contributes no elements of its own', () => {
  it('puts none of the dispatch wrappers in the DOM', async () => {
    const { element } = render(await resolveExperience(payload, config), { config });

    for (const selector of WRAPPER_SELECTORS) {
      expect(
        element.querySelectorAll(selector).length,
        `<${selector}> must not exist — dispatch is anchor-only`
      ).toBe(0);
    }

    // Pairs with the loop above: an absence assertion is vacuous if nothing
    // rendered, so prove the tree that should contain no wrappers is real.
    expect(element.querySelectorAll('cf-heading-fixture').length).toBe(3);
  });

  it('marks its place with a comment and styles nothing', async () => {
    const { element } = render(await resolveExperience(payload, config), { config });

    // An earlier fix neutralized the wrappers with `display: contents`, which
    // meant the adapter injected styling into the customer's tree. There is no
    // element left to hide, so nothing carries an adapter style.
    const headings = Array.from(element.querySelectorAll('cf-heading-fixture'));
    expect(headings.length).toBe(3);
    for (const heading of headings) {
      expect(heading.getAttribute('style')).toBeNull();
    }

    // The positive half of the absence assertions above: dispatch is still
    // there, as a comment anchor. Svelte leaves one too, and a comment is not an
    // element — it affects neither layout nor `:nth-child`/`+`/`~`.
    const container = element.querySelector('cf-container-fixture > div');
    const anchors = Array.from(container!.childNodes).filter((node) => node.nodeType === 8);
    expect(anchors.length).toBeGreaterThan(0);
  });

  it("makes slot children direct children of the customer's own element", async () => {
    const { element } = render(await resolveExperience(payload, config), { config });

    const container = element.querySelector('cf-container-fixture > div');
    expect(container).not.toBeNull();

    // The whole point of tier-3 dispatch: a child combinator reaches the slot
    // children, which `display: contents` on a wrapper could never deliver.
    expect(container!.querySelectorAll(':scope > cf-heading-fixture').length).toBe(3);

    // `Element.children` skips the comment anchors, so index-based selectors and
    // sibling combinators see exactly what React and Svelte would show them.
    expect(container!.children.length).toBe(3);
    expect(
      container!.querySelector(':scope > cf-heading-fixture:first-child')?.textContent
    ).toContain('one');
    expect(
      container!.querySelector(':scope > cf-heading-fixture:nth-child(2)')?.textContent
    ).toContain('two');
    expect(
      container!.querySelector(':scope > cf-heading-fixture:last-child')?.textContent
    ).toContain('three');
  });
});
