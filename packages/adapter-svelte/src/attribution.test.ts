/*
 * `getContentfulComponent().attribution` on the CLIENT build (jsdom). The
 * context is published as getters over the reactive `node` prop, so a plan
 * update that reuses a node id — which keeps the NodeRenderer instance —
 * must replace the value rather than leave the first one behind.
 */
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import type { ComponentNode, ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import ClientExperienceRenderer from './ClientExperienceRenderer.svelte';
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
const payload: ExperiencePayload = { nodes: [node] };
const config: Config = { components: { probe: AttributionProbe } };

function sourceMap(experienceId: string) {
  return {
    version: 1,
    variants: [{ type: 'personalization', id: 'default' }],
    spaces: [],
    environments: [],
    locales: [],
    entries: [],
    assets: [],
    layers: [
      { kind: 'Experience', id: experienceId, variants: [0] },
      { kind: 'Component', id: 'probe' },
    ],
    dataAssemblies: [],
    nodes: { n: { layers: [1, 0], scope: 0, contentProperties: [] } },
  };
}

describe('getContentfulComponent().attribution (client build)', () => {
  it('exposes the node attribution and replaces it when a plan reuses the node id', async () => {
    const first = await resolveExperience(payload, config, { sourceMap: sourceMap('exp-a') });
    const second = await resolveExperience(payload, config, { sourceMap: sourceMap('exp-b') });
    const cleared = await resolveExperience(payload, config);

    const { container, rerender } = render(ClientExperienceRenderer, {
      props: { experience: first, config } as never,
    });
    const text = () => container.querySelector('[data-scopes]')?.textContent;
    expect(text()).toBe('exp-a');
    // Exactly what the plan carries: the same value React and Angular are held to.
    expect(container.querySelector('[data-scopes]')?.getAttribute('data-json')).toBe(
      JSON.stringify(first.nodes[0]!.attribution)
    );

    await rerender({ experience: second, config } as never);
    expect(text()).toBe('exp-b');

    await rerender({ experience: cleared, config } as never);
    expect(text()).toBe('');
  });
});

describe('an unusable source map (client build)', () => {
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
    'still renders the component, with no attribution (case %i)',
    async (_i, map) => {
      const plan = await resolveExperience(payload, config, { sourceMap: map as never });

      const { container } = render(ClientExperienceRenderer, {
        props: { experience: plan, config } as never,
      });

      expect(container.querySelector('[data-scopes]')).not.toBeNull();
      expect(container.querySelector('[data-scopes]')?.textContent).toBe('');
      expect(container.querySelector('[data-scopes]')?.getAttribute('data-json')).toBe('null');
      expect(plan.diagnostics).toEqual([]);
    }
  );
});

describe('getContentfulExperienceTemplate().attribution (client build)', () => {
  const templateNode = {
    id: 'tpl',
    experienceTemplate: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:ExperienceTemplate',
        urn: 'crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/page',
      },
    },
  } as ExperiencePayload['nodes'][number];
  const templateConfig: Config = {
    components: {},
    experienceTemplates: { page: AttributionTemplateProbe },
  };
  const templateMap = (experienceId: string) => ({
    version: 1,
    variants: [{ type: 'personalization', id: 'default' }],
    spaces: [],
    environments: [],
    locales: [],
    entries: [],
    assets: [],
    layers: [
      { kind: 'Experience', id: experienceId, variants: [0] },
      { kind: 'ExperienceTemplate', id: 'page' },
    ],
    dataAssemblies: [],
    nodes: { tpl: { layers: [1, 0], scope: 0, contentProperties: [] } },
  });

  it('exposes the template node attribution and replaces it when a plan reuses the node id', async () => {
    const payload: ExperiencePayload = { nodes: [templateNode] };
    const first = await resolveExperience(payload, templateConfig, {
      sourceMap: templateMap('exp-a'),
    });
    const second = await resolveExperience(payload, templateConfig, {
      sourceMap: templateMap('exp-b'),
    });

    const { container, rerender } = render(ClientExperienceRenderer, {
      props: { experience: first, config: templateConfig } as never,
    });
    const text = () => container.querySelector('[data-template-scopes]')?.textContent?.trim();
    expect(text()).toBe('exp-a');

    await rerender({ experience: second, config: templateConfig } as never);
    expect(text()).toBe('exp-b');
  });
});
