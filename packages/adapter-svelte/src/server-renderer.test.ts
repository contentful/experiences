import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import type {
  ComponentTypeNode,
  ExperiencePayload,
  ManualDesignValue,
  ValuesByViewport,
} from '@contentful/experiences-core';
import { resolveExperience } from '@contentful/experiences-core';

import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';
import type { Config } from './types.js';

import CapturingComponent from './test-fixtures/CapturingComponent.svelte';
import ButtonFixture from './test-fixtures/ButtonFixture.svelte';
import ContainerFixture from './test-fixtures/ContainerFixture.svelte';
import HeadingFixture from './test-fixtures/HeadingFixture.svelte';
import ItemFixture from './test-fixtures/ItemFixture.svelte';
import PrecedenceFixture from './test-fixtures/PrecedenceFixture.svelte';
import TemplateFixture from './test-fixtures/TemplateFixture.svelte';

const VIEWPORTS = [
  { id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' },
  { id: 'tablet', query: '<992px', displayName: 'Tablet', previewSize: '100%' },
  { id: 'mobile', query: '<576px', displayName: 'Mobile', previewSize: '100%' },
];

const m = (value: string): ManualDesignValue => ({ type: 'ManualDesignValue', value });

const vbv = (values: Record<string, ManualDesignValue>): ValuesByViewport => ({
  type: 'ValuesByViewport',
  values,
});

function componentNode(
  typeId: string,
  rest: Omit<ComponentTypeNode, 'componentType'> = {}
): ComponentTypeNode {
  return {
    componentType: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:ComponentType',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/componentTypes/${typeId}`,
      },
    },
    ...rest,
  };
}

const config: Config = {
  components: {
    'contentful-container': { component: ContainerFixture },
    'contentful-heading': { component: HeadingFixture },
    'contentful-button': { component: ButtonFixture },
  },
};

const payload: ExperiencePayload = {
  viewports: VIEWPORTS,
  nodes: [
    componentNode('contentful-container', {
      id: 'page',
      contentProperties: {},
      designProperties: {
        cfPadding: vbv({ desktop: m('40px'), mobile: m('12px') }),
      },
      slots: {
        children: [
          componentNode('contentful-heading', {
            id: 'heading',
            contentProperties: { text: 'Build faster' },
            designProperties: {
              cfFontSize: vbv({ desktop: m('32px'), mobile: m('20px') }),
            },
          }),
          componentNode('contentful-button', {
            id: 'btn',
            contentProperties: { label: 'Get started' },
            designProperties: {
              cfBackgroundColor: vbv({
                desktop: m('#4f39f6'),
                tablet: m('#ff0000'),
                mobile: m('#00aa00'),
              }),
            },
          }),
        ],
      },
    }),
  ],
};

describe('ServerExperienceRenderer', () => {
  it('renders a nested experience with desktop-resolved design props by default', async () => {
    const plan = await resolveExperience(payload, config);
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config },
    });
    const html = container.innerHTML;

    expect(html).toContain('data-padding="40px"');
    expect(html).toContain('data-font-size="32px"');
    expect(html).toContain('data-bg="#4f39f6"');
    expect(html).toContain('Build faster');
    expect(html).toContain('Get started');
  });

  it('honors initialViewportId when resolving design props', async () => {
    const plan = await resolveExperience(payload, config);
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config, initialViewportId: 'mobile' },
    });
    const html = container.innerHTML;

    expect(html).toContain('data-padding="12px"');
    expect(html).toContain('data-font-size="20px"');
    expect(html).toContain('data-bg="#00aa00"');
  });

  it('cascades design values when the active viewport has none', async () => {
    const plan = await resolveExperience(payload, config);
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config, initialViewportId: 'tablet' },
    });
    const html = container.innerHTML;

    expect(html).toContain('data-font-size="32px"'); // cascaded from desktop
    expect(html).toContain('data-bg="#ff0000"'); // tablet-specific
  });

  it('renders nothing meaningful when plan is null/undefined', () => {
    // Svelte emits an empty `<!---->` comment placeholder for skipped {#if} blocks;
    // assert that no real DOM nodes were rendered rather than an empty string.
    const { container: nullContainer } = render(ServerExperienceRenderer, {
      props: { experience: null, config },
    });
    expect(nullContainer.querySelector('*')).toBeNull();

    const { container: undefContainer } = render(ServerExperienceRenderer, {
      props: { experience: undefined, config },
    });
    expect(undefContainer.querySelector('*')).toBeNull();
  });

  it('exposes the active viewport on render context (defaults to viewport[0])', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const captureConfig: Config = {
      components: {
        capture: {
          component: CapturingComponent,
        },
      },
    };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig
    );
    render(ServerExperienceRenderer, {
      props: { experience: plan, config: captureConfig, context: { capture: seen } },
    });

    expect(seen.length).toBeGreaterThan(0);
    const ctx = seen[0]!.experience as Record<string, unknown>;
    expect(ctx.activeViewportIndex).toBe(0);
    expect(ctx.activeViewport).toBe(VIEWPORTS[0]);
    expect(ctx.viewports).toBe(VIEWPORTS);
  });

  it('honors initialViewportId when computing the active viewport', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const captureConfig: Config = {
      components: {
        capture: { component: CapturingComponent },
      },
    };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig
    );
    render(ServerExperienceRenderer, {
      props: {
        experience: plan,
        config: captureConfig,
        initialViewportId: 'mobile',
        context: { capture: seen },
      },
    });

    const ctx = seen[0]!.experience as Record<string, unknown>;
    expect(ctx.activeViewportIndex).toBe(2);
    expect(ctx.activeViewport).toBe(VIEWPORTS[2]);
  });

  it('renders missing-component fallback in preview mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const justContainer: Config = {
      components: {
        'contentful-container': { component: ContainerFixture },
      },
    };
    const planWithMissing = {
      viewports: VIEWPORTS,
      nodes: [
        {
          nodeId: 'root',
          registration: { componentTypeId: 'contentful-container' },
          props: { content: {}, design: {} },
          slots: {
            children: [
              {
                nodeId: 'ghost',
                registration: { componentTypeId: 'NotRegistered' },
                props: { content: {}, design: {} },
                slots: {},
              },
            ],
          },
        },
      ],
    };

    const { container: previewContainer } = render(ServerExperienceRenderer, {
      props: {
        experience: planWithMissing,
        config: justContainer,
        context: { isPreview: true },
      },
    });
    expect(previewContainer.innerHTML).toContain('data-experiences-missing="NotRegistered"');

    const { container: prodContainer } = render(ServerExperienceRenderer, {
      props: { experience: planWithMissing, config: justContainer },
    });
    expect(prodContainer.innerHTML).not.toContain('data-experiences-missing');

    warn.mockRestore();
  });

  it('merges defaults beneath content (content wins)', async () => {
    const itemConfig: Config = {
      components: {
        item: {
          defaults: { variant: 'fallback', priority: 'low' },
          component: ItemFixture,
        },
      },
    };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('item', {
            id: 'i',
            contentProperties: { variant: 'fromContent' },
          }),
        ],
      },
      itemConfig
    );
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: itemConfig },
    });
    expect(container.innerHTML).toContain('data-variant="fromContent"');
    expect(container.innerHTML).toContain('data-priority="low"');
  });

  it('respects merge precedence: defaults < content < design < resolved < experience', () => {
    const precedenceConfig: Config = {
      components: {
        item: {
          defaults: { value: 'fromDefault' },
          component: PrecedenceFixture,
        },
      },
    };
    // Simulate a plan that already went through resolveExperience.
    const planWithResolved = {
      viewports: VIEWPORTS,
      nodes: [
        {
          nodeId: 'r',
          registration: { componentTypeId: 'item' },
          props: {
            content: { value: 'fromContent' },
            design: {},
            resolved: { value: 'fromResolveData' },
          },
          slots: {},
        },
      ],
    };
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: planWithResolved, config: precedenceConfig },
    });
    // resolved wins over content, content wins over default
    expect(container.innerHTML).toContain('data-value="fromResolveData"');
  });

  it('wraps rendered nodes with the registered template', async () => {
    const tplConfig: Config = {
      components: {
        item: { component: PrecedenceFixture },
      },
      templates: {
        page: {
          defaults: { title: 'Default Title' },
          component: TemplateFixture,
        },
      },
    };
    const tplPayload: ExperiencePayload = {
      sys: {
        template: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Template',
            urn: 'crn:contentful:::experience:spaces/$self/environments/$self/templates/page',
          },
        },
      },
      viewports: VIEWPORTS,
      nodes: [componentNode('item', { id: 'i', contentProperties: { value: 'inside' } })],
    };
    const plan = await resolveExperience(tplPayload, tplConfig);
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: tplConfig },
    });
    expect(container.innerHTML).toContain('data-template="page"');
    expect(container.innerHTML).toContain('data-title="Default Title"');
    expect(container.innerHTML).toContain('inside');
  });

  it('renders nodes unwrapped + warns when the template is not registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg: Config = {
      components: { item: { component: PrecedenceFixture } },
      // No templates registered — the experience references one that's missing.
    };
    const tplPayload: ExperiencePayload = {
      sys: {
        template: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Template',
            urn: 'crn:contentful:::experience:spaces/$self/environments/$self/templates/missing-template',
          },
        },
      },
      viewports: VIEWPORTS,
      nodes: [componentNode('item', { id: 'i', contentProperties: { value: 'unwrapped' } })],
    };
    const plan = await resolveExperience(tplPayload, cfg);
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });
    expect(container.innerHTML).toContain('data-value="unwrapped"');
    expect(container.innerHTML).not.toContain('data-template');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing-template'));
    warn.mockRestore();
  });
});
