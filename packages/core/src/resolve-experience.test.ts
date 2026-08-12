import { describe, it, expect, vi } from 'vitest';

import type {
  ComponentNode,
  ExperiencePayload,
  ExperienceTemplateNode,
} from '@contentful/experiences-sdk-core';

import { resolveExperience, type ResolverConfig } from './resolve-experience';

const VIEWPORTS = [
  { id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' },
  { id: 'tablet', query: '<992px', displayName: 'Tablet', previewSize: '100%' },
  { id: 'mobile', query: '<576px', displayName: 'Mobile', previewSize: '100%' },
];

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
 * `sys.experienceTemplate` is present on every Experience — coded and
 * composite alike — so the resolver must ignore it. Tests attach it to prove
 * it has no effect on the plan.
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

const emptyConfig: ResolverConfig = { components: {} };

describe('resolveExperience — IR construction', () => {
  it('emits a node per top-level instance with nested slot trees', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        componentNode('contentful-container', {
          id: 'page',
          contentProperties: {},
          designProperties: {
            cfPadding: { type: 'ManualDesignValue', value: '40px' },
          },
          slots: {
            children: [
              componentNode('contentful-heading', {
                id: 'heading',
                contentProperties: { text: 'Hello' },
              }),
            ],
          },
        }),
      ],
    };

    const plan = await resolveExperience(payload, emptyConfig);

    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0]!.nodeId).toBe('page');
    expect(plan.nodes[0]!.registration).toEqual({
      kind: 'component',
      id: 'contentful-container',
    });
    expect(plan.nodes[0]!.slots.children).toHaveLength(1);
    expect(plan.nodes[0]!.slots.children![0]!.nodeId).toBe('heading');
    expect(plan.nodes[0]!.slots.children![0]!.props.content.text).toBe('Hello');
    expect(plan.viewports).toBe(VIEWPORTS);
  });

  it('extracts the registration id from component.sys.urn', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('contentful-button', { id: 'b' })],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.nodes[0]!.registration.id).toBe('contentful-button');
  });

  it('preserves discriminated design-prop values on the IR', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        componentNode('contentful-button', {
          id: 'b',
          contentProperties: { label: 'Go' },
          designProperties: {
            cfPadding: {
              type: 'ValuesByViewport',
              values: {
                desktop: { type: 'ManualDesignValue', value: '12px' },
                mobile: { type: 'ManualDesignValue', value: '8px' },
              },
            },
            cfBorderColor: { type: 'DesignToken', value: 'color.border' },
          },
        }),
      ],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.nodes[0]!.props.content).toEqual({ label: 'Go' });
    expect(plan.nodes[0]!.props.designRaw).toEqual({
      cfPadding: {
        type: 'ValuesByViewport',
        values: {
          desktop: { type: 'ManualDesignValue', value: '12px' },
          mobile: { type: 'ManualDesignValue', value: '8px' },
        },
      },
      cfBorderColor: { type: 'DesignToken', value: 'color.border' },
    });
  });

  it('handles multiple top-level nodes', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        componentNode('contentful-heading', { id: 'h' }),
        componentNode('contentful-text', { id: 't' }),
      ],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.nodes.map((n) => n.nodeId)).toEqual(['h', 't']);
  });

  it('passes through nodeId from payload, leaves it absent when not supplied', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        componentNode('contentful-container', {
          slots: { children: [componentNode('contentful-heading')] },
        }),
      ],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.nodes[0]!.nodeId).toBeUndefined();
    expect(plan.nodes[0]!.slots.children![0]!.nodeId).toBeUndefined();
  });

  it('still emits nodes for unregistered component types (render-time fallback handles them)', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('not-registered', { id: 'nr' })],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0]!.registration.id).toBe('not-registered');
  });

  it('throws when a slot value is not an array', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        componentNode('contentful-container', {
          slots: { children: 'oops' as unknown as never },
        }),
      ],
    };
    await expect(resolveExperience(payload, emptyConfig)).rejects.toThrow(TypeError);
  });

  it('emits an experienceTemplate-kind node instead of dropping it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [
          experienceTemplateNode('some-experienceTemplate', { id: 'tpl' }),
          componentNode('contentful-heading', { id: 'after' }),
        ],
      };
      const plan = await resolveExperience(payload, emptyConfig);
      expect(plan.nodes.map((n) => n.nodeId)).toEqual(['tpl', 'after']);
      expect(plan.nodes[0]!.registration).toEqual({
        kind: 'experienceTemplate',
        id: 'some-experienceTemplate',
      });
      expect(plan.nodes[1]!.registration.kind).toBe('component');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('handles deeply nested slot trees', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        componentNode('contentful-container', {
          id: 'page',
          slots: {
            children: [
              componentNode('contentful-container', {
                id: 'inner',
                slots: {
                  children: [
                    componentNode('contentful-button', {
                      id: 'btn',
                      contentProperties: { label: 'Go' },
                    }),
                  ],
                },
              }),
            ],
          },
        }),
      ],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.nodes[0]!.nodeId).toBe('page');
    expect(plan.nodes[0]!.slots.children![0]!.nodeId).toBe('inner');
    expect(plan.nodes[0]!.slots.children![0]!.slots.children![0]!.nodeId).toBe('btn');
    expect(plan.nodes[0]!.slots.children![0]!.slots.children![0]!.props.content.label).toBe('Go');
  });
});

/*
 * `ExperienceNode` is a closed union, so these shapes are unreachable through
 * the typed API — but payloads are untrusted JSON at runtime, and a node kind
 * newer than the SDK arrives looking exactly like this. Dropping one node must
 * not fail the whole experience, and must not be silent.
 */
describe('resolveExperience — unidentifiable nodes', () => {
  const emptyConfig: ResolverConfig = { components: {} };
  const unknownNode = (rest: Record<string, unknown> = {}) =>
    ({
      pattern: {
        sys: {
          type: 'ResourceLink',
          linkType: 'Contentful:Pattern',
          urn: 'crn:contentful:::experience:spaces/$self/environments/$self/patterns/carousel',
        },
      },
      ...rest,
    }) as unknown as ComponentNode;

  it('drops a node with neither ref and keeps its siblings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('contentful-heading', { id: 'before' }),
          unknownNode({ id: 'mystery' }),
          componentNode('contentful-button', { id: 'after' }),
        ],
      };
      const plan = await resolveExperience(payload, emptyConfig);
      expect(plan.nodes.map((n) => n.nodeId)).toEqual(['before', 'after']);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain('"mystery"');
    } finally {
      warn.mockRestore();
    }
  });

  it('names the node, its keys, and the descendant count it discarded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [
          unknownNode({
            id: 'mystery',
            slots: {
              content: [
                componentNode('contentful-container', {
                  slots: { children: [componentNode('contentful-button')] },
                }),
              ],
            },
          }),
        ],
      };
      const plan = await resolveExperience(payload, emptyConfig);
      expect(plan.nodes).toEqual([]);

      const message = String(warn.mock.calls[0]![0]);
      expect(message).toContain('"mystery"');
      expect(message).toContain('pattern');
      // The node itself plus the two components under it: 2 descendants.
      expect(message).toContain('2 descendant node(s)');
    } finally {
      warn.mockRestore();
    }
  });

  it('treats a ref with no urn as unidentifiable rather than throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [
          { component: {} } as unknown as ComponentNode,
          componentNode('contentful-button', { id: 'after' }),
        ],
      };
      const plan = await resolveExperience(payload, emptyConfig);
      expect(plan.nodes.map((n) => n.nodeId)).toEqual(['after']);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('drops an unidentifiable node nested in a slot without dropping the parent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [
          experienceTemplateNode('page', {
            id: 'tpl',
            slots: {
              content: [
                unknownNode({ id: 'mystery' }),
                componentNode('contentful-button', { id: 'btn' }),
              ],
            },
          }),
        ],
      };
      const plan = await resolveExperience(payload, emptyConfig);
      expect(plan.nodes[0]!.nodeId).toBe('tpl');
      expect(plan.nodes[0]!.slots.content!.map((n) => n.nodeId)).toEqual(['btn']);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('reports the drop through the debug logger too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [unknownNode({ id: 'mystery' })],
      };
      await resolveExperience(payload, emptyConfig, { debug: true });
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('Skipping unidentifiable node "mystery"'))).toBe(true);
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });
});

describe('resolveExperience — resolveData hooks', () => {
  const heroPayload: ExperiencePayload = {
    viewports: VIEWPORTS,
    nodes: [
      componentNode('hero', {
        id: 'h',
        contentProperties: { headingRaw: 'hello world', sku: 'SKU-1' },
      }),
      componentNode('text', {
        id: 't',
        contentProperties: { value: 'untouched' },
      }),
    ],
  };

  it('leaves props.resolved undefined when no component declares resolveData', async () => {
    const config: ResolverConfig = { components: { hero: {}, text: {} } };
    const plan = await resolveExperience(heroPayload, config);
    expect(plan.nodes[0]!.props.resolved).toBeUndefined();
    expect(plan.nodes[1]!.props.resolved).toBeUndefined();
  });

  it('runs a synchronous resolveData and stores the result on node.props.resolved', async () => {
    const config: ResolverConfig = {
      components: {
        hero: {
          resolveData: ({ content }) => ({
            heading: String(content.headingRaw ?? '').toUpperCase(),
          }),
        },
        text: {},
      },
    };
    const plan = await resolveExperience(heroPayload, config);
    expect(plan.nodes[0]!.props.resolved).toEqual({ heading: 'HELLO WORLD' });
    expect(plan.nodes[1]!.props.resolved).toBeUndefined();
  });

  it('awaits an asynchronous resolveData', async () => {
    const config: ResolverConfig = {
      components: {
        hero: {
          resolveData: async ({ content }) => ({
            formatted: `[${String(content.sku)}]`,
          }),
        },
      },
    };
    const plan = await resolveExperience(heroPayload, config);
    expect(plan.nodes[0]!.props.resolved).toEqual({ formatted: '[SKU-1]' });
  });

  it('runs resolvers in parallel', async () => {
    const order: string[] = [];
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('a', { id: 'a' }), componentNode('b', { id: 'b' })],
    };
    const config: ResolverConfig = {
      components: {
        a: {
          resolveData: async () => {
            order.push('a:start');
            await new Promise((r) => setTimeout(r, 30));
            order.push('a:end');
            return { from: 'a' };
          },
        },
        b: {
          resolveData: async () => {
            order.push('b:start');
            await new Promise((r) => setTimeout(r, 5));
            order.push('b:end');
            return { from: 'b' };
          },
        },
      },
    };
    await resolveExperience(payload, config);
    expect(order.indexOf('a:start')).toBeLessThan(order.indexOf('b:end'));
    expect(order.indexOf('b:start')).toBeLessThan(order.indexOf('a:end'));
  });

  it('exposes raw design properties (not viewport-resolved scalars) in ctx.design', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        componentNode('hero', {
          id: 'h',
          designProperties: {
            cfPadding: { type: 'ManualDesignValue', value: '40px' },
          },
        }),
      ],
    };
    let captured: unknown;
    const config: ResolverConfig = {
      components: {
        hero: {
          resolveData: ({ design }) => {
            captured = design;
            return {};
          },
        },
      },
    };
    await resolveExperience(payload, config);
    expect(captured).toEqual({
      cfPadding: { type: 'ManualDesignValue', value: '40px' },
    });
  });

  it('exposes the merged experience context to resolvers', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('hero', { id: 'h' })],
    };
    let captured: unknown;
    const config: ResolverConfig = {
      components: {
        hero: {
          resolveData: ({ experience }) => {
            captured = experience;
            return {};
          },
        },
      },
    };
    await resolveExperience(payload, config, {
      debug: true,
      metadata: { locale: 'en-US' },
    });
    expect(captured).toEqual({
      debug: true,
      metadata: { locale: 'en-US' },
      viewports: VIEWPORTS,
    });
  });
});

describe('resolveExperience — experienceTemplates', () => {
  /**
   * The real coded-template payload (`page`): one Experience Template node whose
   * `content` slot holds a Button. `sys.experienceTemplate` is also `page`, but
   * the node list is what drives rendering.
   */
  const codedPayload = (): ExperiencePayload => ({
    sys: sysWithExperienceTemplate('page'),
    viewports: VIEWPORTS,
    nodes: [
      experienceTemplateNode('page', {
        id: 'tpl',
        slots: {
          content: [
            componentNode('button', {
              id: 'btn',
              contentProperties: { label: 'Read the blog', url: 'https://google.com' },
            }),
          ],
        },
      }),
    ],
  });

  /**
   * The real composite payload (`hero`): plain component nodes at the root, with
   * `sys.experienceTemplate` still pointing at a template. Nothing should wrap.
   */
  const compositePayload = (): ExperiencePayload => ({
    sys: sysWithExperienceTemplate('hero'),
    viewports: VIEWPORTS,
    nodes: [
      componentNode('button', { id: 'btn' }),
      componentNode('text', { id: 'txt' }),
      componentNode('image', { id: 'img' }),
    ],
  });

  it('renders a coded template as a node with its slot children intact', async () => {
    const plan = await resolveExperience(codedPayload(), emptyConfig);

    expect(plan.nodes).toHaveLength(1);
    const template = plan.nodes[0]!;
    expect(template.nodeId).toBe('tpl');
    expect(template.registration).toEqual({ kind: 'experienceTemplate', id: 'page' });
    expect(template.slots.content).toHaveLength(1);
    expect(template.slots.content![0]!.registration).toEqual({ kind: 'component', id: 'button' });
    expect(template.slots.content![0]!.props.content).toEqual({
      label: 'Read the blog',
      url: 'https://google.com',
    });
  });

  it('leaves a composite experience untouched — no template node, no wrapping', async () => {
    const plan = await resolveExperience(compositePayload(), emptyConfig);

    expect(plan.nodes.map((n) => n.registration)).toEqual([
      { kind: 'component', id: 'button' },
      { kind: 'component', id: 'text' },
      { kind: 'component', id: 'image' },
    ]);
    expect(plan.nodes.some((n) => n.registration.kind === 'experienceTemplate')).toBe(false);
  });

  it('ignores sys.experienceTemplate entirely — it never reaches the plan', async () => {
    const plan = await resolveExperience(compositePayload(), emptyConfig);
    expect(plan).not.toHaveProperty('experienceTemplate');
    expect(Object.keys(plan).sort()).toEqual(['fallbackViewportIndex', 'nodes', 'viewports']);
  });

  it("keeps a template node's own contentProperties and designProperties", async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          contentProperties: { title: 'Homepage' },
          designProperties: {
            cfBackgroundColor: { type: 'ManualDesignValue', value: '#fff' },
          },
        }),
      ],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.nodes[0]!.props.content).toEqual({ title: 'Homepage' });
    expect(plan.nodes[0]!.props.designRaw).toEqual({
      cfBackgroundColor: { type: 'ManualDesignValue', value: '#fff' },
    });
  });

  it("runs a template node's resolveData against the experienceTemplates registry", async () => {
    const config: ResolverConfig = {
      components: {},
      experienceTemplates: {
        page: {
          resolveData: ({ experience }) => ({
            heading: experience.debug ? 'DEBUG' : 'LIVE',
          }),
        },
      },
    };
    const plan = await resolveExperience(codedPayload(), config, {
      debug: true,
      metadata: {},
    });
    expect(plan.nodes[0]!.props.resolved).toEqual({ heading: 'DEBUG' });
  });

  it('does not resolve a template id against the components registry', async () => {
    const resolveData = vi.fn(() => ({ ok: true }));
    const config: ResolverConfig = { components: { page: { resolveData } } };
    const plan = await resolveExperience(codedPayload(), config);
    expect(resolveData).not.toHaveBeenCalled();
    expect(plan.nodes[0]!.props.resolved).toBeUndefined();
  });

  it('still emits the template node when no template config is registered', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [experienceTemplateNode('not-registered', { id: 'tpl' })],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.nodes[0]!.registration).toEqual({
      kind: 'experienceTemplate',
      id: 'not-registered',
    });
    expect(plan.nodes[0]!.props.resolved).toBeUndefined();
  });
});

describe('resolveExperience — server-side design pre-resolution', () => {
  // desktop-first cascade: index 0 = desktop (wildcard), 2 = mobile.
  const designPayload = (): ExperiencePayload => ({
    viewports: VIEWPORTS,
    nodes: [
      componentNode('contentful-container', {
        id: 'page',
        designProperties: {
          cfPadding: {
            type: 'ValuesByViewport',
            values: {
              desktop: { type: 'ManualDesignValue', value: '40px' },
              mobile: { type: 'ManualDesignValue', value: '8px' },
            },
          },
          cfColor: { type: 'DesignToken', value: 'color.brand' },
        },
        slots: {
          children: [
            componentNode('contentful-heading', {
              id: 'heading',
              designProperties: {
                cfFontSize: {
                  type: 'ValuesByViewport',
                  values: {
                    desktop: { type: 'ManualDesignValue', value: '32px' },
                    mobile: { type: 'ManualDesignValue', value: '20px' },
                  },
                },
              },
            }),
          ],
        },
      }),
    ],
  });

  it('pre-resolves against viewport[0] when no fallback viewport is given', async () => {
    const plan = await resolveExperience(designPayload(), emptyConfig);
    // No fallback configured → default to viewport[0] (desktop, index 0).
    expect(plan.fallbackViewportIndex).toBe(0);
    expect(plan.nodes[0]!.props.design).toMatchObject({ cfPadding: '40px' });
    expect(plan.nodes[0]!.slots.children![0]!.props.design).toEqual({
      cfFontSize: '32px',
    });
  });

  it('uses config.fallbackViewportId as the default when no override is given', async () => {
    const config: ResolverConfig = { components: {}, fallbackViewportId: 'mobile' };
    const plan = await resolveExperience(designPayload(), config);
    expect(plan.fallbackViewportIndex).toBe(2);
    expect(plan.nodes[0]!.props.design).toMatchObject({ cfPadding: '8px' });
  });

  it('lets initialViewportId override config.fallbackViewportId', async () => {
    const config: ResolverConfig = { components: {}, fallbackViewportId: 'mobile' };
    const plan = await resolveExperience(designPayload(), config, {
      initialViewportId: 'desktop',
    });
    expect(plan.fallbackViewportIndex).toBe(0);
    expect(plan.nodes[0]!.props.design).toMatchObject({ cfPadding: '40px' });
  });

  it('records the fallback viewport index for the given id', async () => {
    const plan = await resolveExperience(designPayload(), emptyConfig, {
      initialViewportId: 'mobile',
    });
    expect(plan.fallbackViewportIndex).toBe(2);
  });

  it('falls back to viewport[0] for an unknown initialViewportId', async () => {
    const plan = await resolveExperience(designPayload(), emptyConfig, {
      initialViewportId: 'does-not-exist',
    });
    expect(plan.fallbackViewportIndex).toBe(0);
  });

  it('cascades design against the fallback viewport into props.design', async () => {
    const plan = await resolveExperience(designPayload(), emptyConfig, {
      initialViewportId: 'mobile',
    });
    // Mobile is the active fallback → mobile-specific values win the cascade.
    expect(plan.nodes[0]!.props.design).toMatchObject({ cfPadding: '8px' });
    expect(plan.nodes[0]!.slots.children![0]!.props.design).toEqual({
      cfFontSize: '20px',
    });
  });

  it('cascades against the desktop fallback when seeded with desktop', async () => {
    const plan = await resolveExperience(designPayload(), emptyConfig, {
      initialViewportId: 'desktop',
    });
    expect(plan.nodes[0]!.props.design).toMatchObject({ cfPadding: '40px' });
    expect(plan.nodes[0]!.slots.children![0]!.props.design).toEqual({
      cfFontSize: '32px',
    });
  });

  it('always preserves the raw design properties on props.designRaw', async () => {
    const plan = await resolveExperience(designPayload(), emptyConfig, {
      initialViewportId: 'mobile',
    });
    expect(plan.nodes[0]!.props.designRaw.cfPadding).toEqual({
      type: 'ValuesByViewport',
      values: {
        desktop: { type: 'ManualDesignValue', value: '40px' },
        mobile: { type: 'ManualDesignValue', value: '8px' },
      },
    });
    expect(plan.nodes[0]!.props.designRaw.cfColor).toEqual({
      type: 'DesignToken',
      value: 'color.brand',
    });
  });

  it('reads resolveToken from config so token properties ship resolved in design', async () => {
    const config: ResolverConfig = {
      components: {},
      resolveToken: (ref) => (ref.value === 'color.brand' ? '#ff0000' : undefined),
    };
    const plan = await resolveExperience(designPayload(), config, {
      initialViewportId: 'desktop',
    });
    expect(plan.nodes[0]!.props.design).toMatchObject({ cfColor: '#ff0000' });
  });

  it('omits token keys the resolver leaves undefined, without touching the raw property', async () => {
    const config: ResolverConfig = {
      components: {},
      resolveToken: () => undefined,
    };
    const plan = await resolveExperience(designPayload(), config, {
      initialViewportId: 'desktop',
    });
    expect(plan.nodes[0]!.props.design).not.toHaveProperty('cfColor');
    expect(plan.nodes[0]!.props.designRaw.cfColor).toEqual({
      type: 'DesignToken',
      value: 'color.brand',
    });
  });

  it('warns server-side with the component id when a token is left unresolved', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const config: ResolverConfig = { components: {}, resolveToken: () => undefined };
      await resolveExperience(designPayload(), config, { initialViewportId: 'desktop' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('color.brand'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('contentful-container'));
    } finally {
      warn.mockRestore();
    }
  });

  it('pre-resolves design on an experienceTemplate node like any other node', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [
        experienceTemplateNode('page', {
          id: 'tpl',
          designProperties: {
            cfPadding: {
              type: 'ValuesByViewport',
              values: {
                desktop: { type: 'ManualDesignValue', value: '40px' },
                mobile: { type: 'ManualDesignValue', value: '8px' },
              },
            },
          },
          slots: {
            content: [
              componentNode('contentful-heading', {
                id: 'h',
                designProperties: {
                  cfFontSize: {
                    type: 'ValuesByViewport',
                    values: {
                      desktop: { type: 'ManualDesignValue', value: '32px' },
                      mobile: { type: 'ManualDesignValue', value: '20px' },
                    },
                  },
                },
              }),
            ],
          },
        }),
      ],
    };
    const plan = await resolveExperience(payload, emptyConfig, {
      initialViewportId: 'mobile',
    });
    expect(plan.nodes[0]!.props.design).toEqual({ cfPadding: '8px' });
    expect(plan.nodes[0]!.slots.content![0]!.props.design).toEqual({ cfFontSize: '20px' });
  });

  it('warns with the kind and id when a token on a template node is unresolved', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [
          experienceTemplateNode('page', {
            id: 'tpl',
            designProperties: {
              cfColor: { type: 'DesignToken', value: 'color.brand' },
            },
          }),
        ],
      };
      const config: ResolverConfig = { components: {}, resolveToken: () => undefined };
      await resolveExperience(payload, config);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('experienceTemplate:page'));
    } finally {
      warn.mockRestore();
    }
  });
});

describe('resolveExperience — debug logging', () => {
  it('stays silent on the happy path when debug is off', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [componentNode('hero', { id: 'h' })],
      };
      await resolveExperience(payload, emptyConfig);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('logs the payload, node counts, and resolveData timings when debug is on', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [componentNode('hero', { id: 'h' })],
      };
      const config: ResolverConfig = {
        components: { hero: { resolveData: () => ({ ok: true }) } },
      };
      await resolveExperience(payload, config, { debug: true });

      const lines = spy.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('resolveExperience called with payload'))).toBe(true);
      expect(lines.some((l) => l.includes('declare resolveData'))).toBe(true);
      // One aggregate timing line for the whole fan-out, not one per resolver.
      expect(lines.some((l) => l.includes('⏱ 1 resolveData hook(s)'))).toBe(true);
      expect(lines.filter((l) => l.includes('⏱')).length).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
