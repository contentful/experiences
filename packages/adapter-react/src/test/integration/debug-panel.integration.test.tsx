import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveExperience, type ExperiencePayload } from '@contentful/experiences-sdk-core';
import { ServerExperienceRenderer } from '../../rendering/server-renderer';
import type { Config } from '../../registry/types';
import { componentNode, experienceTemplateNode } from '../fixtures/payload.js';

const Button = ({ label }: { label?: string }) => <button>{label}</button>;

// Core owns diagnostic generation; this seam proves real diagnostics reach SSR presentation.
describe('resolver and renderer diagnostics → debug panel', () => {
  it('resolve-data-failed: resolveData throws for a registered component', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
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

  it.each([
    ['component', componentNode('missing'), 'No component registered'],
    ['experience template', experienceTemplateNode('missing'), 'No experience template registered'],
  ] as const)('presents an unregistered %s render diagnostic', async (_kind, node, message) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const config: Config = { components: {} };
      const plan = await resolveExperience({ nodes: [node] }, config);
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={config} debug />
      );
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain(`${message} for id &quot;missing&quot;`);
    } finally {
      warn.mockRestore();
    }
  });
});
