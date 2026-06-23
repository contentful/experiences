import { describe, it, expect, vi } from 'vitest';

import type {
  ComponentTypeNode,
  ExperiencePayload,
  TemplateNode,
} from '@contentful/experiences-core';

import { resolveExperience, type ResolverConfig } from './resolve-experience';

const VIEWPORTS = [
  { id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' },
  { id: 'tablet', query: '<992px', displayName: 'Tablet', previewSize: '100%' },
  { id: 'mobile', query: '<576px', displayName: 'Mobile', previewSize: '100%' },
];

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

  it('preserves discriminated design-prop envelopes on the IR', async () => {
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
    expect(plan.nodes[0]!.props.design).toEqual({
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
    expect(
      plan.nodes[0]!.slots.children![0]!.slots.children![0]!.props.content.label,
    ).toBe('Go');
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

  it('exposes raw design envelopes (not viewport-resolved scalars) in ctx.design', async () => {
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
      experience: { isPreview: true, metadata: { locale: 'en-US' } },
    });
    expect(captured).toEqual({ isPreview: true, metadata: { locale: 'en-US' } });
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
            heading: experience.isPreview ? 'PREVIEW' : 'LIVE',
          }),
        },
      },
    };
    const plan = await resolveExperience(payload, config, {
      experience: { isPreview: true, metadata: {} },
    });
    expect(plan.template!.props.resolved).toEqual({ heading: 'PREVIEW' });
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
