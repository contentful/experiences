import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  ComponentTypeNode,
  ExperiencePayload,
  ManualDesignValue,
  ValuesByViewport,
} from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import { useContentfulComponent, useContentfulTemplate, useExperience } from './context';
import { toCss } from './design-utils';
import { ServerExperienceRenderer } from './server-renderer';
import type { Config } from './types';
import { useDesignValues } from './use-design-values';

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

// Fixtures read their design through useDesignValues() — the SDK never
// injects design as props — and apply it however they like.
const Container = ({ children }: { children?: ReactNode }) => {
  const design = useDesignValues();
  return <div data-padding={design.cfPadding as string}>{children}</div>;
};

const Heading = ({ text }: { text?: string }) => {
  const design = useDesignValues();
  return <h1 style={{ fontSize: design.cfFontSize as string }}>{text}</h1>;
};

const SimpleButton = ({ label }: { label?: string }) => {
  const design = useDesignValues();
  return (
    <button type="button" style={{ background: design.cfBackgroundColor as string }}>
      {label}
    </button>
  );
};

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
    // The render context gets its own copies of viewports / activeViewport
    // (value-equal, not the same reference) so it shares no object identity
    // with the plan arrays — otherwise React's RSC serializer can back-patch a
    // shared reference into frozen props and throw.
    expect(seen!.activeViewport).toStrictEqual(VIEWPORTS[0]);
    expect(seen!.activeViewport).not.toBe(VIEWPORTS[0]);
    expect(seen!.viewports).toStrictEqual(VIEWPORTS);
    expect(seen!.viewports).not.toBe(VIEWPORTS);
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
    expect(seen!.activeViewport).toStrictEqual(VIEWPORTS[2]);
    expect(seen!.activeViewport).not.toBe(VIEWPORTS[2]);
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

  it('respects merge precedence: defaults < content < resolved < slots', () => {
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
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
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
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
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

describe('ServerExperienceRenderer — resolveToken', () => {
  // Reads its background through useDesignValues() — the resolved value the
  // renderer publishes on context, not an injected prop.
  const Button = ({ label }: { label?: string }) => {
    const design = useDesignValues();
    return (
      <button type="button" data-bg={design.cfBackgroundColor as string}>
        {label}
      </button>
    );
  };

  it('passes DesignToken envelopes through the resolver before render', async () => {
    const cfg: Config = {
      components: { button: Button },
      resolveToken: (ref) => (ref.value === 'color/surface/hero' ? '#4f39f6' : undefined),
    };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('button', {
            id: 'b',
            contentProperties: { label: 'Go' },
            designProperties: { cfBackgroundColor: dt('color/surface/hero') },
          }),
        ],
      },
      cfg
    );
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toContain('data-bg="#4f39f6"');
    expect(html).not.toContain('DesignToken');
  });

  it('warns and drops the key from the design bag when the resolver returns undefined', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let captured: Record<string, unknown> = {};
    const Probe = () => {
      captured = useDesignValues();
      return null;
    };
    const cfg: Config = {
      components: { button: Probe },
      resolveToken: () => undefined,
    };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('button', {
            id: 'b',
            contentProperties: { label: 'Go' },
            designProperties: { cfBackgroundColor: dt('color/unknown') },
          }),
        ],
      },
      cfg
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

    expect(captured).not.toHaveProperty('cfBackgroundColor');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('color/unknown'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('button'));
    warn.mockRestore();
  });

  it('leaves envelopes untouched when no resolver is supplied (backward-compatible)', async () => {
    const cfg: Config = { components: { button: Button } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('button', {
            id: 'b',
            contentProperties: { label: 'Go' },
            designProperties: { cfBackgroundColor: dt('color/surface/hero') },
          }),
        ],
      },
      cfg
    );
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    // React stringifies the object envelope into "[object Object]" — the key
    // point is that the raw envelope reaches the component, unchanged.
    expect(html).toContain('data-bg="[object Object]"');
  });

  it('runs on page-level template design props too', async () => {
    const Tpl = ({ children }: { children?: ReactNode }) => {
      const design = useDesignValues();
      return <main data-bg={design.cfBackground as string}>{children}</main>;
    };
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const cfg: Config = {
      components: { item: Item },
      templates: { page: Tpl },
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
    const plan = await resolveExperience(tplPayload, cfg);
    // Templates don't carry design props in the current XDA payload shape;
    // seed one on the resolved plan so we exercise the template path.
    plan!.template!.props.design = { cfBackground: dt('brand/canvas') };
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toContain('data-bg="#111827"');
  });
});

describe('ServerExperienceRenderer — design values are not injected as props', () => {
  it('does NOT spread resolved design values onto component props', async () => {
    let received: Record<string, unknown> = {};
    const Probe = (props: Record<string, unknown>) => {
      received = props;
      return null;
    };
    const cfg: Config = { components: { probe: Probe } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('probe', {
            id: 'p',
            contentProperties: { label: 'keep me' },
            designProperties: { cfBackgroundColor: m('#f00'), cfPadding: m('10px') },
          }),
        ],
      },
      cfg
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    // Content still flows as a prop; design does not.
    expect(received).toHaveProperty('label', 'keep me');
    expect(received).not.toHaveProperty('cfBackgroundColor');
    expect(received).not.toHaveProperty('cfPadding');
  });

  it('does NOT spread resolved design values onto template props', async () => {
    let received: Record<string, unknown> = {};
    const Tpl = (props: Record<string, unknown>) => {
      received = props;
      return <main>{props.children as ReactNode}</main>;
    };
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const cfg: Config = {
      components: { item: Item },
      templates: { page: Tpl },
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
    plan!.template!.props.design = { cfBackground: m('#111827') };
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(received).not.toHaveProperty('cfBackground');
  });
});

describe('ServerExperienceRenderer — useDesignValues()', () => {
  it('returns the resolved design bag for the current node', async () => {
    let captured: Record<string, unknown> = {};
    const Probe = () => {
      captured = useDesignValues();
      return null;
    };
    const cfg: Config = {
      components: { probe: Probe },
      resolveToken: (ref) => (ref.value === 'brand/primary' ? '#4f39f6' : undefined),
    };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('probe', {
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
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(captured).toEqual({ cfBackgroundColor: '#4f39f6', cfPadding: '24px' });
  });

  it('accepts a type argument that types the returned bag (useState-style)', async () => {
    interface MyDesign {
      cfBackgroundColor?: string;
      cfPadding?: string;
    }
    let typed: MyDesign = {};
    const Probe = () => {
      const design = useDesignValues<MyDesign>();
      // Compile-time: keys are typed off MyDesign, not `unknown`.
      typed = { cfBackgroundColor: design.cfBackgroundColor, cfPadding: design.cfPadding };
      return null;
    };
    const cfg: Config = { components: { probe: Probe } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [componentNode('probe', { id: 'p', designProperties: { cfPadding: m('24px') } })],
      },
      cfg
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(typed).toEqual({ cfBackgroundColor: undefined, cfPadding: '24px' });
  });

  it('honors the active viewport when called deep inside a node subtree', async () => {
    let captured: Record<string, unknown> = {};
    const Probe = () => {
      captured = useDesignValues();
      return null;
    };
    const cfg: Config = { components: { probe: Probe } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('probe', {
            id: 'p',
            designProperties: {
              cfPadding: vbv({ desktop: m('40px'), mobile: m('12px') }),
            },
          }),
        ],
      },
      cfg
    );
    renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={cfg} initialViewportId="mobile" />
    );
    expect(captured).toEqual({ cfPadding: '12px' });
  });

  it('returns {} when there is no design in scope', async () => {
    // Put the probe in a template that carries no design and wraps a node
    // with no design either, so the hook has nothing to resolve.
    let captured: Record<string, unknown> | null = null;
    const Probe = ({ children }: { children?: ReactNode }) => {
      captured = useDesignValues();
      return <>{children}</>;
    };
    const Item = () => null;
    const cfg: Config = {
      components: { item: Item },
      templates: { page: Probe },
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
      nodes: [componentNode('item', { id: 'i' })],
    };
    const plan = await resolveExperience(tplPayload, cfg);
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(captured).toEqual({});
  });

  it('returns {} when called outside any renderer subtree', () => {
    let captured: Record<string, unknown> | null = null;
    const Probe = () => {
      captured = useDesignValues();
      return null;
    };
    renderToStaticMarkup(<Probe />);
    expect(captured).toEqual({});
  });
});

describe('toCss', () => {
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

  it('drops null and undefined values', () => {
    expect(toCss({ padding: null, margin: undefined, color: '#111' })).toEqual({
      color: '#111',
    });
  });

  it('respects an exclude list even for valid CSS keys', () => {
    expect(
      toCss({ backgroundColor: '#4f39f6', padding: '10px' }, { exclude: ['padding'] })
    ).toEqual({ backgroundColor: '#4f39f6' });
  });

  it('respects an include list (still whitelist-filtered)', () => {
    expect(
      toCss(
        { backgroundColor: '#4f39f6', padding: '10px', variant: 'h1' },
        { include: ['backgroundColor', 'variant'] }
      )
    ).toEqual({ backgroundColor: '#4f39f6' });
  });
});
