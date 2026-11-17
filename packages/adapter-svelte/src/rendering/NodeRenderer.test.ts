import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../registry/types.js';
import ClientExperienceRenderer from './ClientExperienceRenderer.svelte';
import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';
import PropsProbe from '../test/fixtures/PropsProbe.svelte';
import BrokenFixture from '../test/fixtures/BrokenFixture.svelte';
import ButtonFixture from '../test/fixtures/ButtonFixture.svelte';
import ContainerFixture from '../test/fixtures/ContainerFixture.svelte';
import ExperienceTemplateFixture from '../test/fixtures/ExperienceTemplateFixture.svelte';
import {
  componentNode,
  dt,
  experienceTemplateNode,
  m,
  sysWithExperienceTemplate,
} from '../test/fixtures/render-plan.js';
import { minimalSourceMap } from '../test/fixtures/source-map.js';

const read = (container: HTMLElement, attribute: string) =>
  JSON.parse(container.querySelector('[data-props]')!.getAttribute(attribute)!);

describe('node registration and props', () => {
  it('merges defaults < design < content < resolved without losing empty content or raw context', async () => {
    const config: Config = {
      components: {
        probe: {
          component: PropsProbe,
          defaults: {
            fallback: 'default',
            designWins: 'default',
            contentWins: 'default',
            resolvedWins: 'default',
            empty: 'default',
          },
          resolveData: () => ({ resolvedWins: 'resolved' }),
        },
      },
      resolveToken: () => 'token-value',
    };
    const plan = await resolveExperience(
      {
        nodes: [
          componentNode('probe', {
            id: 'node',
            designProperties: {
              designWins: dt('brand'),
              contentWins: m('design'),
              resolvedWins: m('design'),
            },
            contentProperties: { contentWins: 'content', resolvedWins: 'content', empty: '' },
          }),
        ],
      },
      config
    );
    const { container } = render(ServerExperienceRenderer, { props: { experience: plan, config } });
    expect(read(container, 'data-props')).toEqual({
      fallback: 'default',
      designWins: 'token-value',
      contentWins: 'content',
      resolvedWins: 'resolved',
      empty: '',
    });
    expect(read(container, 'data-design')).toEqual({
      designWins: 'token-value',
      contentWins: 'design',
      resolvedWins: 'design',
    });
    expect(read(container, 'data-contentful')).toMatchObject({
      componentId: 'probe',
      nodeId: 'node',
      content: { contentWins: 'content', resolvedWins: 'content', empty: '' },
      design: { designWins: dt('brand'), contentWins: m('design'), resolvedWins: m('design') },
      resolved: { resolvedWins: 'resolved' },
    });
    // Inspect keys separately so even function-valued unexpected props cannot hide in JSON.
    expect(read(container, 'data-prop-keys')).toEqual([
      'contentWins',
      'designWins',
      'empty',
      'fallback',
      'resolvedWins',
    ]);
  });

  it.each([undefined, () => undefined])(
    'preserves unresolved tokens in props and design context (%s)',
    async (resolveToken) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const config: Config = { components: { probe: PropsProbe }, resolveToken };
        const plan = await resolveExperience(
          {
            nodes: [
              componentNode('probe', {
                designProperties: { color: dt('brand/unknown') },
              }),
            ],
          },
          config
        );
        const { container } = render(ServerExperienceRenderer, {
          props: { experience: plan, config },
        });
        expect(read(container, 'data-props')).toEqual({ color: dt('brand/unknown') });
        expect(read(container, 'data-design')).toEqual({ color: dt('brand/unknown') });
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('brand/unknown'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('probe'));
      } finally {
        warn.mockRestore();
      }
    }
  );

  it('uses separate component/template namespaces and named template slots with defaults and resolved design', async () => {
    const config: Config = {
      components: { page: PropsProbe },
      experienceTemplates: {
        page: { component: ExperienceTemplateFixture, defaults: { title: 'Default Title' } },
      },
      resolveToken: () => '#111827',
    };
    const plan = await resolveExperience(
      {
        sys: sysWithExperienceTemplate('page'),
        nodes: [
          experienceTemplateNode('page', {
            designProperties: { cfBackground: dt('brand/canvas') },
            slots: { content: [componentNode('page', { contentProperties: { value: 'inside' } })] },
          }),
        ],
      },
      config
    );
    const { container } = render(ServerExperienceRenderer, { props: { experience: plan, config } });
    const template = container.querySelector('main')!;
    expect(template.getAttribute('data-title')).toBe('Default Title');
    expect(template.getAttribute('data-bg')).toBe('#111827');
    expect(template.querySelector('[data-value="inside"]')).not.toBeNull();
  });

  it('keeps an unregistered template’s children unwrapped and reports the missing registration', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const config: Config = { components: { item: PropsProbe } };
      const plan = await resolveExperience(
        {
          nodes: [
            experienceTemplateNode('missing', {
              slots: {
                content: [componentNode('item', { contentProperties: { value: 'unwrapped' } })],
              },
            }),
          ],
        },
        config
      );
      const { container } = render(ServerExperienceRenderer, {
        props: { experience: plan, config, debug: true },
      });
      expect(container.querySelector('[data-value="unwrapped"]')).not.toBeNull();
      expect(container.querySelector('main')).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing'));
      expect(container.querySelector('[data-experiences-debug-errors]')?.textContent).toContain(
        'No experience template registered for id "missing"'
      );
    } finally {
      warn.mockRestore();
    }
  });

  it.each([false, true])(
    'shows missing-component fallback only in debug mode (%s)',
    async (debug) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const config: Config = { components: { container: ContainerFixture } };
        const plan = await resolveExperience(
          {
            nodes: [
              componentNode('container', {
                slots: { children: [componentNode('missing')] },
              }),
            ],
          },
          config
        );
        const { container } = render(ServerExperienceRenderer, {
          props: { experience: plan, config, debug },
        });
        expect(!!container.querySelector('[data-experiences-missing="missing"]')).toBe(debug);
      } finally {
        warn.mockRestore();
      }
    }
  );
});

describe('client node diagnostics', () => {
  // `ClientExperienceRenderer`'s onDiagnostic defers via `queueMicrotask` (see
  // its own comment for why); a test asserting against the debug panel needs to
  // let that microtask settle first.
  async function flushMicrotasks(): Promise<void> {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
  }

  describe.each([
    ['ServerExperienceRenderer', ServerExperienceRenderer],
    ['ClientExperienceRenderer', ClientExperienceRenderer],
  ] as const)('%s — component-render-error, client-side catch', (name, Renderer) => {
    it('isolates the failing node — sibling still renders, records a diagnostic', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const payload: ExperiencePayload = {
          nodes: [
            componentNode('broken', { id: 'b' }),
            componentNode('contentful-button', {
              id: 'f',
              contentProperties: { label: 'sibling' },
            }),
          ],
        };
        const config: Config = {
          components: { broken: BrokenFixture, 'contentful-button': ButtonFixture },
        };
        const plan = await resolveExperience(payload, config);

        const { container } = render(Renderer, {
          props: { experience: plan, config, debug: true },
        });

        expect(container.querySelector('button')?.textContent).toBe('sibling');
        expect(container.querySelector('[data-experiences-render-error="broken"]')).not.toBeNull();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
        await flushMicrotasks();

        // Only ClientExperienceRenderer's debug panel is reactive
        // ($state-backed renderDiagnostics): the boundary's onerror resolves
        // after the initial render even under this client-mounted harness, and
        // ServerExperienceRenderer's plain-array collection is evaluated once,
        // matching its documented "one synchronous SSR pass" contract — real
        // `svelte/server` never reaches the catching code at all (see the
        // README's SSR/CSR asymmetry section), so this component never shows
        // this diagnostic in the debug panel in any real deployment either.
        if (name === 'ClientExperienceRenderer') {
          const errorList = container.querySelector('[data-experiences-debug-errors]');
          expect(errorList).not.toBeNull();
          expect(errorList!.textContent).toContain('Component "broken"');
          expect(errorList!.textContent).toContain('boom');
        }
      } finally {
        warn.mockRestore();
      }
    });

    it('renders nothing from the default fallback when debug is off, but still warns', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const payload: ExperiencePayload = {
          nodes: [componentNode('broken', { id: 'b' })],
        };
        const config: Config = { components: { broken: BrokenFixture } };
        const plan = await resolveExperience(payload, config);

        const { container } = render(Renderer, {
          props: { experience: plan, config },
        });

        expect(container.querySelector('[data-experiences-render-error]')).toBeNull();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('ClientExperienceRenderer — render-time diagnostics dedupe across re-renders', () => {
    it('reports a persistently-unregistered component only once, not once per re-render', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const payload: ExperiencePayload = {
          nodes: [componentNode('missing', { id: 'm' })],
        };
        const config: Config = { components: {} };
        const plan = await resolveExperience(payload, config);

        const { container, rerender } = render(ClientExperienceRenderer, {
          props: { experience: plan, config, debug: true },
        });

        // Force NodeRenderer's reactive blocks to re-run without any real new
        // occurrence — an ancestor re-render (an unrelated
        // parent update) does the same thing in production.
        await rerender({ experience: plan, config, debug: true } as never);

        expect(container.querySelectorAll('[data-experiences-debug-errors] li')).toHaveLength(1);
        expect(container.textContent).toContain('No component registered for id "missing"');
      } finally {
        warn.mockRestore();
      }
    });
  });
});

const node = componentNode('probe', { id: 'n' });
const payload: ExperiencePayload = { nodes: [node] };
const config: Config = { components: { probe: PropsProbe } };

const sourceMap = (experienceId: string) => minimalSourceMap({ experienceId });

describe('getContentfulComponent().attribution (client build)', () => {
  it('exposes the node attribution and replaces it when a plan reuses the node id', async () => {
    const first = await resolveExperience(payload, config, { sourceMap: sourceMap('exp-a') });
    const second = await resolveExperience(payload, config, { sourceMap: sourceMap('exp-b') });
    const cleared = await resolveExperience(payload, config);

    const { container, rerender } = render(ClientExperienceRenderer, {
      props: { experience: first, config },
    });
    const text = () => container.querySelector('[data-scopes]')?.textContent;
    expect(text()).toBe('exp-a');
    // Exactly what the plan carries: the same value React and Angular are held to.
    expect(container.querySelector('[data-scopes]')?.getAttribute('data-json')).toBe(
      JSON.stringify(first.nodes[0]!.attribution)
    );

    await rerender({ experience: second, config } as never);
    expect(text()).toBe('exp-b');

    await rerender({ experience: cleared, config } as never);
    expect(text()).toBe('');
  });
});

describe('getContentfulExperienceTemplate().attribution (client build)', () => {
  const templateNode = experienceTemplateNode('page', { id: 'tpl' });
  const templateConfig: Config = {
    components: {},
    experienceTemplates: { page: ExperienceTemplateFixture },
  };
  const templateMap = (experienceId: string) =>
    minimalSourceMap({
      experienceId,
      node: 'tpl',
      leaf: { kind: 'ExperienceTemplate', id: 'page' },
    });

  it('exposes the template node attribution and replaces it when a plan reuses the node id', async () => {
    const payload: ExperiencePayload = { nodes: [templateNode] };
    const first = await resolveExperience(payload, templateConfig, {
      sourceMap: templateMap('exp-a'),
    });
    const second = await resolveExperience(payload, templateConfig, {
      sourceMap: templateMap('exp-b'),
    });

    const { container, rerender } = render(ClientExperienceRenderer, {
      props: { experience: first, config: templateConfig },
    });
    const text = () => container.querySelector('[data-template-scopes]')?.textContent?.trim();
    expect(text()).toBe('exp-a');

    await rerender({ experience: second, config: templateConfig } as never);
    expect(text()).toBe('exp-b');
  });
});
