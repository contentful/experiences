import { readFileSync } from 'node:fs';

import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  ComponentNode,
  ExperiencePayload,
  ExperienceTemplateNode,
  ManualDesignValue,
  PortableRenderNode,
  ValuesByViewport,
} from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import { useContentfulComponent, useContentfulExperienceTemplate, useExperience } from './context';
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

/** The single top-level Experience Template node in a coded plan. */
function templateNodeOf(plan: { nodes: PortableRenderNode[] }): PortableRenderNode {
  const found = plan.nodes.find((n) => n.registration.kind === 'experienceTemplate');
  if (!found) throw new Error('expected an experienceTemplate node in the plan');
  return found;
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

  it('exposes experience context via useExperience() with debug false by default', async () => {
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
        debug: false,
        metadata: {},
        viewports: VIEWPORTS,
        activeViewport: VIEWPORTS[0],
        activeViewportIndex: 0,
        fallbackViewportIndex: 0,
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

  it('renders missing-component fallback in debug mode', () => {
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

    const debugHtml = renderToStaticMarkup(
      <ServerExperienceRenderer
        experience={{ ...planWithMissing, debug: true }}
        config={justContainer}
      />
    );
    expect(debugHtml).toContain('data-experiences-missing="NotRegistered"');

    const productionHtml = renderToStaticMarkup(
      <ServerExperienceRenderer experience={planWithMissing} config={justContainer} />
    );
    expect(productionHtml).not.toContain('data-experiences-missing');
    expect(productionHtml).toBe('<div></div>');

    warn.mockRestore();
  });

  it('auto-mounts DebugExperience only when debug is on', async () => {
    const captureConfig: Config = { components: { capture: () => null } };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig
    );

    const off = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={captureConfig} />
    );
    expect(off).not.toContain('data-experiences-debug');

    const on = renderToStaticMarkup(
      <ServerExperienceRenderer experience={{ ...plan, debug: true }} config={captureConfig} />
    );
    expect(on).toContain('data-experiences-debug');
    expect(on).toContain('Experience debug');
  });

  it('threads top-level metadata into useExperience()', async () => {
    let seen: Record<string, unknown> | null = null;
    const Capture = () => {
      seen = useExperience() as unknown as Record<string, unknown>;
      return null;
    };
    const captureConfig: Config = { components: { capture: Capture } };
    const plan = await resolveExperience(
      { viewports: VIEWPORTS, nodes: [componentNode('capture')] },
      captureConfig,
      { metadata: { slug: 'home', locale: 'en-US' } }
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={captureConfig} />);
    expect(seen!.metadata).toEqual({ slug: 'home', locale: 'en-US' });
  });

  it("declares MissingComponent as a client component ('use client')", () => {
    const source = readFileSync(new URL('./missing-component.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/^\s*['"]use client['"];/m);
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

  it('treats an explicitly-empty content value as set (beats a non-empty default)', async () => {
    const Item = ({ label }: { label: string }) => <span data-label={label} />;
    const itemConfig: Config = {
      components: {
        item: { component: Item, defaults: { label: 'fromDefault' } },
      },
    };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('item', {
            id: 'i',
            contentProperties: { label: '' },
          }),
        ],
      },
      itemConfig
    );
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={itemConfig} />
    );
    expect(html).toContain('data-label=""');
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
          registration: { kind: 'component', id: 'item' },
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

  it('renders an experienceTemplate node from the experienceTemplates registry', async () => {
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    // A template's slots arrive as named props, exactly like a component's —
    // the slot named `content` becomes a `content` prop, not `children`.
    const Template = ({ title, content }: { title?: string; content?: ReactNode[] }) => (
      <main data-experienceTemplate="page" data-title={title}>
        {content}
      </main>
    );
    const cfg: Config = {
      components: { item: Item },
      experienceTemplates: { page: { component: Template, defaults: { title: 'Default Title' } } },
    };
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
    const plan = await resolveExperience(tplPayload, cfg);
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toContain('data-experienceTemplate="page"');
    expect(html).toContain('data-title="Default Title"');
    expect(html).toContain('<span>inside</span>');
  });

  it('renders a composite experience unwrapped — sys.experienceTemplate is ignored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    // `hero` is registered as a template, but the nodes are plain components,
    // so nothing may wrap them.
    const cfg: Config = {
      components: { item: Item },
      experienceTemplates: {
        hero: ({ content }: { content?: ReactNode[] }) => <main>{content}</main>,
      },
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
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toBe('<span>one</span><span>two</span>');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders slot children unwrapped + warns when the experienceTemplate is not registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const cfg: Config = { components: { item: Item } };
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
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    // The subtree survives — an unregistered template must not blank the page.
    expect(html).toBe('<span>unwrapped</span>');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing-experienceTemplate'));
    warn.mockRestore();
  });
});

describe('ServerExperienceRenderer — slot children as an array', () => {
  it('passes slot children as an array a component can map/wrap individually', async () => {
    let received: unknown = null;
    const Container = ({ children }: { children?: ReactNode[] }) => {
      received = children;
      // Wrap each child individually — the whole point of exposing the array.
      return (
        <div data-container>
          {children?.map((child, i) => (
            <div className="wrap" data-index={i} key={i}>
              {child}
            </div>
          ))}
        </div>
      );
    };
    const Item = ({ text }: { text?: string }) => <span>{text}</span>;
    const cfg: Config = { components: { container: Container, item: Item } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('container', {
            id: 'c',
            slots: {
              children: [
                componentNode('item', { id: 'a', contentProperties: { text: 'one' } }),
                componentNode('item', { id: 'b', contentProperties: { text: 'two' } }),
                componentNode('item', { id: 'd', contentProperties: { text: 'three' } }),
              ],
            },
          }),
        ],
      },
      cfg
    );
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

    expect(Array.isArray(received)).toBe(true);
    expect((received as ReactNode[]).length).toBe(3);
    // Each child got its own wrapper div — proves per-child control.
    expect(html).toContain('data-index="0"');
    expect(html).toContain('data-index="1"');
    expect(html).toContain('data-index="2"');
    expect(html).toContain('<span>one</span>');
    expect(html).toContain('<span>three</span>');
  });

  it('renders the array directly in the common "just render them" case', async () => {
    // React renders keyed arrays, so dropping `children` straight into JSX
    // without a wrapper stays ergonomic.
    const Container = ({ children }: { children?: ReactNode[] }) => <div>{children}</div>;
    const Item = ({ text }: { text?: string }) => <span>{text}</span>;
    const cfg: Config = { components: { container: Container, item: Item } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('container', {
            id: 'c',
            slots: {
              children: [
                componentNode('item', { id: 'a', contentProperties: { text: 'one' } }),
                componentNode('item', { id: 'b', contentProperties: { text: 'two' } }),
              ],
            },
          }),
        ],
      },
      cfg
    );
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toBe('<div><span>one</span><span>two</span></div>');
  });

  it('lets a component filter the children array', async () => {
    // Drop every other child — proves the array is a real, filterable array of
    // pre-rendered nodes, not an opaque blob.
    const Container = ({ children }: { children?: ReactNode[] }) => (
      <div>{children?.filter((_, i) => i % 2 === 0)}</div>
    );
    const Item = ({ text }: { text?: string }) => <span>{text}</span>;
    const cfg: Config = { components: { container: Container, item: Item } };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('container', {
            id: 'c',
            slots: {
              children: [
                componentNode('item', { id: 'a', contentProperties: { text: 'keep' } }),
                componentNode('item', { id: 'b', contentProperties: { text: 'drop' } }),
                componentNode('item', { id: 'd', contentProperties: { text: 'keep2' } }),
              ],
            },
          }),
        ],
      },
      cfg
    );
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toContain('keep');
    expect(html).toContain('keep2');
    expect(html).not.toContain('drop');
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

  it('accepts a bare component for a experienceTemplate', async () => {
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const Tpl = ({ content }: { content?: ReactNode[] }) => <main data-tpl>{content}</main>;
    const cfg: Config = { components: { item: Item }, experienceTemplates: { page: Tpl } };
    const tplPayload: ExperiencePayload = {
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

describe('ServerExperienceRenderer — useContentfulComponent / useContentfulExperienceTemplate', () => {
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
      componentId: 'button',
      nodeId: 'btn-1',
      content: { label: 'Buy now' },
      design: { cfPadding: vbv({ desktop: m('40px') }) }, // raw design property, NOT scalar
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

  it('exposes experienceTemplateId/content/design/resolved via useContentfulExperienceTemplate()', async () => {
    let captured: Record<string, unknown> | null = null;
    const CaptureTpl = ({ content }: { content?: ReactNode[] }) => {
      captured = useContentfulExperienceTemplate() as unknown as Record<string, unknown>;
      return <main>{content}</main>;
    };
    const Item = () => null;
    const cfg: Config = {
      components: { item: Item },
      experienceTemplates: { page: { component: CaptureTpl, defaults: { title: 'Default' } } },
    };
    const plan = await resolveExperience(
      {
        viewports: VIEWPORTS,
        nodes: [
          experienceTemplateNode('page', {
            id: 'tpl',
            contentProperties: { heading: 'Hello' },
            slots: { content: [componentNode('item', { id: 'i' })] },
          }),
        ],
      },
      cfg
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

    expect(captured).toEqual({
      experienceTemplateId: 'page',
      // A template is an ordinary node, so it carries its payload `id` too.
      nodeId: 'tpl',
      content: { heading: 'Hello' },
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

  it('passes DesignToken values through the resolver before render', async () => {
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

  it('warns and drops the key from the design values when the resolver returns undefined', async () => {
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

  it('leaves token values untouched when no resolver is supplied (backward-compatible)', async () => {
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
    // React stringifies the token object into "[object Object]" — the key
    // point is that the raw token value reaches the component, unchanged.
    expect(html).toContain('data-bg="[object Object]"');
  });

  it('runs on an experienceTemplate node design props too', async () => {
    const Tpl = ({ content }: { content?: ReactNode[] }) => {
      const design = useDesignValues();
      return <main data-bg={design.cfBackground as string}>{content}</main>;
    };
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const cfg: Config = {
      components: { item: Item },
      experienceTemplates: { page: Tpl },
      resolveToken: (ref) => (ref.value === 'brand/canvas' ? '#111827' : undefined),
    };
    const tplPayload: ExperiencePayload = {
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
    const plan = await resolveExperience(tplPayload, cfg);
    // Render at a non-fallback viewport (mobile ≠ fallback index 0) so the
    // adapter recomputes from the raw design and runs resolveToken itself.
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={cfg} initialViewportId="mobile" />
    );
    expect(html).toContain('data-bg="#111827"');
  });
});

describe('ServerExperienceRenderer — design values auto-fill props', () => {
  it('spreads resolved design values onto component props by their raw key', async () => {
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
    // Content flows as a prop, and design auto-fills props under its raw key.
    expect(received).toHaveProperty('label', 'keep me');
    expect(received).toHaveProperty('cfBackgroundColor', '#f00');
    expect(received).toHaveProperty('cfPadding', '10px');
  });

  it('lets content override design on a key collision (content wins)', async () => {
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
            // Same key in both channels: content must win.
            contentProperties: { cfPadding: 'from-content' },
            designProperties: { cfPadding: m('from-design') },
          }),
        ],
      },
      cfg
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(received).toHaveProperty('cfPadding', 'from-content');
  });

  it('spreads resolved design values onto experienceTemplate props too', async () => {
    let received: Record<string, unknown> = {};
    const Tpl = (props: Record<string, unknown>) => {
      received = props;
      return <main>{props.content as ReactNode[]}</main>;
    };
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const cfg: Config = {
      components: { item: Item },
      experienceTemplates: { page: Tpl },
    };
    const tplPayload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          designProperties: { cfBackground: m('#111827') },
          slots: {
            content: [componentNode('item', { id: 'i', contentProperties: { value: 'inside' } })],
          },
        }),
      ],
    };
    const plan = await resolveExperience(tplPayload, cfg);
    // Rendered at the fallback viewport (default index 0), the adapter consumes
    // the server-resolved design as-is.
    expect(templateNodeOf(plan!).props.design).toEqual({ cfBackground: '#111827' });
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(received).toHaveProperty('cfBackground', '#111827');
  });
});

describe('ServerExperienceRenderer — useDesignValues()', () => {
  it('returns the resolved design values for the current node', async () => {
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

  it('accepts a type argument that types the returned values (useState-style)', async () => {
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
    // Put the probe in a experienceTemplate that carries no design and wraps a node
    // with no design either, so the hook has nothing to resolve.
    let captured: Record<string, unknown> | null = null;
    const Probe = ({ content }: { content?: ReactNode[] }) => {
      captured = useDesignValues();
      return <>{content}</>;
    };
    const Item = () => null;
    const cfg: Config = {
      components: { item: Item },
      experienceTemplates: { page: Probe },
    };
    const tplPayload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          slots: { content: [componentNode('item', { id: 'i' })] },
        }),
      ],
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

describe('ServerExperienceRenderer — server pre-resolved design values', () => {
  const Probe = () => {
    const design = useDesignValues();
    return <div data-padding={design.cfPadding as string} />;
  };
  const probeCfg: Config = { components: { probe: Probe } };

  const probePayload: ExperiencePayload = {
    viewports: VIEWPORTS,
    nodes: [
      componentNode('probe', {
        id: 'p',
        designProperties: { cfPadding: vbv({ desktop: m('40px'), mobile: m('12px') }) },
      }),
    ],
  };

  it('consumes props.design as-is when the active viewport equals the fallback', async () => {
    const plan = await resolveExperience(probePayload, probeCfg, { initialViewportId: 'mobile' });
    // Tamper the precomputed values with a sentinel the cascade could never produce.
    plan.nodes[0]!.props.design = { cfPadding: 'SENTINEL' };
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={probeCfg} initialViewportId="mobile" />
    );
    expect(html).toContain('data-padding="SENTINEL"');
  });

  it('recomputes from raw design properties when the active viewport differs from the fallback', async () => {
    const plan = await resolveExperience(probePayload, probeCfg, { initialViewportId: 'mobile' });
    plan.nodes[0]!.props.design = { cfPadding: 'SENTINEL' };
    // Active viewport (desktop, idx 0) ≠ fallback (mobile, idx 2) → recompute.
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={probeCfg} initialViewportId="desktop" />
    );
    expect(html).toContain('data-padding="40px"');
    expect(html).not.toContain('SENTINEL');
  });

  it('recomputes when the active viewport differs from the default fallback (viewport[0])', async () => {
    const plan = await resolveExperience(probePayload, probeCfg);
    // No fallback configured → pre-resolved against viewport[0] (desktop, idx 0).
    expect(plan.fallbackViewportIndex).toBe(0);
    // Active viewport is mobile (idx 2) ≠ fallback (idx 0) → recompute to 12px.
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={probeCfg} initialViewportId="mobile" />
    );
    expect(html).toContain('data-padding="12px"');
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

describe('ServerExperienceRenderer — render context carried on the plan', () => {
  function captureSetup() {
    const seen: Array<Record<string, unknown>> = [];
    const Capture = () => {
      seen.push(useExperience() as unknown as Record<string, unknown>);
      return null;
    };
    const config: Config = { components: { capture: Capture } };
    return { seen, config };
  }

  const payload = (): ExperiencePayload => ({
    viewports: VIEWPORTS,
    nodes: [componentNode('capture')],
  });

  it('reads metadata off the plan — there is no renderer prop for it', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, {
      metadata: { slug: 'home', locale: 'en-US' },
    });

    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} />);

    expect(seen[0].metadata).toEqual({ slug: 'home', locale: 'en-US' });
  });

  it('reads debug off the plan — there is no renderer prop for it', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, { debug: true });

    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} />);

    expect(seen[0].debug).toBe(true);
  });

  it('publishes fallbackViewportIndex on the context, matching the other adapters', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, { initialViewportId: 'tablet' });

    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} />);

    expect(seen[0].fallbackViewportIndex).toBe(1);
  });

  it('seeds the active viewport from the plan when no initialViewportId is passed', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, { initialViewportId: 'tablet' });

    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} />);

    expect(seen[0].activeViewportIndex).toBe(1);
    expect(seen[0].activeViewport).toEqual(VIEWPORTS[1]);
  });

  it('lets initialViewportId override the plan seed', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, { initialViewportId: 'tablet' });

    renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} initialViewportId="mobile" />
    );

    // Legal: the renderer recomputes design from `designRaw` for the new viewport.
    expect(seen[0].activeViewportIndex).toBe(2);
    expect(seen[0].fallbackViewportIndex).toBe(1);
  });

  it('still falls back to viewport[0] when neither the plan nor the prop names one', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config);

    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} />);

    expect(seen[0].activeViewportIndex).toBe(0);
  });

  it('renders the debug panel from the plan alone', async () => {
    const config: Config = { components: { capture: () => null } };
    const plan = await resolveExperience(payload(), config, { debug: true });

    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} />
    );

    expect(html).toContain('<details');
  });
});
