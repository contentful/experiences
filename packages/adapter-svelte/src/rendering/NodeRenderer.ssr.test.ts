import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { Config } from '../registry/types.js';
import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';
import PropsProbe from '../test/fixtures/PropsProbe.svelte';
import ExperienceTemplateFixture from '../test/fixtures/ExperienceTemplateFixture.svelte';
import BrokenFixture from '../test/fixtures/BrokenFixture.svelte';
import ButtonFixture from '../test/fixtures/ButtonFixture.svelte';
import { componentNode, experienceTemplateNode } from '../test/fixtures/render-plan.js';
import { minimalSourceMap } from '../test/fixtures/source-map.js';

const node = componentNode('probe', { id: 'n' });
const config: Config = { components: { probe: PropsProbe } };

describe('getContentfulComponent().attribution (server build)', () => {
  it('renders the node attribution into the markup', async () => {
    const payload: ExperiencePayload = { nodes: [node] };
    const plan = await resolveExperience(payload, config, {
      sourceMap: minimalSourceMap(),
    });

    const { body } = render(ServerExperienceRenderer, {
      props: { experience: plan, config },
    });

    expect(body).toContain('>exp-a</span>');
  });

  it('renders nothing for a plan without a source map', async () => {
    const plan = await resolveExperience({ nodes: [node] }, config);

    const { body } = render(ServerExperienceRenderer, {
      props: { experience: plan, config },
    });

    expect(body).toMatch(/<span[^>]*data-scopes=""[^>]*data-json="null"[^>]*><\/span>/);
  });
});

describe('getContentfulExperienceTemplate().attribution (server build)', () => {
  it('renders the template node attribution into the markup', async () => {
    const templateConfig: Config = {
      components: {},
      experienceTemplates: { page: ExperienceTemplateFixture },
    };
    const plan = await resolveExperience(
      {
        nodes: [experienceTemplateNode('page', { id: 'tpl' })],
      },
      templateConfig,
      {
        sourceMap: minimalSourceMap({
          node: 'tpl',
          leaf: { kind: 'ExperienceTemplate', id: 'page' },
        }),
      }
    );

    const { body } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: templateConfig },
    });

    expect(body).toContain('exp-a');
  });
});

describe('SSR customer rendering failures', () => {
  const button = (label: string) =>
    componentNode('contentful-button', {
      id: `btn-${label}`,
      contentProperties: { label },
      designProperties: {},
      slots: {},
    });

  // The supported server renderer propagates customer component errors;
  // NodeRenderer.test.ts covers the client boundary's per-node recovery.
  describe('NodesRenderer — SSR component-render-error (the documented gap)', () => {
    const brokenConfig: Config = {
      components: { broken: BrokenFixture, 'contentful-button': ButtonFixture },
    };

    it('propagates the customer component error under svelte/server', async () => {
      const payload: ExperiencePayload = {
        nodes: [componentNode('broken', { id: 'b' }), button('sibling')],
      };
      const plan = await resolveExperience(payload, brokenConfig);

      // Svelte renders lazily when body is read.
      expect(
        () =>
          render(ServerExperienceRenderer, {
            props: { experience: plan, config: brokenConfig },
          }).body
      ).toThrow('boom');
    });
  });
});
