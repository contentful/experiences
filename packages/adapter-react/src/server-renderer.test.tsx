import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  ComponentTypeNode,
  ExperiencePayload,
  ManualDesignValue,
  ValuesByViewport,
} from '@contentful/experiences-core';
import { resolveExperience } from '@contentful/experiences-core';

import { useContentfulComponent, useContentfulTemplate, useExperience } from './context';
import { ServerExperienceRenderer } from './server-renderer';
import type { Config } from './types';

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

const Container = ({ children, cfPadding }: { children?: ReactNode; cfPadding?: string }) => (
  <div data-padding={cfPadding}>{children}</div>
);

const Heading = ({ text, cfFontSize }: { text?: string; cfFontSize?: string }) => (
  <h1 style={{ fontSize: cfFontSize }}>{text}</h1>
);

const SimpleButton = ({ label, cfBackgroundColor }: { label?: string; cfBackgroundColor?: string }) => (
  <button type="button" style={{ background: cfBackgroundColor }}>
    {label}
  </button>
);

const config: Config = {
  components: {
    'contentful-container': Container,
    'contentful-heading': Heading,
    'contentful-button': SimpleButton,
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
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} />
    );

    expect(html).toContain('data-padding="40px"');
    expect(html).toContain('font-size:32px');
    expect(html).toContain('background:#4f39f6');
    expect(html).toContain('Build faster');
    expect(html).toContain('Get started');
  });

  it('honors initialViewportId when resolving design props', async () => {
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} initialViewportId="mobile" />
    );

    expect(html).toContain('data-padding="12px"');
    expect(html).toContain('font-size:20px');
    expect(html).toContain('background:#00aa00');
  });

  it('cascades design values when the active viewport has none', async () => {
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} initialViewportId="tablet" />
    );

    expect(html).toContain('font-size:32px'); // cascaded from desktop
    expect(html).toContain('background:#ff0000'); // tablet-specific
  });

  it('renders null when plan is null/undefined', () => {
    expect(
      renderToStaticMarkup(<ServerExperienceRenderer experience={null} config={config} />)
    ).toBe('');
    expect(
      renderToStaticMarkup(<ServerExperienceRenderer experience={undefined} config={config} />)
    ).toBe('');
  });

  it('exposes experience context via useExperience() with isPreview false by default', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const Capture = () => {
      seen.push(useExperience() as unknown as Record<string, unknown>);
      return null;
    };
    const captureConfig: Config = { components: { capture: Capture } };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={captureConfig} />);

    expect(seen).toEqual([
      {
        isPreview: false,
        metadata: {},
        viewports: VIEWPORTS,
        activeViewport: VIEWPORTS[0],
        activeViewportIndex: 0,
      },
    ]);
  });

  it('exposes the active viewport on render context (defaults to viewport[0])', async () => {
    let seen: Record<string, unknown> | null = null;
    const Capture = () => {
      seen = useExperience() as unknown as Record<string, unknown>;
      return null;
    };
    const captureConfig: Config = { components: { capture: Capture } };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={captureConfig} />);

    expect(seen).not.toBeNull();
    expect(seen!.activeViewportIndex).toBe(0);
    expect(seen!.activeViewport).toBe(VIEWPORTS[0]);
    expect(seen!.viewports).toBe(VIEWPORTS);
  });

  it('honors initialViewportId when computing the active viewport', async () => {
    let seen: Record<string, unknown> | null = null;
    const Capture = () => {
      seen = useExperience() as unknown as Record<string, unknown>;
      return null;
    };
    const captureConfig: Config = { components: { capture: Capture } };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig
    );
    renderToStaticMarkup(
      <ServerExperienceRenderer
        experience={plan}
        config={captureConfig}
        initialViewportId="mobile"
      />
    );

    expect(seen!.activeViewportIndex).toBe(2);
    expect(seen!.activeViewport).toBe(VIEWPORTS[2]);
  });

  it('renders missing-component fallback in preview mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const justContainer: Config = {
      components: {
        'contentful-container': ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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

    const previewHtml = renderToStaticMarkup(
      <ServerExperienceRenderer
        experience={planWithMissing}
        config={justContainer}
        context={{ isPreview: true }}
      />
    );
    expect(previewHtml).toContain('data-experiences-missing="NotRegistered"');

    const productionHtml = renderToStaticMarkup(
      <ServerExperienceRenderer experience={planWithMissing} config={justContainer} />
    );
    expect(productionHtml).not.toContain('data-experiences-missing');
    expect(productionHtml).toBe('<div></div>');

    warn.mockRestore();
  });

  it('merges defaults beneath content (content wins)', async () => {
    const Item = ({ variant, priority }: { variant: string; priority: string }) => (
      <span data-variant={variant} data-priority={priority} />
    );
    const itemConfig: Config = {
      components: {
        item: { component: Item, defaults: { variant: 'fallback', priority: 'low' } },
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
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={itemConfig} />
    );
    expect(html).toContain('data-variant="fromContent"');
    expect(html).toContain('data-priority="low"');
  });

  it('respects merge precedence: defaults < content < design < resolved < slots', () => {
    const Item = ({ value }: { value: string }) => <span data-value={value} />;
    const cfg: Config = {
      components: {
        item: { component: Item, defaults: { value: 'fromDefault' } },
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
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={planWithResolved} config={cfg} />
    );
    expect(html).toContain('data-value="fromResolveData"');
  });

  it('wraps rendered nodes with the registered template', async () => {
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const Template = ({ title, children }: { title?: string; children?: ReactNode }) => (
      <main data-template="page" data-title={title}>
        {children}
      </main>
    );
    const cfg: Config = {
      components: { item: Item },
      templates: { page: { component: Template, defaults: { title: 'Default Title' } } },
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
    const plan = await resolveExperience(tplPayload, cfg);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={cfg} />
    );
    expect(html).toContain('data-template="page"');
    expect(html).toContain('data-title="Default Title"');
    expect(html).toContain('<span>inside</span>');
  });

  it('renders nodes unwrapped + warns when the template is not registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const cfg: Config = { components: { item: Item } };
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
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={cfg} />
    );
    expect(html).toBe('<span>unwrapped</span>');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing-template'));
    warn.mockRestore();
  });
});

describe('ServerExperienceRenderer — bare-component registrations', () => {
  it('accepts a bare function component as a registry entry', async () => {
    const Bare = ({ text }: { text?: string }) => <p data-from="bare">{text}</p>;
    const cfg: Config = { components: { bare: Bare } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [componentNode('bare', { id: 'b', contentProperties: { text: 'hi' } })],
      },
      cfg
    );
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toBe('<p data-from="bare">hi</p>');
  });

  it('accepts a bare component for a template', async () => {
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const Tpl = ({ children }: { children?: ReactNode }) => <main data-tpl>{children}</main>;
    const cfg: Config = { components: { item: Item }, templates: { page: Tpl } };
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
    const plan = await resolveExperience(tplPayload, cfg);
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toContain('data-tpl');
    expect(html).toContain('<span>inside</span>');
  });

  it('does NOT spread experience/contentful as props onto bare components', async () => {
    let receivedKeys: string[] = [];
    const Probe = (props: Record<string, unknown>) => {
      receivedKeys = Object.keys(props);
      return null;
    };
    const cfg: Config = { components: { probe: Probe } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [componentNode('probe', { id: 'p', contentProperties: { text: 'hi' } })],
      },
      cfg
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(receivedKeys).toContain('text');
    expect(receivedKeys).not.toContain('experience');
    expect(receivedKeys).not.toContain('contentful');
  });
});

describe('ServerExperienceRenderer — useContentfulComponent / useContentfulTemplate', () => {
  it('exposes the raw Contentful payload via useContentfulComponent()', async () => {
    let captured: Record<string, unknown> | null = null;
    const Capture = () => {
      captured = useContentfulComponent() as unknown as Record<string, unknown>;
      return null;
    };
    const cfg: Config = { components: { button: Capture } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('button', {
            id: 'btn-1',
            contentProperties: { label: 'Buy now' },
            designProperties: { cfPadding: vbv({ desktop: m('40px') }) },
          }),
        ],
      },
      cfg
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

    expect(captured).toEqual({
      componentTypeId: 'button',
      nodeId: 'btn-1',
      content: { label: 'Buy now' },
      design: { cfPadding: vbv({ desktop: m('40px') }) }, // raw envelope, NOT scalar
      resolved: undefined,
    });
  });

  it('contentful.resolved carries the resolveData return value', async () => {
    let captured: Record<string, unknown> | null = null;
    const Capture = () => {
      captured = useContentfulComponent() as unknown as Record<string, unknown>;
      return null;
    };
    const cfg: Config = {
      components: {
        item: { component: Capture, resolveData: () => ({ enriched: 'yes' }) },
      },
    };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('item', { id: 'i' })] },
      cfg
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

    expect((captured as Record<string, unknown>).resolved).toEqual({ enriched: 'yes' });
  });

  it('exposes templateId/content/design/resolved via useContentfulTemplate()', async () => {
    let captured: Record<string, unknown> | null = null;
    const CaptureTpl = ({ children }: { children?: ReactNode }) => {
      captured = useContentfulTemplate() as unknown as Record<string, unknown>;
      return <main>{children}</main>;
    };
    const Item = () => null;
    const cfg: Config = {
      components: { item: Item },
      templates: { page: { component: CaptureTpl, defaults: { title: 'Default' } } },
    };
    const plan = await resolveExperience(
      {
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
        nodes: [componentNode('item', { id: 'i' })],
      },
      cfg
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

    expect(captured).toEqual({
      templateId: 'page',
      content: {},
      design: {},
      resolved: undefined,
    });
  });
});
