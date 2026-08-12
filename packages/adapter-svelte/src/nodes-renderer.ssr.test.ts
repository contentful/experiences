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
