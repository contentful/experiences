import { describe, it, expect, vi } from 'vitest';

import type {
  ComponentTypeNode,
  ExperiencePayload,
  TemplateNode,
} from '@contentful/experiences-sdk-core';

import { resolveExperience, type ResolverConfig } from './resolve-experience';

const VIEWPORTS = [
  { id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' },
  { id: 'tablet', query: '<992px', displayName: 'Tablet', previewSize: '100%' },
  { id: 'mobile', query: '<576px', displayName: 'Mobile', previewSize: '100%' },
];

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
    expect(plan.nodes[0]!.registration.componentTypeId).toBe('contentful-container');
    expect(plan.nodes[0]!.slots.children).toHaveLength(1);
    expect(plan.nodes[0]!.slots.children![0]!.nodeId).toBe('heading');
    expect(plan.nodes[0]!.slots.children![0]!.props.content.text).toBe('Hello');
    expect(plan.viewports).toBe(VIEWPORTS);
  });

  it('extracts componentTypeId from componentType.sys.urn', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('contentful-button', { id: 'b' })],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.nodes[0]!.registration.componentTypeId).toBe('contentful-button');
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
    expect(plan.nodes[0]!.registration.componentTypeId).toBe('not-registered');
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

  it('skips Template-variant nodes with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const template: TemplateNode = {
      template: {
        sys: {
          type: 'ResourceLink',
          linkType: 'Contentful:Template',
          urn: 'crn:contentful:::experience:spaces/$self/environments/$self/templates/some-template',
        },
      },
      id: 'tpl',
    };
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [template, componentNode('contentful-heading', { id: 'after' })],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.nodes.map((n) => n.nodeId)).toEqual(['after']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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

describe('resolveExperience — templates', () => {
  const templateUrn = (id: string) =>
    `crn:contentful:::experience:spaces/$self/environments/$self/templates/${id}`;

  it('emits no template on the plan when the payload has none', async () => {
    const payload: ExperiencePayload = {
      viewports: VIEWPORTS,
      nodes: [componentNode('hero', { id: 'h' })],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.template).toBeUndefined();
  });

  it('extracts templateId from payload.sys.template.sys.urn', async () => {
    const payload: ExperiencePayload = {
      sys: {
        template: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Template',
            urn: templateUrn('hi'),
          },
        },
      },
      viewports: VIEWPORTS,
      nodes: [componentNode('hero', { id: 'h' })],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.template).toBeDefined();
    expect(plan.template!.templateId).toBe('hi');
    expect(plan.template!.props.content).toEqual({});
    expect(plan.template!.props.design).toEqual({});
  });

  it("runs a template's resolveData and stores the result on template.props.resolved", async () => {
    const payload: ExperiencePayload = {
      sys: {
        template: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Template',
            urn: templateUrn('hi'),
          },
        },
      },
      viewports: VIEWPORTS,
      nodes: [componentNode('hero', { id: 'h' })],
    };
    const config: ResolverConfig = {
      components: {},
      templates: {
        hi: {
          resolveData: ({ experience }) => ({
            heading: experience.debug ? 'DEBUG' : 'LIVE',
          }),
        },
      },
    };
    const plan = await resolveExperience(payload, config, {
      debug: true,
      metadata: {},
    });
    expect(plan.template!.props.resolved).toEqual({ heading: 'DEBUG' });
  });

  it('still emits the template stub when no template config is registered', async () => {
    const payload: ExperiencePayload = {
      sys: {
        template: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Template',
            urn: templateUrn('not-registered'),
          },
        },
      },
      viewports: VIEWPORTS,
      nodes: [componentNode('hero', { id: 'h' })],
    };
    const plan = await resolveExperience(payload, emptyConfig);
    expect(plan.template?.templateId).toBe('not-registered');
    expect(plan.template?.props.resolved).toBeUndefined();
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

  it('pre-resolves the template design properties too', async () => {
    const payload: ExperiencePayload = {
      sys: {
        template: {
          sys: {
            type: 'ResourceLink',
            linkType: 'Contentful:Template',
            urn: 'crn:contentful:::experience:spaces/$self/environments/$self/templates/tpl',
          },
        },
      },
      viewports: VIEWPORTS,
      nodes: [componentNode('contentful-heading', { id: 'h' })],
    };
    const plan = await resolveExperience(payload, emptyConfig, {
      initialViewportId: 'mobile',
    });
    // XDA doesn't emit template design yet, so it resolves to empty — but present.
    expect(plan.template!.props.design).toEqual({});
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
