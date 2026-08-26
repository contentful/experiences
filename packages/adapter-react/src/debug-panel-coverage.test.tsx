/**
 * @vitest-environment jsdom
 *
 * End-to-end proof that every one of the 8 non-happy-path failure modes
 * reaches `<DebugExperience>`'s rendered output — through a real
 * `resolveExperience` + renderer pipeline, not a hand-built diagnostic
 * fixture (see debug-experience.test.tsx for the fixture-level tests of the
 * panel's own rendering logic). Each test asserts a distinguishing substring
 * of the real message, not the whole string, so wording tweaks don't make
 * these overly brittle.
 *
 * jsdom is needed file-wide only for the `component-render-error` case
 * (the one failure mode `ClientExperienceRenderer`'s reactive collector is
 * needed for); `renderToStaticMarkup` works fine under jsdom too, so the
 * other 7 SSR-friendly cases share this file without a second environment.
 *
 * The `resolveExperience` result for `token-unresolved` below IS the SSR
 * coverage for a resolve-time diagnostic: `renderToStaticMarkup` is a real,
 * synchronous server render — no separate SSR-specific test file needed for
 * React the way Svelte and Angular need one (see their
 * `debug-panel-coverage.ssr.test.*`).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ComponentNode, ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import { ClientExperienceRenderer } from './client-renderer';
import { ServerExperienceRenderer } from './server-renderer';
import type { Config } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- required global for react's act() outside a test-library wrapper
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const VIEWPORTS = [{ id: 'desktop', query: '*', displayName: 'Desktop', previewSize: '100%' }];

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

const Button = ({ label }: { label?: string }) => <button>{label}</button>;

function Broken(): never {
  throw new Error('boom');
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe('debug panel — end-to-end coverage of every non-happy-path failure mode', () => {
  it('malformed-payload: a non-array nodes field', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const plan = await resolveExperience(
        { viewports: VIEWPORTS, nodes: 'not-an-array' } as never,
        { components: {} }
      );
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={{ components: {} }} debug />
      );
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('&quot;nodes&quot; is not an array');
    } finally {
      warn.mockRestore();
    }
  });

  it('malformed-slot: a slot value that is not an array', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('contentful-container', {
            id: 'page',
            slots: { children: 'oops' as unknown as never },
          }),
        ],
      };
      const config: Config = { components: { 'contentful-container': Button } };
      const plan = await resolveExperience(payload, config);
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={config} debug />
      );
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('Slot &quot;children&quot;');
    } finally {
      warn.mockRestore();
    }
  });

  it('unidentifiable-node: a node with no readable component/experienceTemplate ref', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [{ pattern: {} } as unknown as ComponentNode, componentNode('button', { id: 'b' })],
      };
      const config: Config = { components: { button: Button } };
      const plan = await resolveExperience(payload, config);
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={config} debug />
      );
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('Skipping unidentifiable node');
    } finally {
      warn.mockRestore();
    }
  });

  it('resolve-data-failed: resolveData throws for a registered component', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [componentNode('button', { id: 'b' })],
      };
      const config: Config = {
        components: {
          button: {
            resolveData: () => {
              throw new Error('enrichment service down');
            },
            component: Button,
          },
        },
      };
      const plan = await resolveExperience(payload, config);
      expect(plan.diagnostics[0]).toBeInstanceOf(Error);
      expect((plan.diagnostics[0]!.cause as Error)?.message).toBe('enrichment service down');
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={config} debug />
      );
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('component:button');
      expect(html).toContain('enrichment service down');
    } finally {
      warn.mockRestore();
    }
  });

  it('token-unresolved: a DesignToken with no resolveToken mapping (also proves SSR coverage of a resolve-time diagnostic)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [
          componentNode('button', {
            id: 'b',
            designProperties: { cfColor: { type: 'DesignToken', value: 'color.brand' } },
          }),
        ],
      };
      const config: Config = { components: { button: Button }, resolveToken: () => undefined };
      const plan = await resolveExperience(payload, config);
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={config} debug />
      );
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('color.brand');
      expect(html).toContain('resolveToken');
    } finally {
      warn.mockRestore();
    }
  });

  it('component-not-registered: an id with no matching entry in config.components', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [componentNode('missing', { id: 'm' })],
      };
      const config: Config = { components: {} };
      const plan = await resolveExperience(payload, config);
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={config} debug />
      );
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('No component registered for id &quot;missing&quot;');
    } finally {
      warn.mockRestore();
    }
  });

  it('experience-template-not-registered: a template id with no matching entry in config.experienceTemplates', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [
          {
            experienceTemplate: {
              sys: {
                type: 'ResourceLink',
                linkType: 'Contentful:ExperienceTemplate',
                urn: 'crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/missing-template',
              },
            },
            id: 'tpl',
          },
        ],
      };
      const config: Config = { components: {} };
      const plan = await resolveExperience(payload, config);
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={config} debug />
      );
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('No experience template registered for id &quot;missing-template&quot;');
    } finally {
      warn.mockRestore();
    }
  });

  it('component-render-error: a registered component that throws while rendering', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
        nodes: [componentNode('broken', { id: 'b' })],
      };
      const config: Config = { components: { broken: Broken } };
      const plan = await resolveExperience(payload, config);

      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => {
        root!.render(<ClientExperienceRenderer experience={plan} config={config} debug />);
      });
      await flushMicrotasks();

      const errorList = container.querySelector('[data-experiences-debug-errors]');
      expect(errorList).not.toBeNull();
      expect(errorList!.textContent).toContain('Component "broken"');
      expect(errorList!.textContent).toContain('boom');
    } finally {
      warn.mockRestore();
    }
  });
});
