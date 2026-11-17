import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { Config } from '../registry/types.js';
import ButtonFixture from '../test/fixtures/ButtonFixture.svelte';
import WrappingContainerFixture from '../test/fixtures/WrappingContainerFixture.svelte';
import ExperienceTemplateFixture from '../test/fixtures/ExperienceTemplateFixture.svelte';
import { componentNode, experienceTemplateNode } from '../test/fixtures/render-plan.js';
import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';

const button = (label: string) =>
  componentNode('contentful-button', {
    id: `btn-${label}`,
    contentProperties: { label },
    designProperties: {},
    slots: {},
  });

const config: Config = {
  components: {
    'contentful-container': WrappingContainerFixture,
    'contentful-button': ButtonFixture,
  },
  experienceTemplates: { page: ExperienceTemplateFixture },
};

const renderPlan = async (payload: ExperiencePayload) => {
  const plan = await resolveExperience(payload, config);
  return render(ServerExperienceRenderer, {
    props: { experience: plan, config },
  }).body;
};

describe('NodesRenderer — SSR (server-compiled output)', () => {
  it('renders named template slots containing individually wrapped component snippets', async () => {
    const html = await renderPlan({
      nodes: [
        experienceTemplateNode('page', {
          contentProperties: { title: 'Coded page' },
          slots: {
            content: [
              componentNode('contentful-container', {
                slots: { children: [button('First'), button('Second')] },
              }),
            ],
          },
        }),
      ],
    });
    expect(html).toContain('data-experience-template="page"');
    expect(html).toContain('data-title="Coded page"');
    expect(html).toContain('data-array="true"');
    expect(html).toContain('data-count="2"');
    expect(html).toMatch(
      /<main[\s\S]*data-container[\s\S]*data-index="0"[\s\S]*First[\s\S]*data-index="1"[\s\S]*Second[\s\S]*<\/main>/
    );
  });

  it('renders a composite experience unwrapped', async () => {
    const html = await renderPlan({
      nodes: [button('Alone')],
    });

    expect(html).toContain('Alone');
    expect(html).not.toContain('<main');
  });
});
