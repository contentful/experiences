import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ComponentTypeNode,
  ExperiencePayload,
  ManualDesignValue,
  ValuesByViewport,
} from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';
import type { Config } from './types.js';

import CapturingComponent from './test-fixtures/CapturingComponent.svelte';
import ButtonFixture from './test-fixtures/ButtonFixture.svelte';
import ContainerFixture from './test-fixtures/ContainerFixture.svelte';
import HeadingFixture from './test-fixtures/HeadingFixture.svelte';
import ItemFixture from './test-fixtures/ItemFixture.svelte';
import PrecedenceFixture from './test-fixtures/PrecedenceFixture.svelte';
import TemplateFixture from './test-fixtures/TemplateFixture.svelte';
import { captureSink } from './test-fixtures/capture-sink.js';
import { toCss } from './design-utils.js';

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

const dt = (value: string) => ({ type: 'DesignToken' as const, value });

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

beforeEach(() => {
  captureSink.splice(0);
});

const config: Config = {
  components: {
    'contentful-container': ContainerFixture,
    'contentful-heading': HeadingFixture,
    'contentful-button': ButtonFixture,
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
    const captureConfig: Config = { components: { capture: CapturingComponent } };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig
    );
    render(ServerExperienceRenderer, {
      props: { experience: plan, config: captureConfig },
    });

    expect(captureSink.length).toBe(1);
    const ctx = captureSink[0]!.experience;
    expect(ctx.activeViewportIndex).toBe(0);
    expect(ctx.activeViewport).toBe(VIEWPORTS[0]);
    expect(ctx.viewports).toBe(VIEWPORTS);
  });

  it('honors initialViewportId when computing the active viewport', async () => {
    const captureConfig: Config = { components: { capture: CapturingComponent } };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig
    );
    render(ServerExperienceRenderer, {
      props: {
        experience: plan,
        config: captureConfig,
        initialViewportId: 'mobile',
      },
    });

    const ctx = captureSink[0]!.experience;
    expect(ctx.activeViewportIndex).toBe(2);
    expect(ctx.activeViewport).toBe(VIEWPORTS[2]);
  });

  it('renders missing-component fallback in preview mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const justContainer: Config = {
      components: { 'contentful-container': ContainerFixture },
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

  it('respects merge precedence: defaults < content < resolved', () => {
    const precedenceConfig: Config = {
      components: {
        item: {
          defaults: { value: 'fromDefault' },
          component: PrecedenceFixture,
        },
      },
    };
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
    expect(container.innerHTML).toContain('data-value="fromResolveData"');
  });

  it('wraps rendered nodes with the registered template', async () => {
    const tplConfig: Config = {
      components: { item: PrecedenceFixture },
      templates: {
        page: { component: TemplateFixture, defaults: { title: 'Default Title' } },
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
    const cfg: Config = { components: { item: PrecedenceFixture } };
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

describe('ServerExperienceRenderer — bare-component registrations', () => {
  it('accepts a bare Svelte component as a registry entry', async () => {
    const cfg: Config = { components: { item: PrecedenceFixture } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [componentNode('item', { id: 'b', contentProperties: { value: 'hi' } })],
      },
      cfg
    );
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });
    expect(container.innerHTML).toContain('data-value="hi"');
  });

  it('does NOT spread experience/contentful as props onto components', async () => {
    const cfg: Config = { components: { capture: CapturingComponent } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('capture', {
            id: 'c',
            contentProperties: { text: 'hi' },
          }),
        ],
      },
      cfg
    );
    render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });
    const keys = Object.keys(captureSink[0]!.props);
    expect(keys).toContain('text');
    expect(keys).not.toContain('experience');
    expect(keys).not.toContain('contentful');
    // Children is always injected as a Snippet by the renderer.
    expect(keys).toContain('children');
  });
});

describe('ServerExperienceRenderer — getContentfulComponent()', () => {
  it('exposes the raw Contentful payload to descendants', async () => {
    const cfg: Config = { components: { capture: CapturingComponent } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('capture', {
            id: 'btn-1',
            contentProperties: { label: 'Buy now' },
            designProperties: { cfPadding: vbv({ desktop: m('40px') }) },
          }),
        ],
      },
      cfg
    );
    render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });

    const contentful = captureSink[0]!.contentful;
    expect(contentful).toMatchObject({
      componentTypeId: 'capture',
      nodeId: 'btn-1',
      content: { label: 'Buy now' },
      design: { cfPadding: vbv({ desktop: m('40px') }) },
      resolved: undefined,
    });
  });

  it('contentful.resolved carries the resolveData return value', async () => {
    const cfg: Config = {
      components: {
        capture: {
          resolveData: () => ({ enriched: 'yes' }),
          component: CapturingComponent,
        },
      },
    };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture', { id: 'i' })] },
      cfg
    );
    render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });

    expect(captureSink[0]!.contentful?.resolved).toEqual({ enriched: 'yes' });
  });
});

describe('ServerExperienceRenderer — resolveToken', () => {
  it('passes DesignToken envelopes through the resolver before render', async () => {
    const cfg: Config = {
      components: { 'contentful-button': ButtonFixture },
      resolveToken: (ref) => (ref.value === 'color/surface/hero' ? '#4f39f6' : undefined),
    };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('contentful-button', {
            id: 'b',
            contentProperties: { label: 'Go' },
            designProperties: { cfBackgroundColor: dt('color/surface/hero') },
          }),
        ],
      },
      cfg
    );
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });
    expect(container.innerHTML).toContain('data-bg="#4f39f6"');
    expect(container.innerHTML).not.toContain('DesignToken');
  });

  it('warns and drops the key from the design bag when the resolver returns undefined', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg: Config = {
      components: { 'contentful-button': CapturingComponent },
      resolveToken: () => undefined,
    };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('contentful-button', {
            id: 'b',
            contentProperties: { label: 'Go' },
            designProperties: { cfBackgroundColor: dt('color/unknown') },
          }),
        ],
      },
      cfg
    );
    render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });

    expect(captureSink[0]!.designValues).not.toHaveProperty('cfBackgroundColor');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('color/unknown'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('contentful-button'));
    warn.mockRestore();
  });

  it('leaves envelopes untouched when no resolver is supplied (backward-compatible)', async () => {
    const cfg: Config = { components: { 'contentful-button': ButtonFixture } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('contentful-button', {
            id: 'b',
            contentProperties: { label: 'Go' },
            designProperties: { cfBackgroundColor: dt('color/surface/hero') },
          }),
        ],
      },
      cfg
    );
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });
    // Svelte stringifies the envelope object into "[object Object]" on the
    // attribute — the point is that the raw envelope reaches the component
    // unchanged, so the customer can inspect it or resolve it themselves.
    expect(container.innerHTML).toContain('data-bg="[object Object]"');
  });

  it('runs on page-level template design props too', async () => {
    const tplConfig: Config = {
      components: { item: PrecedenceFixture },
      templates: { page: TemplateFixture },
      resolveToken: (ref) => (ref.value === 'brand/canvas' ? '#111827' : undefined),
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
      nodes: [componentNode('item', { id: 'i', contentProperties: { value: 'ok' } })],
    };
    const plan = await resolveExperience(tplPayload, tplConfig);
    // Templates don't carry design props in the current XDA payload shape;
    // seed one on the resolved plan so we exercise the template path.
    plan!.template!.props.design = { cfBackground: dt('brand/canvas') };
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: tplConfig },
    });
    expect(container.innerHTML).toContain('data-bg="#111827"');
  });
});

describe('ServerExperienceRenderer — design values are not injected as props', () => {
  it('does NOT spread resolved design values onto component props', async () => {
    const cfg: Config = { components: { capture: CapturingComponent } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('capture', {
            id: 'p',
            contentProperties: { label: 'keep me' },
            designProperties: { cfBackgroundColor: m('#f00'), cfPadding: m('10px') },
          }),
        ],
      },
      cfg
    );
    render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });
    const keys = Object.keys(captureSink[0]!.props);
    // Content still flows as a prop; design does not.
    expect(keys).toContain('label');
    expect(keys).not.toContain('cfBackgroundColor');
    expect(keys).not.toContain('cfPadding');
    // The values are still readable through getDesignValues().
    expect(captureSink[0]!.designValues).toEqual({
      cfBackgroundColor: '#f00',
      cfPadding: '10px',
    });
  });
});

describe('ServerExperienceRenderer — getDesignValues()', () => {
  it('returns the resolved design bag for the current node', async () => {
    const cfg: Config = {
      components: { capture: CapturingComponent },
      resolveToken: (ref) => (ref.value === 'brand/primary' ? '#4f39f6' : undefined),
    };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('capture', {
            id: 'p',
            designProperties: {
              cfBackgroundColor: dt('brand/primary'),
              cfPadding: m('24px'),
            },
          }),
        ],
      },
      cfg
    );
    render(ServerExperienceRenderer, { props: { experience: plan, config: cfg } });
    expect(captureSink[0]!.designValues).toEqual({
      cfBackgroundColor: '#4f39f6',
      cfPadding: '24px',
    });
  });

  it('honors the active viewport when reading design values', async () => {
    const cfg: Config = { components: { capture: CapturingComponent } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('capture', {
            id: 'p',
            designProperties: {
              cfPadding: vbv({ desktop: m('40px'), mobile: m('12px') }),
            },
          }),
        ],
      },
      cfg
    );
    render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg, initialViewportId: 'mobile' },
    });
    expect(captureSink[0]!.designValues).toEqual({ cfPadding: '12px' });
  });
});

describe('toCss (Svelte)', () => {
  it('converts bare (non-cf) CSS keys — the shape real payloads use', () => {
    expect(toCss({ fontSize: '20px', backgroundColor: '#4f39f6' })).toEqual({
      fontSize: '20px',
      backgroundColor: '#4f39f6',
    });
  });

  it('still handles cf-prefixed and kebab/snake CSS keys', () => {
    expect(toCss({ cfBackgroundColor: '#4f39f6', 'font-size': '10px', font_weight: 700 })).toEqual({
      backgroundColor: '#4f39f6',
      fontSize: '10px',
      fontWeight: 700,
    });
  });

  it('drops keys that are not known CSS properties (variant, as, ratio, target)', () => {
    expect(
      toCss({ backgroundColor: '#4f39f6', variant: 'h1', as: 'h2', ratio: '1:2', target: '_self' })
    ).toEqual({ backgroundColor: '#4f39f6' });
  });

  it('drops non-scalar (object/array/bool) values by design', () => {
    // toCss produces something spreadable into an inline style — booleans
    // and objects can't be inline-styled without opinionation, so they drop.
    expect(
      toCss({
        padding: '10px',
        reverse: true,
        nested: { color: 'red' } as unknown as string,
      })
    ).toEqual({ padding: '10px' });
  });

  it('respects include/exclude lists', () => {
    expect(
      toCss({ backgroundColor: '#4f39f6', padding: '10px' }, { include: ['backgroundColor'] })
    ).toEqual({ backgroundColor: '#4f39f6' });
    expect(
      toCss({ backgroundColor: '#4f39f6', padding: '10px' }, { exclude: ['padding'] })
    ).toEqual({ backgroundColor: '#4f39f6' });
  });
});
