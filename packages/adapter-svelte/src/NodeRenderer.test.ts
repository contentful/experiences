/*
 * `component-render-error` isolation on the CLIENT (jsdom, client-compiled
 * output — the default `vitest.config.ts`). `<svelte:boundary>` genuinely
 * catches here, unlike under `svelte/server` — see `nodes-renderer.ssr.test.ts`
 * for that documented, proven gap. Both `ExperienceRenderer` and
 * `ExperienceRenderer` share the same `NodesRenderer`/`NodeRenderer`
 * boundary code, so both are exercised — the distinction between the two
 * components is about reactivity, not error handling.
 */
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

// `ExperienceRenderer`'s onDiagnostic defers via `queueMicrotask` (see
// its own comment for why); a test asserting against the debug panel needs to
// let that microtask settle first.
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

import type { ComponentNode, ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import ExperienceRenderer from './ExperienceRenderer.svelte';
import type { Config } from './types.js';

import BrokenFixture from './test-fixtures/BrokenFixture.svelte';
import ButtonFixture from './test-fixtures/ButtonFixture.svelte';

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

describe.each([
  ['ExperienceRenderer', ExperienceRenderer],
  ['ExperienceRenderer', ExperienceRenderer],
] as const)('%s — component-render-error, client-side catch', (name, Renderer) => {
  it('isolates the failing node — sibling still renders, records a diagnostic', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        nodes: [
          componentNode('broken', { id: 'b' }),
          componentNode('contentful-button', { id: 'f', contentProperties: { label: 'sibling' } }),
        ],
      };
      const config: Config = {
        components: { broken: BrokenFixture, 'contentful-button': ButtonFixture },
      };
      const plan = await resolveExperience(payload, config);

      const { container } = render(Renderer as never, {
        props: { experience: plan, config, debug: true } as never,
      });

      expect(container.querySelector('button')?.textContent).toBe('sibling');
      expect(container.querySelector('[data-experiences-render-error="broken"]')).not.toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
      await flushMicrotasks();

      // Only ExperienceRenderer's debug panel is reactive
      // ($state-backed renderDiagnostics): the boundary's onerror resolves
      // after the initial render even under this client-mounted harness, and
      // ExperienceRenderer's plain-array collection is evaluated once,
      // matching its documented "one synchronous SSR pass" contract — real
      // `svelte/server` never reaches the catching code at all (see the
      // README's SSR/CSR asymmetry section), so this component never shows
      // this diagnostic in the debug panel in any real deployment either.
      if (name === 'ExperienceRenderer') {
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

      const { container } = render(Renderer as never, {
        props: { experience: plan, config } as never,
      });

      expect(container.querySelector('[data-experiences-render-error]')).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
    } finally {
      warn.mockRestore();
    }
  });
});

describe('ExperienceRenderer — render-time diagnostics dedupe across re-renders', () => {
  it('reports a persistently-unregistered component only once, not once per re-render', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        nodes: [componentNode('missing', { id: 'm' })],
      };
      const config: Config = { components: {} };
      const plan = await resolveExperience(payload, config);

      const { container, rerender } = render(ExperienceRenderer, {
        props: { experience: plan, config, debug: true } as never,
      });

      // Force NodeRenderer's reactive blocks to re-run without any real new
      // occurrence — an ancestor re-render (a prop change, an unrelated
      // parent update) does the same thing in production.
      await rerender({ experience: plan, config, debug: true } as never);

      expect(container.querySelectorAll('[data-experiences-debug-errors] li')).toHaveLength(1);
      expect(container.textContent).toContain('No component registered for id "missing"');
    } finally {
      warn.mockRestore();
    }
  });
});
