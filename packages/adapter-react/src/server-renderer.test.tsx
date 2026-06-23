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
  rest: Omit<ComponentTypeNode, 'componentType'> = {},
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
    'contentful-container': {
      render: (props) => {
        const { children, cfPadding } = props as { children?: ReactNode; cfPadding?: string };
        return <div data-padding={cfPadding}>{children}</div>;
      },
    },
    'contentful-heading': {
      render: (props) => {
        const { text, cfFontSize } = props as { text?: string; cfFontSize?: string };
        return <h1 style={{ fontSize: cfFontSize }}>{text}</h1>;
      },
    },
    'contentful-button': {
      render: (props) => {
        const { label, cfBackgroundColor } = props as { label?: string; cfBackgroundColor?: string };
        return (
          <button type="button" style={{ background: cfBackgroundColor }}>
            {label}
          </button>
        );
      },
    },
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
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} />);

    expect(html).toContain('data-padding="40px"');
    expect(html).toContain('font-size:32px');
    expect(html).toContain('background:#4f39f6');
    expect(html).toContain('Build faster');
    expect(html).toContain('Get started');
  });

  it('honors initialViewportId when resolving design props', async () => {
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} initialViewportId="mobile" />,
    );

    expect(html).toContain('data-padding="12px"');
    expect(html).toContain('font-size:20px');
    expect(html).toContain('background:#00aa00');
  });

  it('cascades design values when the active viewport has none', async () => {
    // tablet has no cfFontSize defined → cascades to desktop
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} initialViewportId="tablet" />,
    );

    expect(html).toContain('font-size:32px'); // cascaded from desktop
    expect(html).toContain('background:#ff0000'); // tablet-specific
  });

  it('renders null when plan is null/undefined', () => {
    expect(renderToStaticMarkup(<ServerExperienceRenderer experience={null} config={config} />)).toBe('');
    expect(renderToStaticMarkup(<ServerExperienceRenderer experience={undefined} config={config} />)).toBe('');
  });

  it('injects experience context with isPreview false by default', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const captureConfig: Config = {
      components: {
        capture: {
          render: ({ experience }) => {
            seen.push(experience as Record<string, unknown>);
            return null;
          },
        },
      },
    };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig,
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
    const captureConfig: Config = {
      components: {
        capture: {
          render: ({ experience }) => {
            seen = experience as unknown as Record<string, unknown>;
            return null;
          },
        },
      },
    };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig,
    );
    renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={captureConfig} />,
    );

    expect(seen).not.toBeNull();
    expect(seen!.activeViewportIndex).toBe(0);
    expect(seen!.activeViewport).toBe(VIEWPORTS[0]);
    expect(seen!.viewports).toBe(VIEWPORTS);
  });

  it('honors initialViewportId when computing the active viewport', async () => {
    let seen: Record<string, unknown> | null = null;
    const captureConfig: Config = {
      components: {
        capture: {
          render: ({ experience }) => {
            seen = experience as unknown as Record<string, unknown>;
            return null;
          },
        },
      },
    };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig,
    );
    renderToStaticMarkup(
      <ServerExperienceRenderer
        experience={plan}
        config={captureConfig}
        initialViewportId="mobile"
      />,
    );

    expect(seen!.activeViewportIndex).toBe(2);
    expect(seen!.activeViewport).toBe(VIEWPORTS[2]);
  });

  it('renders missing-component fallback in preview mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const justContainer: Config = {
      components: {
        'contentful-container': {
          render: ({ children }) => <div>{children as ReactNode}</div>,
        },
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
      />,
    );
    expect(previewHtml).toContain('data-experiences-missing="NotRegistered"');

    const productionHtml = renderToStaticMarkup(
      <ServerExperienceRenderer experience={planWithMissing} config={justContainer} />,
    );
    expect(productionHtml).not.toContain('data-experiences-missing');
    expect(productionHtml).toBe('<div></div>');

    warn.mockRestore();
  });

  it('merges defaults beneath content (content wins)', async () => {
    const config: Config = {
      components: {
        item: {
          defaults: { variant: 'fallback', priority: 'low' },
          render: (props) => {
            const { variant, priority } = props as {
              variant: string;
              priority: string;
            };
            return (
              <span data-variant={variant} data-priority={priority} />
            );
          },
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
      config,
    );
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} />,
    );
    expect(html).toContain('data-variant="fromContent"');
    expect(html).toContain('data-priority="low"');
  });

  it('respects merge precedence: defaults < content < design < resolved < slots < experience', () => {
    const config: Config = {
      components: {
        item: {
          defaults: { value: 'fromDefault' },
          render: (props) => {
            const { value } = props as { value: string };
            return <span data-value={value} />;
          },
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
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={planWithResolved} config={config} />,
    );
    // resolved wins over content, content wins over default
    expect(html).toContain('data-value="fromResolveData"');
  });

  it('wraps rendered nodes with the registered template', async () => {
    const config: Config = {
      components: {
        item: {
          render: ({ value }) => <span>{value as string}</span>,
        },
      },
      templates: {
        page: {
          defaults: { title: 'Default Title' },
          render: ({ title, children }) => (
            <main data-template="page" data-title={title as string}>
              {children}
            </main>
          ),
        },
      },
    };
    const payload: ExperiencePayload = {
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
      nodes: [
        componentNode('item', { id: 'i', contentProperties: { value: 'inside' } }),
      ],
    };
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} />,
    );
    expect(html).toContain('data-template="page"');
    expect(html).toContain('data-title="Default Title"');
    expect(html).toContain('<span>inside</span>');
  });

  it('renders nodes unwrapped + warns when the template is not registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config: Config = {
      components: {
        item: { render: ({ value }) => <span>{value as string}</span> },
      },
      // No templates registered — the experience references one that's missing.
    };
    const payload: ExperiencePayload = {
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
      nodes: [
        componentNode('item', { id: 'i', contentProperties: { value: 'unwrapped' } }),
      ],
    };
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} />,
    );
    expect(html).toBe('<span>unwrapped</span>');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing-template'));
    warn.mockRestore();
  });
});
