/*
 * Port of adapter-svelte/src/server-renderer.test.ts — the parity gate.
 *
 * Every payload helper, config object, and assertion is carried over 1:1. Where
 * the Angular port differs, it differs in the *fixture*, never in the assertion:
 * the whole point is that a payload rendered through Angular produces the same
 * observable result as the same payload rendered through Svelte or React.
 *
 * Three deliberate divergences, each a parity-table row:
 *
 * - Test "does NOT spread experience/contentful as props" is *stronger* here.
 *   `CapturingComponent` declares `experience`, `contentful` and `children` as
 *   real inputs, so their absence from the recorded props is a positive
 *   assertion rather than an untestable absence.
 * - The `toCss` block is named for Angular; the function is the scalar-only
 *   variant, sized for `[ngStyle]`.
 * - "accepts a bare component class as a registry entry" replaces Svelte's
 *   "bare Svelte component" — Angular component classes are plain functions, so
 *   `typeof reg === 'function'` discriminates registrations identically.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ComponentNode,
  type ExperiencePayload,
  type ExperienceTemplateNode,
  type ManualDesignValue,
  type PortableRenderPlan,
  resolveExperience,
} from '@contentful/experiences-sdk-core';

import { toCss } from './design-utils.js';
import { ButtonFixture } from './test-fixtures/button.fixture.js';
import { CapturingComponent } from './test-fixtures/capturing.fixture.js';
import { captureSink } from './test-fixtures/capture-sink.js';
import { ContainerFixture } from './test-fixtures/container.fixture.js';
import { ExperienceTemplateFixture } from './test-fixtures/experience-template.fixture.js';
import { HeadingFixture } from './test-fixtures/heading.fixture.js';
import { ItemFixture } from './test-fixtures/item.fixture.js';
import { PrecedenceFixture } from './test-fixtures/precedence.fixture.js';
import { render } from './test-fixtures/render-harness.js';
import { WrappingContainerFixture } from './test-fixtures/wrapping-container.fixture.js';
import type { Config } from './types.js';

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
  nodes: [
    componentNode('contentful-container', {
      id: 'page',
      contentProperties: {},
      designProperties: { cfPadding: m('40px') },
      slots: {
        children: [
          componentNode('contentful-heading', {
            id: 'heading',
            contentProperties: { text: 'Build faster' },
            designProperties: { cfFontSize: m('32px') },
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
  it('renders a nested experience with desktop-resolved design props by default', async () => {
    const { html, container } = render(await resolveExperience(payload, config), { config });

    expect(html).toContain('data-padding="40px"');
    expect(html).toContain('data-font-size="32px"');
    expect(html).toContain('data-bg="#4f39f6"');
    expect(container.textContent).toContain('Build faster');
    expect(container.textContent).toContain('Get started');
  });

  it('renders nothing meaningful when plan is null/undefined', () => {
    const nullRender = render(null, { config });
    expect(nullRender.container.querySelector('*')).toBeNull();

    const undefinedRender = render(undefined, { config });
    expect(undefinedRender.container.querySelector('*')).toBeNull();
  });

  it('renders missing-component fallback in debug mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const justContainer: Config = {
      components: { 'contentful-container': ContainerFixture },
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

    const debugRender = render(planWithMissing, { config: justContainer, debug: true });
    expect(debugRender.html).toContain('data-experiences-missing="NotRegistered"');

    const plainRender = render(planWithMissing, { config: justContainer });
    expect(plainRender.html).not.toContain('data-experiences-missing');

    warn.mockRestore();
  });

  it('auto-mounts DebugExperience only when debug is on', async () => {
    const captureConfig: Config = { components: { capture: CapturingComponent } };
    const capturePayload: ExperiencePayload = {
      nodes: [componentNode('capture', { id: 'c' })],
    };
    const plan = await resolveExperience(capturePayload, captureConfig);

    const off = render(plan, { config: captureConfig });
    expect(off.html).not.toContain('data-experiences-debug');

    const on = render(plan, { config: captureConfig, debug: true });
    expect(on.html).toContain('data-experiences-debug');
    expect(on.container.textContent).toContain('Experience debug');
  });

  it('threads top-level metadata into getExperience()', async () => {
    const captureConfig: Config = { components: { capture: CapturingComponent } };
    const capturePayload: ExperiencePayload = {
      nodes: [componentNode('capture', { id: 'c' })],
    };

    render(await resolveExperience(capturePayload, captureConfig), {
      config: captureConfig,
      metadata: { slug: 'home' },
    });

    expect(captureSink[0]!.experience.metadata).toEqual({ slug: 'home' });
  });

  it('merges defaults beneath content (content wins)', async () => {
    const itemConfig: Config = {
      components: {
        item: { defaults: { variant: 'fallback', priority: 'low' }, component: ItemFixture },
      },
    };
    const itemPayload: ExperiencePayload = {
      nodes: [componentNode('item', { id: 'i', contentProperties: { variant: 'fromContent' } })],
    };

    const { html } = render(await resolveExperience(itemPayload, itemConfig), {
      config: itemConfig,
    });

    expect(html).toContain('data-variant="fromContent"');
    expect(html).toContain('data-priority="low"');
  });

  it('treats an explicitly-empty content value as set (beats a non-empty default)', async () => {
    const itemConfig: Config = {
      components: { item: { defaults: { variant: 'fromDefault' }, component: ItemFixture } },
    };
    const itemPayload: ExperiencePayload = {
      nodes: [componentNode('item', { id: 'i', contentProperties: { variant: '' } })],
    };

    const { html } = render(await resolveExperience(itemPayload, itemConfig), {
      config: itemConfig,
    });

    expect(html).toContain('data-variant=""');
  });

  it('respects merge precedence: defaults < content < resolved', () => {
    const precedenceConfig: Config = {
      components: { item: { defaults: { value: 'fromDefault' }, component: PrecedenceFixture } },
    };

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

    const { html } = render(planWithResolved, { config: precedenceConfig });

    expect(html).toContain('data-value="fromResolveData"');
  });

  it('renders an experienceTemplate node from the experienceTemplates registry', async () => {
    const tplConfig: Config = {
      components: { item: PrecedenceFixture },
      experienceTemplates: {
        page: { component: ExperienceTemplateFixture, defaults: { title: 'Default Title' } },
      },
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

    const { html, container } = render(await resolveExperience(tplPayload, tplConfig), {
      config: tplConfig,
    });

    expect(html).toContain('data-experience-template="page"');
    expect(html).toContain('data-title="Default Title"');
    expect(container.textContent).toContain('inside');
  });

  it('renders a composite experience unwrapped — sys.experienceTemplate is ignored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg: Config = {
      components: { item: PrecedenceFixture },
      experienceTemplates: { hero: ExperienceTemplateFixture },
    };
    const compositePayload: ExperiencePayload = {
      sys: sysWithExperienceTemplate('hero'),
      nodes: [
        componentNode('item', { id: 'a', contentProperties: { value: 'one' } }),
        componentNode('item', { id: 'b', contentProperties: { value: 'two' } }),
      ],
    };

    const { html } = render(await resolveExperience(compositePayload, cfg), { config: cfg });

    expect(html).toContain('data-value="one"');
    expect(html).toContain('data-value="two"');
    expect(html).not.toContain('data-experience-template');
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('renders slot children unwrapped + warns when the experienceTemplate is not registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg: Config = { components: { item: PrecedenceFixture } };
    const orphanPayload: ExperiencePayload = {
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

    const { html } = render(await resolveExperience(orphanPayload, cfg), {
      config: cfg,
      debug: true,
    });

    expect(html).toContain('data-value="unwrapped"');
    expect(html).not.toContain('data-experience-template');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing-experienceTemplate'));
    expect(html).toContain('data-experiences-debug-errors');
    expect(html).toContain('No experience template registered for id "missing-experienceTemplate"');

    warn.mockRestore();
  });
});

describe('ExperienceRenderer — slot children as an array', () => {
  const childrenPayload = (): ExperiencePayload => ({
    nodes: [
      componentNode('contentful-container', {
        id: 'c',
        slots: {
          children: [
            componentNode('contentful-heading', { id: 'a', contentProperties: { text: 'one' } }),
            componentNode('contentful-heading', { id: 'b', contentProperties: { text: 'two' } }),
            componentNode('contentful-heading', { id: 'd', contentProperties: { text: 'three' } }),
          ],
        },
      }),
    ],
  });

  it('passes slot children as a node array a component can wrap individually', async () => {
    const cfg: Config = {
      components: {
        'contentful-container': WrappingContainerFixture,
        'contentful-heading': HeadingFixture,
      },
    };

    const { container } = render(await resolveExperience(childrenPayload(), cfg), { config: cfg });

    expect(captureSink[0]!.props['childrenIsArray']).toBe(true);
    expect(captureSink[0]!.props['childCount']).toBe(3);
    expect(container.querySelectorAll('.wrap').length).toBe(3);
    expect(container.querySelector('[data-index="0"]')).not.toBeNull();
    expect(container.querySelector('[data-index="2"]')).not.toBeNull();
    expect(container.textContent).toContain('one');
    expect(container.textContent).toContain('three');
  });

  it('renders an empty container when the slot has no children', async () => {
    const cfg: Config = { components: { 'contentful-container': WrappingContainerFixture } };
    const emptyPayload: ExperiencePayload = {
      nodes: [componentNode('contentful-container', { id: 'c' })],
    };

    const { container } = render(await resolveExperience(emptyPayload, cfg), { config: cfg });

    expect(captureSink[0]!.props['childCount']).toBe(0);
    expect(container.querySelectorAll('.wrap').length).toBe(0);
    expect(container.querySelector('[data-container]')).not.toBeNull();
  });
});

describe('ExperienceRenderer — bare-component registrations', () => {
  it('accepts a bare component class as a registry entry', async () => {
    const cfg: Config = { components: { item: PrecedenceFixture } };
    const barePayload: ExperiencePayload = {
      nodes: [componentNode('item', { id: 'b', contentProperties: { value: 'hi' } })],
    };

    const { html } = render(await resolveExperience(barePayload, cfg), { config: cfg });

    expect(html).toContain('data-value="hi"');
  });

  it('does NOT spread experience/contentful as props onto components', async () => {
    const cfg: Config = { components: { capture: CapturingComponent } };
    const capturePayload: ExperiencePayload = {
      nodes: [componentNode('capture', { id: 'c', contentProperties: { text: 'hi' } })],
    };

    render(await resolveExperience(capturePayload, cfg), { config: cfg });

    const keys = Object.keys(captureSink[0]!.props);
    expect(keys).toContain('text');
    expect(keys).not.toContain('experience');
    expect(keys).not.toContain('contentful');
    // Slot props exist only for slots the payload actually carries — `children`
    // is just a slot name, so a node without slots gets no `children` prop.
    expect(keys).not.toContain('children');
  });
});

describe('ExperienceRenderer — injectContentfulComponent()', () => {
  it('exposes the raw Contentful payload to descendants', async () => {
    const cfg: Config = { components: { capture: CapturingComponent } };
    const capturePayload: ExperiencePayload = {
      nodes: [
        componentNode('capture', {
          id: 'btn-1',
          contentProperties: { label: 'Buy now' },
          designProperties: { cfPadding: m('40px') },
        }),
      ],
    };

    render(await resolveExperience(capturePayload, cfg), { config: cfg });

    expect(captureSink[0]!.contentful).toMatchObject({
      componentId: 'capture',
      nodeId: 'btn-1',
      content: { label: 'Buy now' },
      design: { cfPadding: m('40px') },
      resolved: undefined,
    });
  });

  it('contentful.resolved carries the resolveData return value', async () => {
    const cfg: Config = {
      components: {
        capture: { resolveData: () => ({ enriched: 'yes' }), component: CapturingComponent },
      },
    };
    const capturePayload: ExperiencePayload = {
      nodes: [componentNode('capture', { id: 'i' })],
    };

    render(await resolveExperience(capturePayload, cfg), { config: cfg });

    expect(captureSink[0]!.contentful?.resolved).toEqual({ enriched: 'yes' });
  });
});

describe('ExperienceRenderer — resolveToken', () => {
  it('passes DesignToken values through the resolver before render', async () => {
    const cfg: Config = {
      components: { 'contentful-button': ButtonFixture },
      resolveToken: (ref) => (ref.value === 'color/surface/hero' ? '#4f39f6' : undefined),
    };
    const tokenPayload: ExperiencePayload = {
      nodes: [
        componentNode('contentful-button', {
          id: 'b',
          contentProperties: { label: 'Go' },
          designProperties: { cfBackgroundColor: dt('color/surface/hero') },
        }),
      ],
    };

    const { html } = render(await resolveExperience(tokenPayload, cfg), { config: cfg });

    expect(html).toContain('data-bg="#4f39f6"');
    expect(html).not.toContain('DesignToken');
  });

  it('warns and passes the raw token through the design values when the resolver returns undefined', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg: Config = {
      components: { 'contentful-button': CapturingComponent },
      resolveToken: () => undefined,
    };
    const tokenPayload: ExperiencePayload = {
      nodes: [
        componentNode('contentful-button', {
          id: 'b',
          designProperties: { cfBackgroundColor: dt('color/unknown') },
        }),
      ],
    };

    render(await resolveExperience(tokenPayload, cfg), { config: cfg });

    expect(captureSink[0]!.designValues!.cfBackgroundColor).toEqual(dt('color/unknown'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('color/unknown'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('contentful-button'));

    warn.mockRestore();
  });

  it('leaves token values untouched when no resolver is supplied (backward-compatible)', async () => {
    const cfg: Config = { components: { 'contentful-button': ButtonFixture } };
    const tokenPayload: ExperiencePayload = {
      nodes: [
        componentNode('contentful-button', {
          id: 'b',
          contentProperties: { label: 'Go' },
          designProperties: { cfBackgroundColor: dt('color/surface/hero') },
        }),
      ],
    };

    const { html } = render(await resolveExperience(tokenPayload, cfg), { config: cfg });

    expect(html).toContain('data-bg="[object Object]"');
  });

  it('runs on an experienceTemplate node design props too', async () => {
    const tplConfig: Config = {
      components: { item: PrecedenceFixture },
      experienceTemplates: { page: ExperienceTemplateFixture },
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

    // values rather than consuming the server-resolved ones.
    const { html } = render(await resolveExperience(tplPayload, tplConfig), { config: tplConfig });

    expect(html).toContain('data-bg="#111827"');
  });
});

describe('ExperienceRenderer — design values auto-fill props', () => {
  it('spreads resolved design values onto component props by their raw key', async () => {
    const cfg: Config = { components: { capture: CapturingComponent } };
    const designPayload: ExperiencePayload = {
      nodes: [
        componentNode('capture', {
          id: 'p',
          contentProperties: { label: 'keep me' },
          designProperties: { cfBackgroundColor: m('#f00'), cfPadding: m('10px') },
        }),
      ],
    };

    render(await resolveExperience(designPayload, cfg), { config: cfg });

    expect(captureSink[0]!.props).toMatchObject({
      label: 'keep me',
      cfBackgroundColor: '#f00',
      cfPadding: '10px',
    });
    expect(captureSink[0]!.designValues).toEqual({
      cfBackgroundColor: '#f00',
      cfPadding: '10px',
    });
  });

  it('lets content override design on a key collision (content wins)', async () => {
    const cfg: Config = { components: { capture: CapturingComponent } };
    const collisionPayload: ExperiencePayload = {
      nodes: [
        componentNode('capture', {
          id: 'p',
          contentProperties: { cfPadding: 'from-content' },
          designProperties: { cfPadding: m('from-design') },
        }),
      ],
    };

    render(await resolveExperience(collisionPayload, cfg), { config: cfg });

    expect(captureSink[0]!.props).toMatchObject({ cfPadding: 'from-content' });
  });
});

describe('ExperienceRenderer — injectDesignValues()', () => {
  it('returns the resolved design values for the current node', async () => {
    const cfg: Config = {
      components: { capture: CapturingComponent },
      resolveToken: (ref) => (ref.value === 'brand/primary' ? '#4f39f6' : undefined),
    };
    const designPayload: ExperiencePayload = {
      nodes: [
        componentNode('capture', {
          id: 'p',
          designProperties: { cfBackgroundColor: dt('brand/primary'), cfPadding: m('24px') },
        }),
      ],
    };

    render(await resolveExperience(designPayload, cfg), { config: cfg });

    expect(captureSink[0]!.designValues).toEqual({
      cfBackgroundColor: '#4f39f6',
      cfPadding: '24px',
    });
  });

  it('reads the resolved design values for a node', async () => {
    const cfg: Config = { components: { capture: CapturingComponent } };
    const designPayload: ExperiencePayload = {
      nodes: [
        componentNode('capture', {
          id: 'p',
          designProperties: { cfPadding: m('40px') },
        }),
      ],
    };

    render(await resolveExperience(designPayload, cfg), { config: cfg });

    expect(captureSink[0]!.designValues).toEqual({ cfPadding: '40px' });
  });
});

describe('ExperienceRenderer — resolved design values', () => {
  const probePayload: ExperiencePayload = {
    nodes: [
      componentNode('contentful-container', {
        id: 'p',
        designProperties: { cfPadding: m('40px') },
      }),
    ],
  };

  it('consumes props.design as-is when no resolveToken is configured', async () => {
    const plan = await resolveExperience(probePayload, config);
    // Tamper the precomputed values with a sentinel resolution could never produce.
    plan.nodes[0]!.props.design = { cfPadding: 'SENTINEL' };

    const { html } = render(plan, { config });

    expect(html).toContain('data-padding="SENTINEL"');
  });

  it('recomputes from raw design properties when the config supplies resolveToken', async () => {
    const plan = await resolveExperience(probePayload, config);
    plan.nodes[0]!.props.design = { cfPadding: 'SENTINEL' };
    // A render-time `resolveToken` means the adapter re-derives design from
    // `designRaw` rather than trusting the plan's precomputed record.
    const withToken: Config = { ...config, resolveToken: () => undefined };

    const { html } = render(plan, { config: withToken });

    expect(html).toContain('data-padding="40px"');
    expect(html).not.toContain('SENTINEL');
  });
});

describe('toCss (Angular)', () => {
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
      toCss({
        backgroundColor: '#4f39f6',
        variant: 'h1',
        as: 'h2',
        ratio: '1:2',
        target: '_self',
      })
    ).toEqual({ backgroundColor: '#4f39f6' });
  });

  it('drops non-scalar (object/array/bool) values by design', () => {
    expect(
      toCss({ padding: '10px', reverse: true, nested: { color: 'red' } as unknown as string })
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

describe('ExperienceRenderer — render context carried on the plan', () => {
  beforeEach(() => {
    captureSink.splice(0);
  });

  const captureConfig: Config = { components: { capture: CapturingComponent } };

  const buildPlan = (opts?: Parameters<typeof resolveExperience>[2]) =>
    resolveExperience({ nodes: [componentNode('capture')] }, captureConfig, opts);

  it('reads metadata off the plan without it being bound on the renderer', async () => {
    const plan = await buildPlan({ metadata: { slug: 'home', locale: 'en-US' } });

    render(plan, { config: captureConfig });

    expect(captureSink[0]!.experience.metadata).toEqual({ slug: 'home', locale: 'en-US' });
  });

  it('reads debug off the plan without it being bound on the renderer', async () => {
    const plan = await buildPlan({ debug: true });

    render(plan, { config: captureConfig });

    expect(captureSink[0]!.experience.debug).toBe(true);
  });

  it('shallow-merges the metadata input over the plan value', async () => {
    const plan = await buildPlan({ metadata: { slug: 'home', locale: 'en-US' } });

    render(plan, { config: captureConfig, metadata: { locale: 'de-DE', extra: true } });

    expect(captureSink[0]!.experience.metadata).toEqual({
      slug: 'home',
      locale: 'de-DE',
      extra: true,
    });
  });

  it('lets an explicit debug=false override a plan fetched with debug on', async () => {
    const plan = await buildPlan({ debug: true });

    render(plan, { config: captureConfig, debug: false });

    expect(captureSink[0]!.experience.debug).toBe(false);
  });

  it('renders the debug panel from the plan alone', async () => {
    const plan = await buildPlan({ debug: true });

    const { html } = render(plan, { config: captureConfig });

    expect(html).toContain('cf-debug-experience');
  });
});
