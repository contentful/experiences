import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ComponentNode,
  ExperiencePayload,
  ExperienceTemplateNode,
  ManualDesignValue,
  PortableRenderPlan,
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
import ExperienceTemplateFixture from './test-fixtures/ExperienceTemplateFixture.svelte';
import WrappingContainerFixture from './test-fixtures/WrappingContainerFixture.svelte';
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
 * A coded Experience Template is an ordinary top-level node — the only
 * difference from `componentNode` is which registry its id resolves against.
 */
function experienceTemplateNode(
  typeId: string,
  rest: Omit<ExperienceTemplateNode, 'experienceTemplate'> = {}
): ExperienceTemplateNode {
  return {
    experienceTemplate: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:ExperienceTemplate',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/${typeId}`,
      },
    },
    ...rest,
  };
}

/**
 * `sys.experienceTemplate` rides along on every Experience — coded and
 * composite alike — so it must never influence rendering. Tests attach it to
 * prove it is ignored.
 */
function sysWithExperienceTemplate(typeId: string): ExperiencePayload['sys'] {
  return {
    experienceTemplate: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:ExperienceTemplate',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/${typeId}`,
      },
    },
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

  it('renders missing-component fallback in debug mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const justContainer: Config = {
      components: { 'contentful-container': ContainerFixture },
    };
    const planWithMissing: PortableRenderPlan = {
      viewports: VIEWPORTS,
      fallbackViewportIndex: 0,
      nodes: [
        {
          nodeId: 'root',
          registration: { kind: 'component', id: 'contentful-container' },
          props: { content: {}, design: {}, designRaw: {} },
          slots: {
            children: [
              {
                nodeId: 'ghost',
                registration: { kind: 'component', id: 'NotRegistered' },
                props: { content: {}, design: {}, designRaw: {} },
                slots: {},
              },
            ],
          },
        },
      ],
    };

    const { container: debugContainer } = render(ServerExperienceRenderer, {
      props: {
        experience: planWithMissing,
        config: justContainer,
        debug: true,
      },
    });
    expect(debugContainer.innerHTML).toContain('data-experiences-missing="NotRegistered"');

    const { container: prodContainer } = render(ServerExperienceRenderer, {
      props: { experience: planWithMissing, config: justContainer },
    });
    expect(prodContainer.innerHTML).not.toContain('data-experiences-missing');

    warn.mockRestore();
  });

  it('auto-mounts DebugExperience only when debug is on', async () => {
    const captureConfig: Config = { components: { capture: CapturingComponent } };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture', { id: 'c' })] },
      captureConfig
    );

    const { container: off } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: captureConfig },
    });
    expect(off.innerHTML).not.toContain('data-experiences-debug');

    const { container: on } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: captureConfig, debug: true },
    });
    expect(on.innerHTML).toContain('data-experiences-debug');
    expect(on.innerHTML).toContain('Experience debug');
  });

  it('threads top-level metadata into getExperience()', async () => {
    const captureConfig: Config = { components: { capture: CapturingComponent } };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture', { id: 'c' })] },
      captureConfig
    );
    render(ServerExperienceRenderer, {
      props: { experience: plan, config: captureConfig, metadata: { slug: 'home' } },
    });
    expect(captureSink[0]!.experience.metadata).toEqual({ slug: 'home' });
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

  it('treats an explicitly-empty content value as set (beats a non-empty default)', async () => {
    const itemConfig: Config = {
      components: {
        item: {
          defaults: { variant: 'fromDefault' },
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
            contentProperties: { variant: '' },
          }),
        ],
      },
      itemConfig
    );
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: itemConfig },
    });
    expect(container.innerHTML).toContain('data-variant=""');
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
    const planWithResolved: PortableRenderPlan = {
      viewports: VIEWPORTS,
      fallbackViewportIndex: 0,
      nodes: [
        {
          nodeId: 'r',
          registration: { kind: 'component', id: 'item' },
          props: {
            content: { value: 'fromContent' },
            design: {},
            designRaw: {},
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

  it('renders an experienceTemplate node from the experienceTemplates registry', async () => {
    const tplConfig: Config = {
      components: { item: PrecedenceFixture },
      experienceTemplates: {
        page: { component: ExperienceTemplateFixture, defaults: { title: 'Default Title' } },
      },
    };
    // The payload's `content` slot must arrive as a named `content` Snippet[]
    // prop — the fixture renders it, so the child only appears if that holds.
    const tplPayload: ExperiencePayload = {
      sys: sysWithExperienceTemplate('page'),
      viewports: VIEWPORTS,
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          slots: {
            content: [componentNode('item', { id: 'i', contentProperties: { value: 'inside' } })],
          },
        }),
      ],
    };
    const plan = await resolveExperience(tplPayload, tplConfig);
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: tplConfig },
    });
    expect(container.innerHTML).toContain('data-experience-template="page"');
    expect(container.innerHTML).toContain('data-title="Default Title"');
    expect(container.innerHTML).toContain('inside');
  });

  it('renders a composite experience unwrapped — sys.experienceTemplate is ignored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // `hero` is registered as a template, but the nodes are plain components,
    // so nothing may wrap them.
    const cfg: Config = {
      components: { item: PrecedenceFixture },
      experienceTemplates: { hero: ExperienceTemplateFixture },
    };
    const plan = await resolveExperience(
      {
        sys: sysWithExperienceTemplate('hero'),
        viewports: VIEWPORTS,
        nodes: [
          componentNode('item', { id: 'a', contentProperties: { value: 'one' } }),
          componentNode('item', { id: 'b', contentProperties: { value: 'two' } }),
        ],
      },
      cfg
    );
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });
    expect(container.innerHTML).toContain('data-value="one"');
    expect(container.innerHTML).toContain('data-value="two"');
    expect(container.innerHTML).not.toContain('data-experience-template');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders slot children unwrapped + warns when the experienceTemplate is not registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg: Config = { components: { item: PrecedenceFixture } };
    const tplPayload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        experienceTemplateNode('missing-experienceTemplate', {
          id: 'tpl',
          slots: {
            content: [
              componentNode('item', { id: 'i', contentProperties: { value: 'unwrapped' } }),
            ],
          },
        }),
      ],
    };
    const plan = await resolveExperience(tplPayload, cfg);
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg, debug: true },
    });
    // The subtree survives — an unregistered template must not blank the page.
    expect(container.innerHTML).toContain('data-value="unwrapped"');
    expect(container.innerHTML).not.toContain('data-experience-template');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing-experienceTemplate'));
    expect(container.innerHTML).toContain('data-experiences-debug-errors');
    expect(container.innerHTML).toContain(
      'No experience template registered for id "missing-experienceTemplate"'
    );
    warn.mockRestore();
  });
});

describe('ServerExperienceRenderer — slot children as an array', () => {
  const childrenPayload = (): ExperiencePayload => ({
    viewports: VIEWPORTS,
    nodes: [
      componentNode('contentful-container', {
        id: 'c',
        slots: {
          children: [
            componentNode('contentful-heading', {
              id: 'a',
              contentProperties: { text: 'one' },
            }),
            componentNode('contentful-heading', {
              id: 'b',
              contentProperties: { text: 'two' },
            }),
            componentNode('contentful-heading', {
              id: 'd',
              contentProperties: { text: 'three' },
            }),
          ],
        },
      }),
    ],
  });

  it('passes slot children as a Snippet[] a component can wrap individually', async () => {
    const cfg: Config = {
      components: {
        'contentful-container': WrappingContainerFixture,
        'contentful-heading': HeadingFixture,
      },
    };
    const plan = await resolveExperience(childrenPayload(), cfg);
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });

    // The component received a real array of the right length.
    expect(captureSink[0]!.props.childrenIsArray).toBe(true);
    expect(captureSink[0]!.props.childCount).toBe(3);

    // Each child got its own wrapper — proves per-child rendering control.
    const wrappers = container.querySelectorAll('.wrap');
    expect(wrappers.length).toBe(3);
    expect(container.querySelector('[data-index="0"]')).not.toBeNull();
    expect(container.querySelector('[data-index="2"]')).not.toBeNull();
    expect(container.textContent).toContain('one');
    expect(container.textContent).toContain('three');
  });

  it('renders an empty container when the slot has no children', async () => {
    const cfg: Config = {
      components: { 'contentful-container': WrappingContainerFixture },
    };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('contentful-container', { id: 'c' })] },
      cfg
    );
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });
    expect(captureSink[0]!.props.childCount).toBe(0);
    expect(container.querySelectorAll('.wrap').length).toBe(0);
    expect(container.querySelector('[data-container]')).not.toBeNull();
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
    // Slot props exist only for slots the payload actually carries — `children`
    // is just a slot name, so a node without slots gets no `children` prop.
    expect(keys).not.toContain('children');
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
      componentId: 'capture',
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
  it('passes DesignToken values through the resolver before render', async () => {
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

  it('warns and passes the raw token through the design values when the resolver returns undefined', async () => {
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

    expect(captureSink[0]!.designValues.cfBackgroundColor).toEqual(dt('color/unknown'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('color/unknown'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('contentful-button'));
    warn.mockRestore();
  });

  it('leaves token values untouched when no resolver is supplied (backward-compatible)', async () => {
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
    // Svelte stringifies the token object into "[object Object]" on the
    // attribute — the point is that the raw token value reaches the component
    // unchanged, so the customer can inspect it or resolve it themselves.
    expect(container.innerHTML).toContain('data-bg="[object Object]"');
  });

  it('runs on an experienceTemplate node design props too', async () => {
    const tplConfig: Config = {
      components: { item: PrecedenceFixture },
      experienceTemplates: { page: ExperienceTemplateFixture },
      resolveToken: (ref) => (ref.value === 'brand/canvas' ? '#111827' : undefined),
    };
    const tplPayload: ExperiencePayload = {
      sys: sysWithExperienceTemplate('page'),
      viewports: VIEWPORTS,
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          designProperties: { cfBackground: dt('brand/canvas') },
          slots: {
            content: [componentNode('item', { id: 'i', contentProperties: { value: 'ok' } })],
          },
        }),
      ],
    };
    const plan = await resolveExperience(tplPayload, tplConfig);
    // Render at a non-fallback viewport (mobile ≠ fallback index 0) so the
    // adapter recomputes from the raw design and runs resolveToken itself.
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config: tplConfig, initialViewportId: 'mobile' },
    });
    expect(container.innerHTML).toContain('data-bg="#111827"');
  });
});

describe('ServerExperienceRenderer — design values auto-fill props', () => {
  it('spreads resolved design values onto component props by their raw key', async () => {
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
    // Content flows as a prop, and design auto-fills props under its raw key.
    expect(captureSink[0]!.props).toMatchObject({
      label: 'keep me',
      cfBackgroundColor: '#f00',
      cfPadding: '10px',
    });
    // The values are still readable through getDesignValues().
    expect(captureSink[0]!.designValues).toEqual({
      cfBackgroundColor: '#f00',
      cfPadding: '10px',
    });
  });

  it('lets content override design on a key collision (content wins)', async () => {
    const cfg: Config = { components: { capture: CapturingComponent } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('capture', {
            id: 'p',
            // Same key in both channels: content must win.
            contentProperties: { cfPadding: 'from-content' },
            designProperties: { cfPadding: m('from-design') },
          }),
        ],
      },
      cfg
    );
    render(ServerExperienceRenderer, {
      props: { experience: plan, config: cfg },
    });
    expect(captureSink[0]!.props).toMatchObject({ cfPadding: 'from-content' });
  });
});

describe('ServerExperienceRenderer — getDesignValues()', () => {
  it('returns the resolved design values for the current node', async () => {
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

describe('ServerExperienceRenderer — server pre-resolved design values', () => {
  const probePayload: ExperiencePayload = {
    viewports: VIEWPORTS,
    nodes: [
      componentNode('contentful-container', {
        id: 'p',
        designProperties: { cfPadding: vbv({ desktop: m('40px'), mobile: m('12px') }) },
      }),
    ],
  };

  it('consumes props.design as-is when the active viewport equals the fallback', async () => {
    const plan = await resolveExperience(probePayload, config, { initialViewportId: 'mobile' });
    // Tamper the precomputed values with a sentinel the cascade could never produce.
    plan.nodes[0]!.props.design = { cfPadding: 'SENTINEL' };
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config, initialViewportId: 'mobile' },
    });
    expect(container.innerHTML).toContain('data-padding="SENTINEL"');
  });

  it('recomputes from raw design properties when the active viewport differs from the fallback', async () => {
    const plan = await resolveExperience(probePayload, config, { initialViewportId: 'mobile' });
    plan.nodes[0]!.props.design = { cfPadding: 'SENTINEL' };
    // Active viewport (desktop, idx 0) ≠ fallback (mobile, idx 2) → recompute.
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config, initialViewportId: 'desktop' },
    });
    expect(container.innerHTML).toContain('data-padding="40px"');
    expect(container.innerHTML).not.toContain('SENTINEL');
  });

  it('recomputes when the active viewport differs from the default fallback (viewport[0])', async () => {
    const plan = await resolveExperience(probePayload, config);
    // No fallback configured → pre-resolved against viewport[0] (desktop, idx 0).
    expect(plan.fallbackViewportIndex).toBe(0);
    // Active viewport is mobile (idx 2) ≠ fallback (idx 0) → recompute to 12px.
    const { container } = render(ServerExperienceRenderer, {
      props: { experience: plan, config, initialViewportId: 'mobile' },
    });
    expect(container.innerHTML).toContain('data-padding="12px"');
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
