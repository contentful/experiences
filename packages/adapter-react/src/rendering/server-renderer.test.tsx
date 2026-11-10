import { readFileSync } from 'node:fs';

import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  ExperiencePayload,
  ManualDesignValue,
  PortableRenderPlan,
} from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import { useContentfulComponent, useContentfulExperienceTemplate, useExperience } from './context';
import { ServerExperienceRenderer } from './server-renderer';
import type { Config } from '../registry/types';
import { useDesignValues } from '../hooks/use-design-values';
import { minimalSourceMap } from '../test/fixtures/source-map.js';

import { componentNode, experienceTemplateNode, slotPayload } from '../test/fixtures/payload.js';

const m = (value: string): ManualDesignValue => ({ type: 'ManualDesignValue', value });

const dt = (value: string) => ({ type: 'DesignToken' as const, value });

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

// Fixtures read their design through useDesignValues() — the SDK never
// prescribes how the design-system component applies it.
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

describe('ServerExperienceRenderer', () => {
  it('renders a nested experience with design props', async () => {
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
    const plan = await resolveExperience({ nodes: [componentNode('capture')] }, captureConfig);
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={captureConfig} />);

    expect(seen).toEqual([
      {
        debug: false,
        metadata: {},
      },
    ]);
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
      <ServerExperienceRenderer experience={planWithMissing} config={justContainer} debug />
    );
    expect(debugHtml).toContain('data-experiences-missing="NotRegistered"');

    const productionHtml = renderToStaticMarkup(
      <ServerExperienceRenderer experience={planWithMissing} config={justContainer} />
    );
    expect(productionHtml).not.toContain('data-experiences-missing');
    expect(productionHtml).toBe(
      '<div data-ctfl-attribution="{&quot;scopes&quot;:{}}" style="display:contents"><div></div></div>'
    );

    warn.mockRestore();
  });

  it('auto-mounts DebugExperience only when debug is on', async () => {
    const captureConfig: Config = { components: { capture: () => null } };
    const plan = await resolveExperience({ nodes: [componentNode('capture')] }, captureConfig);

    const off = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={captureConfig} />
    );
    expect(off).not.toContain('data-experiences-debug');

    const on = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={captureConfig} debug />
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
      <ServerExperienceRenderer
        experience={plan}
        config={captureConfig}
        metadata={{ slug: 'home', locale: 'en-US' }}
      />
    );
    expect(seen!.metadata).toEqual({ slug: 'home', locale: 'en-US' });
  });

  it("declares MissingComponent as a client component ('use client')", () => {
    const source = readFileSync(
      new URL('../diagnostics/missing-component.tsx', import.meta.url),
      'utf8'
    );
    expect(source).toMatch(/^\s*['"]use client['"];/m);
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
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toContain('data-experienceTemplate="page"');
    expect(html).toContain('data-title="Default Title"');
    expect(html).toContain('<span>inside</span>');
  });

  it('renders composite siblings without a template wrapper — sys.experienceTemplate is ignored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Item = ({ value }: { value?: string }) => <span>{value}</span>;
    // `hero` is registered as a template, but the nodes are plain components,
    // so no template may wrap them; only the Experience boundary is added.
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
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toBe(
      '<div data-ctfl-attribution="{&quot;scopes&quot;:{}}" style="display:contents"><span>one</span><span>two</span></div>'
    );
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
    const html = renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={cfg} debug />
    );
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
    const plan = await resolveExperience(slotPayload(['one', 'two', 'three']), cfg);
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
    const plan = await resolveExperience(slotPayload(['one', 'two']), cfg);
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toBe(
      '<div data-ctfl-attribution="{&quot;scopes&quot;:{}}" style="display:contents"><div><span>one</span><span>two</span></div></div>'
    );
  });

  it('lets a component filter the children array', async () => {
    // Drop every other child — proves the array is a real, filterable array of
    // pre-rendered nodes, not an opaque blob.
    const Container = ({ children }: { children?: ReactNode[] }) => (
      <div>{children?.filter((_, i) => i % 2 === 0)}</div>
    );
    const Item = ({ text }: { text?: string }) => <span>{text}</span>;
    const cfg: Config = { components: { container: Container, item: Item } };
    const plan = await resolveExperience(slotPayload(['keep', 'drop', 'keep2']), cfg);
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
        nodes: [componentNode('bare', { id: 'b', contentProperties: { text: 'hi' } })],
      },
      cfg
    );
    const html = renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(html).toBe(
      '<div data-ctfl-attribution="{&quot;scopes&quot;:{}}" style="display:contents"><p data-from="bare">hi</p></div>'
    );
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
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

    expect(captured).toEqual({
      componentId: 'button',
      nodeId: 'btn-1',
      content: { label: 'Buy now' },
      design: { cfPadding: m('40px') }, // raw design property, NOT scalar
      resolved: undefined,
    });
  });

  it('exposes node attribution via useContentfulComponent(), as plain serializable data', async () => {
    let captured: Record<string, unknown> | null = null;
    const Capture = () => {
      captured = useContentfulComponent() as unknown as Record<string, unknown>;
      return null;
    };
    const cfg: Config = { components: { button: Capture } };
    const plan = await resolveExperience({ nodes: [componentNode('button', { id: 'n' })] }, cfg, {
      sourceMap: minimalSourceMap({ leaf: { kind: 'Component', id: 'button' } }),
    });
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

    const attribution = captured!.attribution as { scopes: Array<{ entityId: string }> };
    // Exactly what the plan carries: the same value Svelte and Angular are held to.
    expect(attribution).toEqual(plan.nodes[0]!.attribution);
  });

  it('has no attribution when the plan carries no source map', async () => {
    let captured: Record<string, unknown> | null = null;
    const Capture = () => {
      captured = useContentfulComponent() as unknown as Record<string, unknown>;
      return null;
    };
    const cfg: Config = { components: { button: Capture } };
    const plan = await resolveExperience({ nodes: [componentNode('button', { id: 'n' })] }, cfg);
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

    expect(captured!.attribution).toBeUndefined();
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
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

    expect(captured!.resolved).toEqual({ enriched: 'yes' });
  });

  it('exposes attribution via useContentfulExperienceTemplate()', async () => {
    let captured: Record<string, unknown> | null = null;
    const CaptureTpl = () => {
      captured = useContentfulExperienceTemplate() as unknown as Record<string, unknown>;
      return null;
    };
    const cfg: Config = {
      components: {},
      experienceTemplates: { page: CaptureTpl },
    };
    const plan = await resolveExperience(
      { nodes: [experienceTemplateNode('page', { id: 'tpl' })] },
      cfg,
      {
        sourceMap: minimalSourceMap({
          node: 'tpl',
          leaf: { kind: 'ExperienceTemplate', id: 'page' },
        }),
      }
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);

    expect(captured!.attribution).toEqual(plan.nodes[0]!.attribution);
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
  // The same resolved value reaches both provider context and ordinary props.
  const Button = ({ label, cfBackgroundColor }: { label?: string; cfBackgroundColor?: string }) => {
    const design = useDesignValues();
    expect(cfBackgroundColor).toBe(design.cfBackgroundColor);
    return (
      <button type="button" data-bg={design.cfBackgroundColor as string}>
        {label}
      </button>
    );
  };

  it.each(['component', 'experienceTemplate'] as const)(
    'passes resolved DesignToken values into %s context and props',
    async (kind) => {
      const cfg: Config = {
        components: { button: Button },
        experienceTemplates: { button: Button },
        resolveToken: (ref) => (ref.value === 'color/surface/hero' ? '#4f39f6' : undefined),
      };
      const plan = await resolveExperience(
        {
          nodes: [
            (kind === 'component' ? componentNode : experienceTemplateNode)('button', {
              id: 'b',
              contentProperties: { label: 'Go' },
              designProperties: { cfBackgroundColor: dt('color/surface/hero') },
            }),
          ],
        },
        cfg
      );
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={cfg} />
      );
      expect(html).toContain('data-bg="#4f39f6"');
      expect(html).not.toContain('DesignToken');
    }
  );
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
        nodes: [componentNode('probe', { id: 'p', designProperties: { cfPadding: m('24px') } })],
      },
      cfg
    );
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
    expect(typed).toEqual({ cfBackgroundColor: undefined, cfPadding: '24px' });
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
    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={cfg} />);
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
    nodes: [componentNode('capture')],
  });

  it('reads metadata off the plan without it being passed to the renderer', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, {
      metadata: { slug: 'home', locale: 'en-US' },
    });

    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} />);

    expect(seen[0]!.metadata).toEqual({ slug: 'home', locale: 'en-US' });
  });

  it('reads debug off the plan without it being passed to the renderer', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, { debug: true });

    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} />);

    expect(seen[0]!.debug).toBe(true);
  });

  it('shallow-merges the metadata prop over the plan value', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, {
      metadata: { slug: 'home', locale: 'en-US' },
    });

    renderToStaticMarkup(
      <ServerExperienceRenderer
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

    renderToStaticMarkup(
      <ServerExperienceRenderer experience={plan} config={config} debug={false} />
    );

    expect(seen[0]!.debug).toBe(false);
  });

  it('lets an explicit debug override a plan fetched without it', async () => {
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config);

    renderToStaticMarkup(<ServerExperienceRenderer experience={plan} config={config} debug />);

    expect(seen[0]!.debug).toBe(true);
  });

  it('varies context per render by spreading the plan', async () => {
    // The plan is the only channel for `metadata` / `debug`, so a per-render
    // change means deriving a new plan. Spreading is shallow, so the nodes
    // keep their identity.
    const { seen, config } = captureSetup();
    const plan = await resolveExperience(payload(), config, { metadata: { slug: 'home' } });

    const derived = {
      ...plan,
      debug: true,
      metadata: { ...plan.metadata, viewer: 'anon' },
    };
    renderToStaticMarkup(<ServerExperienceRenderer experience={derived} config={config} />);

    expect(seen[0]!.debug).toBe(true);
    expect(seen[0]!.metadata).toEqual({ slug: 'home', viewer: 'anon' });
    expect(derived.nodes).toBe(plan.nodes);
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
