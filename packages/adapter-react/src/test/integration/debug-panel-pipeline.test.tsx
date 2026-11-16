/**
 * End-to-end proof that the six SSR-friendly non-happy-path failure modes
 * reach `<DebugExperience>`'s rendered output — through a real
 * `resolveExperience` + renderer pipeline, not a hand-built diagnostic
 * fixture (see debug-experience.test.tsx for the fixture-level tests of the
 * panel's own rendering logic). Each test asserts a distinguishing substring
 * of the real message, not the whole string, so wording tweaks don't make
 * these overly brittle.
 *
 * Client component-render-error collection is covered with sibling isolation
 * in rendering/client-renderer.test.tsx.
 *
 * The `resolveExperience` result for `token-unresolved` below IS the SSR
 * coverage for a resolve-time diagnostic: `renderToStaticMarkup` is a real,
 * synchronous server render — no separate SSR-specific test file needed for
 * React the way Svelte and Angular need one (see their
 * `debug-panel-coverage.ssr.test.*`).
 */
import { componentNode } from '../fixtures/payload.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ComponentNode, ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import { ServerExperienceRenderer } from '../../rendering/server-renderer';
import type { Config } from '../../registry/types';

const Button = ({ label }: { label?: string }) => <button>{label}</button>;

describe('debug panel — end-to-end coverage of SSR-friendly failure modes', () => {
  it('malformed-payload: a non-array nodes field', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const plan = await resolveExperience({ nodes: 'not-an-array' } as never, { components: {} });
      const html = renderToStaticMarkup(
        <ServerExperienceRenderer experience={plan} config={{ components: {} }} debug />
      );
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('&quot;nodes&quot; is not an array');
    } finally {
      warn.mockRestore();
    }
  });

  it('unidentifiable-node: a node with no readable component/experienceTemplate ref', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
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
      expect(html).toContain(
        'No experience template registered for id &quot;missing-template&quot;'
      );
    } finally {
      warn.mockRestore();
    }
  });
});
