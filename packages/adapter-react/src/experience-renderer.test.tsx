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
  PortableRenderPlan,
} from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import { useContentfulComponent, useContentfulExperienceTemplate, useExperience } from './context';
import { toCss } from './design-utils';
import { ExperienceRenderer } from './experience-renderer';
import type { Config } from './types';
import { useDesignValues } from './use-design-values';

const m = (value: string): ManualDesignValue => ({ type: 'ManualDesignValue', value });

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
  nodes: [
    componentNode('contentful-container', {
      id: 'page',
      contentProperties: {},
      designProperties: {
        cfPadding: m('40px'),
      },
      slots: {
        children: [
          componentNode('contentful-heading', {
            id: 'heading',
            contentProperties: { text: 'Build faster' },
            designProperties: {
              cfFontSize: m('32px'),
            },
          }),
          componentNode('contentful-button', {
            id: 'btn',
            contentProperties: { label: 'Get started' },
            designProperties: {
              cfBackgroundColor: m('#4f39f6'),
            },
          }),
        ],
      },
    }),
  ],
};

describe('ExperienceRenderer', () => {
  it('renders a nested experience with resolved design props', async () => {
    const plan = await resolveExperience(payload, config);
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={config} />);

    expect(html).toContain('data-padding="40px"');
    expect(html).toContain('font-size:32px');
    expect(html).toContain('background:#4f39f6');
    expect(html).toContain('Build faster');
    expect(html).toContain('Get started');
  });

  it('renders null when plan is null/undefined', () => {
    expect(renderToStaticMarkup(<ExperienceRenderer experience={null} config={config} />)).toBe('');
    expect(
      renderToStaticMarkup(<ExperienceRenderer experience={undefined} config={config} />)
    ).toBe('');
  });

  it('exposes experience context via useExperience() with debug false by default', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const Capture = () => {
      seen.push(useExperience() as unknown as Record<string, unknown>);
      return null;
    };
    const captureConfig: Config = { components: { capture: Capture } };
    const plan = await resolveExperience({ nodes: [componentNode('capture')] }, captureConfig);
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={captureConfig} />);

    expect(seen).toEqual([{ debug: false, metadata: {} }]);
  });

  it('renders missing-component fallback in debug mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const justContainer: Config = {
      components: {
        'contentful-container': ({ children }: { children?: ReactNode }) => <div>{children}</div>,
      },
    };
    const planWithMissing: PortableRenderPlan = {
      metadata: {},
      debug: false,
      diagnostics: [],
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
      <ExperienceRenderer experience={planWithMissing} config={justContainer} debug />
    );
    expect(debugHtml).toContain('data-experiences-missing="NotRegistered"');

    const productionHtml = renderToStaticMarkup(
      <ExperienceRenderer experience={planWithMissing} config={justContainer} />
    );
    expect(productionHtml).not.toContain('data-experiences-missing');
    expect(productionHtml).toBe('<div></div>');

    warn.mockRestore();
  });

  it('auto-mounts DebugExperience only when debug is on', async () => {
    const captureConfig: Config = { components: { capture: () => null } };
    const plan = await resolveExperience({ nodes: [componentNode('capture')] }, captureConfig);

    const off = renderToStaticMarkup(
      <ExperienceRenderer experience={plan} config={captureConfig} />
    );
    expect(off).not.toContain('data-experiences-debug');

    const on = renderToStaticMarkup(
      <ExperienceRenderer experience={plan} config={captureConfig} debug />
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
    const plan = await resolveExperience({ nodes: [componentNode('capture')] }, captureConfig);
    renderToStaticMarkup(
      <ExperienceRenderer
        experience={plan}
        config={captureConfig}
        metadata={{ slug: 'home', locale: 'en-US' }}
      />
    );
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
        nodes: [
          componentNode('item', {
            id: 'i',
            contentProperties: { variant: 'fromContent' },
          }),
        ],
      },
      itemConfig
    );
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={itemConfig} />);
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
        nodes: [
          componentNode('item', {
            id: 'i',
            contentProperties: { label: '' },
          }),
        ],
      },
      itemConfig
    );
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={itemConfig} />);
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
    const planWithResolved: PortableRenderPlan = {
      metadata: {},
      debug: false,
      diagnostics: [],
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
    const html = renderToStaticMarkup(
      <ExperienceRenderer experience={planWithResolved} config={cfg} />
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
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
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
        nodes: [
          componentNode('item', { id: 'a', contentProperties: { value: 'one' } }),
          componentNode('item', { id: 'b', contentProperties: { value: 'two' } }),
        ],
      },
      cfg
    );
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toBe('<span>one</span><span>two</span>');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders slot children unwrapped + warns when the experienceTemplate is not registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const cfg: Config = { components: { item: Item } };
    const tplPayload: ExperiencePayload = {
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
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} debug />);
    // The subtree survives — an unregistered template must not blank the page.
    expect(html).toContain('<span>unwrapped</span>');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing-experienceTemplate'));
    expect(html).toContain('data-experiences-debug-errors');
    expect(html).toContain(
      'No experience template registered for id &quot;missing-experienceTemplate&quot;'
    );
    warn.mockRestore();
  });
});

describe('ExperienceRenderer — slot children as an array', () => {
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
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);

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
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
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
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toContain('keep');
    expect(html).toContain('keep2');
    expect(html).not.toContain('drop');
  });
});

describe('ExperienceRenderer — bare-component registrations', () => {
  it('accepts a bare function component as a registry entry', async () => {
    const Bare = ({ text }: { text?: string }) => <p data-from="bare">{text}</p>;
    const cfg: Config = { components: { bare: Bare } };
    const plan = await resolveExperience(
      {
        nodes: [componentNode('bare', { id: 'b', contentProperties: { text: 'hi' } })],
      },
      cfg
    );
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toBe('<p data-from="bare">hi</p>');
  });

  it('accepts a bare component for a experienceTemplate', async () => {
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    const Tpl = ({ content }: { content?: ReactNode[] }) => <main data-tpl>{content}</main>;
    const cfg: Config = { components: { item: Item }, experienceTemplates: { page: Tpl } };
    const tplPayload: ExperiencePayload = {
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
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
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
        nodes: [componentNode('probe', { id: 'p', contentProperties: { text: 'hi' } })],
      },
      cfg
    );
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
    expect(receivedKeys).toContain('text');
    expect(receivedKeys).not.toContain('experience');
    expect(receivedKeys).not.toContain('contentful');
  });
});

describe('ExperienceRenderer — useContentfulComponent / useContentfulExperienceTemplate', () => {
  it('exposes the raw Contentful payload via useContentfulComponent()', async () => {
    let captured: Record<string, unknown> | null = null;
    const Capture = () => {
      captured = useContentfulComponent() as unknown as Record<string, unknown>;
      return null;
    };
    const cfg: Config = { components: { button: Capture } };
    const plan = await resolveExperience(
      {
        nodes: [
          componentNode('button', {
            id: 'btn-1',
            contentProperties: { label: 'Buy now' },
            designProperties: { cfPadding: m('40px') },
          }),
        ],
      },
      cfg
    );
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);

    expect(captured).toEqual({
      componentId: 'button',
      nodeId: 'btn-1',
      content: { label: 'Buy now' },
      design: { cfPadding: m('40px') }, // raw design envelope, NOT scalar
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
    const plan = await resolveExperience({ nodes: [componentNode('item', { id: 'i' })] }, cfg);
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);

    expect(captured!.resolved).toEqual({ enriched: 'yes' });
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
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);

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

describe('ExperienceRenderer — resolveToken', () => {
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
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toContain('data-bg="#4f39f6"');
    expect(html).not.toContain('DesignToken');
  });

  it('warns and passes the raw token through the design values when the resolver returns undefined', async () => {
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
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);

    expect(captured.cfBackgroundColor).toEqual(dt('color/unknown'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('color/unknown'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('button'));
    warn.mockRestore();
  });

  it('leaves token values untouched when no resolver is supplied (backward-compatible)', async () => {
    const cfg: Config = { components: { button: Button } };
    const plan = await resolveExperience(
      {
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
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
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
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toContain('data-bg="#111827"');
  });
});

describe('ExperienceRenderer — design values auto-fill props', () => {
  it('spreads resolved design values onto component props by their raw key', async () => {
    let received: Record<string, unknown> = {};
    const Probe = (props: Record<string, unknown>) => {
      received = props;
      return null;
    };
    const cfg: Config = { components: { probe: Probe } };
    const plan = await resolveExperience(
      {
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
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
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
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
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
    expect(templateNodeOf(plan!).props.design).toEqual({ cfBackground: '#111827' });
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
    expect(received).toHaveProperty('cfBackground', '#111827');
  });
});

describe('ExperienceRenderer — useDesignValues()', () => {
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
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
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
        nodes: [componentNode('probe', { id: 'p', designProperties: { cfPadding: m('24px') } })],
      },
      cfg
    );
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
    expect(typed).toEqual({ cfBackgroundColor: undefined, cfPadding: '24px' });
  });

  it("reads the enclosing node's design when called deep inside a subtree", async () => {
    let captured: Record<string, unknown> = {};
    const Probe = () => {
      captured = useDesignValues();
      return null;
    };
    const Wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    const cfg: Config = { components: { probe: Probe, wrapper: Wrapper } };
    const plan = await resolveExperience(
      {
        nodes: [
          componentNode('wrapper', {
            id: 'w',
            designProperties: { cfPadding: m('40px') },
            slots: {
              children: [
                componentNode('probe', {
                  id: 'p',
                  designProperties: { cfPadding: m('12px') },
                }),
              ],
            },
          }),
        ],
      },
      cfg
    );
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
    expect(captured).toEqual({ cfPadding: '12px' });
  });

  it('returns {} when there is no design in scope', async () => {
    // Put the probe in a experienceTemplate that carries no design and wraps a node
    // with no design either, so the hook has nothing to resolve.
    let captured: Record<string, unknown> | null = null;
    const Probe = ({ content }: { content?: ReactNode[] }) => {
      captured = useDesignValues<Record<string, unknown>>();
      return <>{content}</>;
    };
    const Item = () => null;
    const cfg: Config = {
      components: { item: Item },
      experienceTemplates: { page: Probe },
    };
    const tplPayload: ExperiencePayload = {
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          slots: { content: [componentNode('item', { id: 'i' })] },
        }),
      ],
    };
    const plan = await resolveExperience(tplPayload, cfg);
    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={cfg} />);
    expect(captured).toEqual({});
  });

  it('returns {} when called outside any renderer subtree', () => {
    let captured: Record<string, unknown> | null = null;
    const Probe = () => {
      captured = useDesignValues<Record<string, unknown>>();
      return null;
    };
    renderToStaticMarkup(<Probe />);
    expect(captured).toEqual({});
  });
});

describe('ExperienceRenderer — resolved design values', () => {
  const Probe = () => {
    const design = useDesignValues();
    return <div data-padding={design.cfPadding as string} />;
  };
  const probeCfg: Config = { components: { probe: Probe } };

  const probePayload: ExperiencePayload = {
    nodes: [
      componentNode('probe', {
        id: 'p',
        designProperties: { cfPadding: m('40px') },
      }),
    ],
  };

  it('consumes props.design as-is when no resolveToken is configured', async () => {
    const plan = await resolveExperience(probePayload, probeCfg);
    // Tamper the precomputed values with a sentinel resolution could never produce.
    plan.nodes[0]!.props.design = { cfPadding: 'SENTINEL' };
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={probeCfg} />);
    expect(html).toContain('data-padding="SENTINEL"');
  });

  it('recomputes from raw design properties when the config supplies resolveToken', async () => {
    const plan = await resolveExperience(probePayload, probeCfg);
    plan.nodes[0]!.props.design = { cfPadding: 'SENTINEL' };
    // A render-time `resolveToken` means the adapter re-derives design from
    // `designRaw` rather than trusting the plan's precomputed record.
    const withToken: Config = { ...probeCfg, resolveToken: () => undefined };
    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={withToken} />);
    expect(html).toContain('data-padding="40px"');
    expect(html).not.toContain('SENTINEL');
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

describe('ExperienceRenderer — render context carried on the plan', () => {
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
    nodes: [componentNode('capture')],
  });

  it('reads metadata off the plan without it being passed to the renderer', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, {
      metadata: { slug: 'home', locale: 'en-US' },
    });

    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={config} />);

    expect(seen[0]!.metadata).toEqual({ slug: 'home', locale: 'en-US' });
  });

  it('reads debug off the plan without it being passed to the renderer', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, { debug: true });

    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={config} />);

    expect(seen[0]!.debug).toBe(true);
  });

  it('shallow-merges the metadata prop over the plan value', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, {
      metadata: { slug: 'home', locale: 'en-US' },
    });

    renderToStaticMarkup(
      <ExperienceRenderer
        experience={plan}
        config={config}
        metadata={{ locale: 'de-DE', extra: true }}
      />
    );

    expect(seen[0]!.metadata).toEqual({ slug: 'home', locale: 'de-DE', extra: true });
  });

  it('lets an explicit debug={false} override a plan fetched with debug on', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, { debug: true });

    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={config} debug={false} />);

    expect(seen[0]!.debug).toBe(false);
  });

  it('lets an explicit debug override a plan fetched without it', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config);

    renderToStaticMarkup(<ExperienceRenderer experience={plan} config={config} debug />);

    expect(seen[0]!.debug).toBe(true);
  });

  it('varies context per render by spreading the plan', async () => {
    // The plan is the only channel for `metadata` / `debug`, so a per-render
    // change means deriving a new plan. Spreading is shallow, which matters:
    // `nodes` keeps its identity, so nothing downstream that watches that
    // reference churns.
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, { metadata: { slug: 'home' } });

    const derived = {
      ...plan,
      debug: true,
      metadata: { ...plan.metadata, viewer: 'anon' },
    };
    renderToStaticMarkup(<ExperienceRenderer experience={derived} config={config} />);

    expect(seen[0]!.debug).toBe(true);
    expect(seen[0]!.metadata).toEqual({ slug: 'home', viewer: 'anon' });
    expect(derived.nodes).toBe(plan.nodes);
  });

  it('renders the debug panel from the plan alone', async () => {
    const config: Config = { components: { capture: () => null } };
    const plan = await resolveExperience(payload(), config, { debug: true });

    const html = renderToStaticMarkup(<ExperienceRenderer experience={plan} config={config} />);

    expect(html).toContain('<details');
  });
});
