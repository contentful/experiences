import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../../registry/types.js';
import ServerExperienceRenderer from '../../rendering/ServerExperienceRenderer.svelte';
import ButtonFixture from '../fixtures/ButtonFixture.svelte';
import { componentNode } from '../fixtures/render-plan.js';

describe('debug panel — true SSR coverage of a resolve-time diagnostic', () => {
  it('combines resolve-time and synchronous render-time diagnostics under svelte/server', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        nodes: [
          componentNode('button', {
            id: 'b',
            designProperties: { cfColor: { type: 'DesignToken', value: 'color.brand' } },
          }),
          componentNode('missing'),
        ],
      };
      const config: Config = {
        components: { button: ButtonFixture },
        resolveToken: () => undefined,
      };
      const plan = await resolveExperience(payload, config);

      const html = render(ServerExperienceRenderer, {
        props: { experience: plan, config, debug: true },
      }).body;

      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('color.brand');
      expect(html).toContain('resolveToken');
      expect(html).toContain('No component registered for id "missing"');
    } finally {
      warn.mockRestore();
    }
  });
});
