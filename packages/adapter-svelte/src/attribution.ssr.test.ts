/*
 * `getContentfulComponent().attribution` under `svelte/server`, where the
 * context getters are read once during the synchronous server render.
 *
 * Runs under vitest.ssr.config.ts (environment: node).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import type { ComponentNode, ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';
import type { Config } from './types.js';
import AttributionProbe from './test-fixtures/AttributionProbe.svelte';
import AttributionTemplateProbe from './test-fixtures/AttributionTemplateProbe.svelte';

const node: ComponentNode = {
  id: 'n',
  component: {
    sys: {
      type: 'ResourceLink',
      linkType: 'Contentful:Component',
      urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/probe',
    },
  },
};
const config: Config = { components: { probe: AttributionProbe } };

describe('getContentfulComponent().attribution (server build)', () => {
  it('renders the node attribution into the markup', async () => {
    const payload: ExperiencePayload = { nodes: [node] };
    const plan = await resolveExperience(payload, config, {
      sourceMap: {
        version: 1,
        variants: [{ type: 'personalization', id: 'default' }],
        spaces: [],
        environments: [],
        locales: [],
        entries: [],
        assets: [],
        layers: [
          { kind: 'Experience', id: 'exp-a', variants: [0] },
          { kind: 'Component', id: 'probe' },
        ],
        dataAssemblies: [],
        nodes: { n: { layers: [1, 0], scope: 0, contentProperties: [] } },
      },
    });

    const { body } = render(ServerExperienceRenderer as never, {
      props: { experience: plan, config },
    });

    expect(body).toContain('>exp-a</span>');
  });

  it('renders nothing for a plan without a source map', async () => {
    const plan = await resolveExperience({ nodes: [node] }, config);

    const { body } = render(ServerExperienceRenderer as never, {
      props: { experience: plan, config },
    });

    expect(body).toMatch(/<span data-scopes=""[^>]*><\/span>/);
  });
});

describe('getContentfulExperienceTemplate().attribution (server build)', () => {
  it('renders the template node attribution into the markup', async () => {
    const templateConfig: Config = {
      components: {},
      experienceTemplates: { page: AttributionTemplateProbe },
    };
    const plan = await resolveExperience(
      {
        nodes: [
          {
            id: 'tpl',
            experienceTemplate: {
              sys: {
                type: 'ResourceLink',
                linkType: 'Contentful:ExperienceTemplate',
                urn: 'crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/page',
              },
            },
          },
        ],
      },
      templateConfig,
      {
        sourceMap: {
          version: 1,
          variants: [{ type: 'personalization', id: 'default' }],
          spaces: [],
          environments: [],
          locales: [],
          entries: [],
          assets: [],
          layers: [
            { kind: 'Experience', id: 'exp-a', variants: [0] },
            { kind: 'ExperienceTemplate', id: 'page' },
          ],
          dataAssemblies: [],
          nodes: { tpl: { layers: [1, 0], scope: 0, contentProperties: [] } },
        },
      }
    );

    const { body } = render(ServerExperienceRenderer as never, {
      props: { experience: plan, config: templateConfig },
    });

    expect(body).toContain('exp-a');
  });
});

describe('an unusable source map (server build)', () => {
  const good = {
    version: 1,
    variants: [{ type: 'personalization', id: 'default' }],
    spaces: [],
    environments: [],
    locales: [],
    entries: [],
    assets: [],
    layers: [
      { kind: 'Experience', id: 'exp-a', variants: [0] },
      { kind: 'Component', id: 'probe' },
    ],
    dataAssemblies: [],
    nodes: { n: { layers: [1, 0], scope: 0, contentProperties: [] } },
  };
  // A wrong version, a missing table, and a node whose chain is nonsense.
  const unusable = [
    { ...good, version: 99 },
    { ...good, layers: undefined },
    { ...good, nodes: { n: { layers: 'nope', scope: 0 } } },
  ];

  it.each(unusable.map((map, i) => [i, map] as const))(
    'still server-renders the component, with no attribution (case %i)',
    async (_i, map) => {
      const plan = await resolveExperience({ nodes: [node] }, config, { sourceMap: map as never });

      const { body } = render(ServerExperienceRenderer as never, {
        props: { experience: plan, config },
      });

      expect(body).toMatch(/<span data-scopes=""[^>]*><\/span>/);
      expect(plan.diagnostics).toEqual([]);
    }
  );
});
