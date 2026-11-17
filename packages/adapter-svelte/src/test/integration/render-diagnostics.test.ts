import { resolveExperience } from '@contentful/experiences-sdk-core';
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../../registry/types.js';
import ClientExperienceRenderer from '../../rendering/ClientExperienceRenderer.svelte';
import BrokenFixture from '../fixtures/BrokenFixture.svelte';
import ButtonFixture from '../fixtures/ButtonFixture.svelte';
import { componentNode } from '../fixtures/render-plan.js';

describe('render diagnostics composition', () => {
  it('combines resolve-time and client render-time diagnostics while preserving healthy siblings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const config: Config = {
        components: {
          button: {
            component: ButtonFixture,
            resolveData: () => {
              throw new Error('enrichment service down');
            },
          },
          broken: BrokenFixture,
        },
      };
      const plan = await resolveExperience(
        {
          nodes: [
            componentNode('button', { contentProperties: { label: 'surviving content' } }),
            componentNode('missing'),
            componentNode('broken'),
          ],
        },
        config
      );
      const { container } = render(ClientExperienceRenderer, {
        props: { experience: plan, config, debug: true },
      });
      await vi.waitFor(() => {
        const errors = container.querySelector('[data-experiences-debug-errors]');
        expect(errors?.textContent).toContain('enrichment service down');
        expect(errors?.textContent).toContain('No component registered for id "missing"');
        expect(errors?.textContent).toContain('boom');
      });
      expect(container.querySelector('button')?.textContent).toBe('surviving content');
    } finally {
      warn.mockRestore();
    }
  });
});
