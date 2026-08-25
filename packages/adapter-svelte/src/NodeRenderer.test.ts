/*
 * `component-render-error` isolation on the CLIENT (jsdom, client-compiled
 * output — the default `vitest.config.ts`). `<svelte:boundary>` genuinely
 * catches here, unlike under `svelte/server` — see `nodes-renderer.ssr.test.ts`
 * for that documented, proven gap. Both `ServerExperienceRenderer` and
 * `ClientExperienceRenderer` share the same `NodesRenderer`/`NodeRenderer`
 * boundary code, so both are exercised — the distinction between the two
 * components is about viewport-tracking reactivity, not error handling.
 */
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import type { ComponentNode, ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import ClientExperienceRenderer from './ClientExperienceRenderer.svelte';
import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';
import type { Config } from './types.js';

import BrokenFixture from './test-fixtures/BrokenFixture.svelte';
import ButtonFixture from './test-fixtures/ButtonFixture.svelte';

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

describe.each([
  ['ServerExperienceRenderer', ServerExperienceRenderer],
  ['ClientExperienceRenderer', ClientExperienceRenderer],
] as const)('%s — component-render-error, client-side catch', (_name, Renderer) => {
  it('isolates the failing node — sibling still renders, records a diagnostic', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
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
    } finally {
      warn.mockRestore();
    }
  });

  it('renders nothing from the default fallback when debug is off, but still warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        viewports: VIEWPORTS,
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
