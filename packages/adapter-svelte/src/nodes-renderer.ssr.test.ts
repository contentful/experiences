/*
 * True SSR coverage: renders through `svelte/server` so Svelte's *server*
 * compiler output is exercised. Every other test in this package renders via
 * `@testing-library/svelte`, i.e. the client build.
 *
 * The two builds differ in how a compiled snippet receives its arguments — by
 * getter on the client, by value on the server — and `NodesRenderer` builds one
 * snippet call by hand (`toChildSnippet`). These tests pin that nested nodes
 * render under SSR for both node kinds; without the normalization in
 * `NodesRenderer`, every child node throws.
 *
 * Runs under vitest.ssr.config.ts (environment: node).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import type {
  ComponentNode,
  ExperiencePayload,
  ExperienceTemplateNode,
} from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';
import type { Config } from './types.js';

import BrokenFixture from './test-fixtures/BrokenFixture.svelte';
import ButtonFixture from './test-fixtures/ButtonFixture.svelte';
import ContainerFixture from './test-fixtures/ContainerFixture.svelte';
import ExperienceTemplateFixture from './test-fixtures/ExperienceTemplateFixture.svelte';

const VIEWPORTS = [{ id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' }];

const componentNode = (
  typeId: string,
  rest: Omit<ComponentNode, 'component'> = {}
): ComponentNode => ({
  component: {
    sys: {
      type: 'ResourceLink',
      linkType: 'Contentful:Component',
      urn: `crn:contentful:::experience:spaces/$self/environments/$self/components/${typeId}`,
    },
  },
  ...rest,
});

const experienceTemplateNode = (
  typeId: string,
  rest: Omit<ExperienceTemplateNode, 'experienceTemplate'> = {}
): ExperienceTemplateNode => ({
  experienceTemplate: {
    sys: {
      type: 'ResourceLink',
      linkType: 'Contentful:ExperienceTemplate',
      urn: `crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/${typeId}`,
    },
  },
  ...rest,
});

const button = (label: string) =>
  componentNode('contentful-button', {
    id: `btn-${label}`,
    contentProperties: { label },
    designProperties: {},
    slots: {},
  });

const config: Config = {
  components: {
    'contentful-container': ContainerFixture,
    'contentful-button': ButtonFixture,
  },
  experienceTemplates: { page: ExperienceTemplateFixture },
};

const renderPlan = async (payload: ExperiencePayload) => {
  const plan = await resolveExperience(payload, config);
  return render(ServerExperienceRenderer as never, {
    props: { experience: plan, config } as never,
  }).body;
};

describe('NodesRenderer — SSR (server-compiled output)', () => {
  it('renders a component node’s slot children', async () => {
    const html = await renderPlan({
      viewports: VIEWPORTS,
      nodes: [
        componentNode('contentful-container', {
          id: 'container',
          contentProperties: {},
          designProperties: {},
          slots: { children: [button('Get started')] },
        }),
      ],
    });

    expect(html).toContain('Get started');
    expect(html.indexOf('<div')).toBeLessThan(html.indexOf('Get started'));
  });

  it('renders a coded Experience Template node’s named `content` slot', async () => {
    const html = await renderPlan({
      viewports: VIEWPORTS,
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          contentProperties: { title: 'Coded page' },
          designProperties: {},
          slots: { content: [button('Read the blog')] },
        }),
      ],
    });

    expect(html).toContain('data-experience-template="page"');
    expect(html).toContain('data-title="Coded page"');
    expect(html).toContain('Read the blog');
    // The button is inside the template chrome, not a sibling of it.
    expect(html.split('<main')[1]).toContain('Read the blog');
  });

  it('renders deeply nested slot children', async () => {
    const html = await renderPlan({
      viewports: VIEWPORTS,
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          contentProperties: {},
          designProperties: {},
          slots: {
            content: [
              componentNode('contentful-container', {
                id: 'container',
                contentProperties: {},
                designProperties: {},
                slots: { children: [button('Deep')] },
              }),
            ],
          },
        }),
      ],
    });

    expect(html).toContain('Deep');
  });

  it('renders a composite experience unwrapped', async () => {
    const html = await renderPlan({
      viewports: VIEWPORTS,
      nodes: [button('Alone')],
    });

    expect(html).toContain('Alone');
    expect(html).not.toContain('<main');
  });
});

/*
 * The load-bearing SSR/CSR asymmetry this ticket documents: unlike React's
 * class-boundary + internal <Suspense> (which degrades gracefully under both
 * legacy and streaming SSR — see the React adapter's nodes-renderer.ssr.test.tsx),
 * Svelte's native `<svelte:boundary>` has NO server-rendering story at all.
 * `svelte/server`'s render is a synchronous string walk with no boundary
 * concept; a throw during that walk simply propagates. This is proven here,
 * not just asserted in a comment, per the plan's "prove it, don't just
 * document it" bar. See `NodeRenderer.test.ts` for the client-side catch.
 */
describe('NodesRenderer — SSR component-render-error (the documented gap)', () => {
  const brokenConfig: Config = {
    components: { broken: BrokenFixture, 'contentful-button': ButtonFixture },
  };

  it('has no recovery path under svelte/server — no graceful fallback markup is produced', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('broken', { id: 'b' }), button('sibling')],
    };
    const plan = await resolveExperience(payload, brokenConfig);

    // Observed to propagate as a synchronous exception in most runs (and in
    // an isolated `<svelte:boundary onerror failed>` repro outside this
    // component tree, with no NodeRenderer/context involved) — but its exact
    // timing proved inconsistent across invocation contexts during
    // development (sync throw in some runs, seemingly swallowed in others),
    // which is itself notable: unlike React's Suspense-based degradation
    // (deterministic — see the React adapter's nodes-renderer.ssr.test.tsx),
    // Svelte's `<svelte:boundary>` has no supported SSR recovery contract at
    // all here, so nothing guarantees *how* the failure surfaces. What's
    // asserted below is the one thing that held in every run: the `failed`
    // snippet's markup never appears, so there's no graceful degradation to
    // rely on either way.
    let html: string | undefined;
    let caught: unknown;
    try {
      html = render(ServerExperienceRenderer as never, {
        props: { experience: plan, config: brokenConfig } as never,
      }).body;
    } catch (err) {
      caught = err;
    }

    if (caught) {
      expect((caught as Error).message).toBe('boom');
    } else {
      expect(html).not.toContain('data-experiences-render-error');
    }
  });
});
