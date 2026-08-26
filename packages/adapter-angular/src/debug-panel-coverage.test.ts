/*
 * End-to-end proof that every one of the 8 non-happy-path failure modes
 * reaches `<cf-debug-experience>`'s rendered output — through a real
 * `resolveExperience` + renderer pipeline, not a hand-built diagnostic
 * fixture (see debug-experience.test.ts for the fixture-level tests of the
 * panel's own rendering logic). Each test asserts a distinguishing substring
 * of the real message, not the whole string, so wording tweaks don't make
 * these overly brittle.
 *
 * `component-render-error` uses the same `ServerExperienceRendererComponent`
 * + `render()` helper as every other code here — Angular is the one adapter
 * where SSR and CSR share the exact same `createComponent` catch path (see
 * the README's SSR/CSR asymmetry section), so there's no separate
 * client-mounted variant needed the way React/Svelte need for this code.
 * `render()`'s `detectChanges()` is synchronous, so no microtask flush is
 * needed either.
 *
 * The `token-unresolved` case below IS the SSR coverage for a resolve-time
 * diagnostic — `render()` mounts through `ServerExperienceRendererComponent`,
 * a real (zoneless, synchronous) render — no separate SSR-specific test file
 * needed the way Svelte needs one (see its `debug-panel-coverage.ssr.test.ts`);
 * Angular's own true-SSR proof (`renderApplication`) already exists in
 * `nodes-renderer.ssr.test.ts` for other codes.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ComponentNode, ExperiencePayload } from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import { render } from './test-fixtures/render-harness.js';
import { BrokenFixture } from './test-fixtures/broken.fixture.js';
import { ButtonFixture } from './test-fixtures/button.fixture.js';
import type { Config } from './types.js';

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

describe('debug panel — end-to-end coverage of every non-happy-path failure mode', () => {
  it('malformed-payload: a non-array nodes field', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const plan = await resolveExperience(
        { viewports: VIEWPORTS, nodes: 'not-an-array' } as never,
        { components: {} }
      );
      const { html } = render(plan, { config: { components: {} }, debug: true });
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('"nodes" is not an array');
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
      const config: Config = { components: { 'contentful-container': ButtonFixture } };
      const plan = await resolveExperience(payload, config);
      const { html } = render(plan, { config, debug: true });
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('Slot "children"');
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
      const config: Config = { components: { button: ButtonFixture } };
      const plan = await resolveExperience(payload, config);
      const { html } = render(plan, { config, debug: true });
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
            component: ButtonFixture,
          },
        },
      };
      const plan = await resolveExperience(payload, config);
      expect(plan.diagnostics[0]).toBeInstanceOf(Error);
      expect((plan.diagnostics[0]!.cause as Error)?.message).toBe('enrichment service down');
      const { html } = render(plan, { config, debug: true });
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('component:button');
      expect(html).toContain('enrichment service down');
    } finally {
      warn.mockRestore();
    }
  });

  it('token-unresolved: a DesignToken with no resolveToken mapping (also proves SSR-style coverage of a resolve-time diagnostic)', async () => {
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
      const config: Config = {
        components: { button: ButtonFixture },
        resolveToken: () => undefined,
      };
      const plan = await resolveExperience(payload, config);
      const { html } = render(plan, { config, debug: true });
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
      const { html } = render(plan, { config, debug: true });
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('No component registered for id "missing"');
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
      const plan = await resolveExperience(payload as never, config);
      const { html } = render(plan, { config, debug: true });
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('No experience template registered for id "missing-template"');
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
      const config: Config = { components: { broken: BrokenFixture } };
      const plan = await resolveExperience(payload, config);
      const { html } = render(plan, { config, debug: true });
      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('Component "broken"');
      expect(html).toContain('boom');
    } finally {
      warn.mockRestore();
    }
  });
});
