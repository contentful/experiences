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
import {
  attributedPlan,
  componentNode,
  experienceTemplateNode,
} from '../test/fixtures/render-plan.js';
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

  describe('NodesRenderer — native SSR boundary policy', () => {
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

    it('recovers a node through a public host transform', async () => {
      const config: Config = {
        components: { broken: BrokenFixture, 'contentful-button': ButtonFixture },
      };
      const plan = await resolveExperience(
        { nodes: [button('before'), componentNode('broken', { id: 'b' }), button('after')] },
        config
      );
      const errors: unknown[] = [];
      const transformError = (error: unknown) => {
        errors.push(error);
        const publicError = { message: 'Public rendering error' };
        return publicError;
      };
      const { body } = await render(ServerExperienceRenderer, {
        props: { experience: plan, config, debug: true, renderError: PropsProbe },
        transformError,
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Error);
      expect(body).toContain('before');
      expect(body).toContain('after');
      expect(body).toContain('Public rendering error');
      expect(body).toContain('Retry rendering');
      expect(body).toContain('componentId');
      expect(body).not.toContain('boom');
      expect(body).not.toContain('[object Object]');
    });

    it('propagates a failing custom fallback instead of catching it recursively', async () => {
      const plan = await resolveExperience({ nodes: [componentNode('broken')] }, brokenConfig);
      expect(
        () =>
          render(ServerExperienceRenderer, {
            props: { experience: plan, config: brokenConfig, renderError: BrokenFixture },
            transformError: () => ({ message: 'Public rendering error' }),
          }).body
      ).toThrow('boom');
    });
  });
});

it('serializes forwarded and named root attribution without binding props', () => {
  const config = {
    components: { button: ButtonFixture },
    experienceTemplates: {
      page: { component: ExperienceTemplateFixture, root: { prop: 'experienceRoot' } },
    },
  };
  const experience = attributedPlan('page', {}, 'experienceTemplate');
  experience.nodes[0]!.slots = {
    content: attributedPlan('button', { 'data-ctfl-scopes': 'manual' }).nodes,
    sidebar: [],
  };
  const { body } = render(ServerExperienceRenderer, { props: { experience, config } });
  expect(body.match(/data-ctfl-scopes="hero"/g)).toHaveLength(2);
  expect(body).toContain('data-ctfl-scopes="manual"');
  expect(body.match(/data-ctfl-attribution=/g)).toHaveLength(1);
  expect(body).not.toContain('experienceRoot');
  expect(body).not.toContain('Symbol');
});
