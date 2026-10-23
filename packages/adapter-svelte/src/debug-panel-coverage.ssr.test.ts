/*
 * True SSR coverage of a resolve-time diagnostic reaching the debug panel —
 * renders through `svelte/server` (Svelte's *server*-compiled output), not
 * `@testing-library/svelte` (the client build every other coverage test in
 * this package uses). `token-unresolved` is the trigger: it's produced by
 * `resolveExperience` itself, so it's already baked into `plan.diagnostics`
 * before any renderer sees it — proving the panel surfaces a resolve-time
 * diagnostic under a real, synchronous server render, not just under a
 * client-mounted test harness.
 *
 * Runs under vitest.ssr.config.ts (environment: node) — the `.ssr.test.ts`
 * suffix is load-bearing, see nodes-renderer.ssr.test.ts for why.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

import type {
  ComponentNode,
  ExperiencePayload,
  PortableRenderPlan,
} from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';
import type { Config } from './types.js';

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

describe('debug panel — true SSR coverage of a resolve-time diagnostic', () => {
  it('token-unresolved reaches the debug panel under svelte/server', async () => {
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
      const config: Config = {
        components: { button: ButtonFixture },
        resolveToken: () => undefined,
      };
      const plan = await resolveExperience(payload, config);

      const html = render(ServerExperienceRenderer as never, {
        props: { experience: plan, config, debug: true } as never,
      }).body;

      expect(html).toContain('data-experiences-debug-errors');
      expect(html).toContain('color.brand');
      expect(html).toContain('resolveToken');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('debug panel — Delivery diagnostic privacy under SSR', () => {
  it('omits private upstream details with debug enabled', () => {
    const deliveryDiagnostics = Object.freeze([
      { fieldPath: 'private/upstream/field', message: 'private upstream message' },
    ]);
    const plan = Object.freeze<PortableRenderPlan>({
      nodes: [
        {
          registration: { kind: 'component', id: 'button' },
          props: {
            content: { label: 'Useful content', deliveryDiagnostics: 'customer content field' },
            design: {},
            designRaw: {},
          },
          slots: {},
        },
      ],
      metadata: { source: 'useful metadata' },
      debug: true,
      diagnostics: [new Error('Existing resolver diagnostic')],
      deliveryDiagnostics,
    });
    const config: Config = { components: { button: ButtonFixture } };
    const html = render(ServerExperienceRenderer as never, {
      props: { experience: plan, config, debug: true } as never,
    }).body;

    expect(html).toContain('data-experiences-debug');
    expect(html).toContain('data-experiences-debug-errors');
    expect(html).toContain('Existing resolver diagnostic');
    expect(html).toContain('Useful content');
    expect(html).toContain('useful metadata');
    expect(html).toContain('customer content field');
    expect(html).not.toContain('private/upstream/field');
    expect(html).not.toContain('private upstream message');
    expect(plan.deliveryDiagnostics).toBe(deliveryDiagnostics);
    expect(plan.deliveryDiagnostics).toEqual([
      { fieldPath: 'private/upstream/field', message: 'private upstream message' },
    ]);
  });
});
