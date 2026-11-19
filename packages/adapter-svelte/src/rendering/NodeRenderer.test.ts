import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { mount, hydrate, unmount, tick } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { describe, expect, it, vi, inject } from 'vitest';
import type { Config } from '../registry/types.js';
import type { Component } from 'svelte';
import type { ComponentErrorProps, RenderError } from './component-props.js';
import ClientExperienceRenderer from './ClientExperienceRenderer.svelte';
import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';
import PropsProbe from '../test/fixtures/PropsProbe.svelte';
import BrokenFixture from '../test/fixtures/BrokenFixture.svelte';
import ButtonFixture from '../test/fixtures/ButtonFixture.svelte';
import ContainerFixture from '../test/fixtures/ContainerFixture.svelte';
import ExperienceTemplateFixture from '../test/fixtures/ExperienceTemplateFixture.svelte';
import {
  componentNode,
  attributedPlan,
  dt,
  experienceTemplateNode,
  m,
  sysWithExperienceTemplate,
} from '../test/fixtures/render-plan.js';
import { minimalSourceMap } from '../test/fixtures/source-map.js';

declare module 'vitest' {
  export interface ProvidedContext {
    rendererFailure: { body: string; plan: PortableRenderPlan };
  }
}

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
        // matching its one synchronous traversal pass. SSR boundary errors
        // instead pass through the host's transformError, not this onerror.
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

  it('forwards transformed public errors and native reset without refetching or changing siblings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const target = document.createElement('div');
    document.body.append(target);
    let instance: ReturnType<typeof mount> | undefined;
    try {
      const config: Config = {
        components: { broken: BrokenFixture, button: ButtonFixture },
      };
      const experience = await resolveExperience(
        {
          nodes: [
            componentNode('broken', { id: 'broken-node' }),
            componentNode('button', { contentProperties: { label: 'healthy sibling' } }),
          ],
        },
        config
      );
      const transformError = vi.fn(() => ({ message: 'Public rendering error', code: 'render' }));
      const content = new SvelteMap([['plan', experience]]);
      instance = mount(ClientExperienceRenderer, {
        target,
        props: {
          get experience() {
            return content.get('plan')!;
          },
          config,
          debug: true,
          renderError: PropsProbe,
        },
        transformError,
      });
      const view = within(target);
      await waitFor(() =>
        expect(read(target, 'data-props')).toMatchObject({
          componentId: 'broken',
          nodeId: 'broken-node',
          message: 'Public rendering error',
        })
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Public rendering error'));
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('[object Object]'));
      const sibling = view.getByText('healthy sibling');
      await fireEvent.click(view.getByText('Retry rendering'));
      await waitFor(() => expect(transformError).toHaveBeenCalledTimes(2));
      expect(view.getByText('Retry rendering')).toBeTruthy();
      const corrected = await resolveExperience(
        {
          nodes: [
            componentNode('broken', { id: 'broken-node', contentProperties: { fail: false } }),
            componentNode('button', { contentProperties: { label: 'healthy sibling' } }),
          ],
        },
        config
      );
      content.set('plan', corrected);
      await tick();
      await fireEvent.click(view.getByText('Retry rendering'));
      await waitFor(() => expect(view.getByText('Recovered component')).toBeTruthy());
      expect(view.queryByText('Retry rendering')).toBeNull();
      expect(view.getByText('healthy sibling')).toBe(sibling);
      expect(transformError).toHaveBeenCalledTimes(2);
    } finally {
      if (instance) await unmount(instance);
      target.remove();
      warn.mockRestore();
    }
  });

  it.each(['Thrown message', { message: 'Thrown message' }])(
    'preserves legacy fallback props for non-Error throws: %s',
    async (failure) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        let received: Omit<ComponentErrorProps, 'reset'> | undefined;
        const legacy: Component<Omit<ComponentErrorProps, 'reset'>> = (_anchor, props) => {
          received = props;
          return {};
        };
        const renderError: RenderError = legacy;
        const config: Config = { components: { broken: BrokenFixture } };
        const experience = await resolveExperience(
          {
            nodes: [
              componentNode('broken', {
                id: 'b',
                contentProperties: { failure },
              }),
            ],
          },
          config
        );
        render(ClientExperienceRenderer, { props: { experience, config, renderError } });
        await waitFor(() =>
          expect(received).toMatchObject({
            componentId: 'broken',
            nodeId: 'b',
            message: 'Thrown message',
          })
        );
      } finally {
        warn.mockRestore();
      }
    }
  );

  it('hydrates the actual server fallback and resets it with corrected client input', async () => {
    const { body, plan } = inject('rendererFailure');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const target = document.createElement('div');
    document.body.append(target);
    let instance: ReturnType<typeof hydrate> | undefined;
    try {
      const config: Config = { components: { broken: BrokenFixture, button: ButtonFixture } };
      expect(body).not.toContain('boom');
      expect(body).toContain('healthy sibling');
      target.innerHTML = body;
      const serverFallback = target.querySelector('[data-props]');
      const content = new SvelteMap([['plan', plan]]);
      const transformError = vi.fn(() => ({ message: 'Safe client rendering error' }));
      instance = hydrate(ClientExperienceRenderer, {
        target,
        props: {
          get experience() {
            return content.get('plan')!;
          },
          config,
          renderError: PropsProbe,
        },
        transformError,
      });
      const view = within(target);
      await waitFor(() => expect(view.getByText('Retry rendering')).toBeTruthy());
      expect(target.querySelector('[data-props]')).toBe(serverFallback);
      expect(read(target, 'data-props').message).toBe('Safe server rendering error');
      expect(transformError).not.toHaveBeenCalled();
      const corrected = await resolveExperience(
        {
          nodes: [
            componentNode('broken', { id: 'b', contentProperties: { fail: false } }),
            componentNode('button', {
              id: 'healthy',
              contentProperties: { label: 'healthy sibling' },
            }),
          ],
        },
        config
      );
      content.set('plan', corrected);
      await tick();
      await fireEvent.click(view.getByText('Retry rendering'));
      await waitFor(() => expect(view.getByText('Recovered component')).toBeTruthy());
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('hydration_mismatch'));
    } finally {
      if (instance) await unmount(instance);
      target.remove();
      warn.mockRestore();
    }
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

describe('actual-root attribution', () => {
  it('forwards onto a component root while retaining explicit scopes', async () => {
    const config = { components: { button: ButtonFixture } };
    const view = render(ClientExperienceRenderer, {
      experience: attributedPlan('button'),
      config,
    });
    const button = view.container.querySelector('button')!;
    expect(button.getAttribute('data-ctfl-scopes')).toBe('hero');
    expect(button.parentElement!.hasAttribute('data-ctfl-attribution')).toBe(true);
    expect(button.parentElement!.children).toHaveLength(1);
    for (const scopes of ['manual manual', '', undefined]) {
      await view.rerender({
        experience: attributedPlan('button', { 'data-ctfl-scopes': scopes }),
        config,
      });
      expect(button.getAttribute('data-ctfl-scopes')).toBe(scopes ?? null);
    }
  });

  it('binds named template roots independently of nested component roots and payload props', () => {
    const config = {
      components: { button: ButtonFixture },
      experienceTemplates: {
        page: { component: ExperienceTemplateFixture, root: { prop: 'experienceRoot' } },
      },
    };
    const experience = attributedPlan(
      'page',
      { experienceRoot: 'payload collision' },
      'experienceTemplate'
    );
    experience.nodes[0]!.slots = { content: attributedPlan('button').nodes, sidebar: [] };
    const view = render(ClientExperienceRenderer, { experience, config });
    const main = view.container.querySelector('main')!;
    const aside = view.container.querySelector('aside')!;
    expect(main.parentElement).toBe(aside.parentElement);
    expect(main.querySelector('button')!.getAttribute('data-ctfl-scopes')).toBe('hero');
    expect(main.getAttribute('data-ctfl-scopes')).toBe('hero');
    expect(aside.getAttribute('data-ctfl-scopes')).toBe('hero');
  });
});
