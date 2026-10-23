/*
 * End-to-end proof that every one of the 8 non-happy-path failure modes
 * reaches `<DebugExperience>`'s rendered output — through a real
 * `resolveExperience` + renderer pipeline, not a hand-built diagnostic
 * fixture (see DebugExperience.test.ts for the fixture-level tests of the
 * panel's own rendering logic). Each test asserts a distinguishing substring
 * of the real message, not the whole string, so wording tweaks don't make
 * these overly brittle.
 *
 * True SSR coverage of a resolve-time diagnostic (`token-unresolved`) lives
 * in debug-panel-coverage.ssr.test.ts, using `svelte/server`'s `render` — this
 * file's `ServerExperienceRenderer` tests mount client-side via
 * `@testing-library/svelte`, same as the rest of this package's suite.
 */
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import type {
  ComponentNode,
  ExperiencePayload,
  PortableRenderPlan,
} from '@contentful/experiences-sdk-core';
import { resolveExperience } from '@contentful/experiences-sdk-core';

import ClientExperienceRenderer from './ClientExperienceRenderer.svelte';
import ServerExperienceRenderer from './ServerExperienceRenderer.svelte';
import type { Config } from './types.js';

import BrokenFixture from './test-fixtures/BrokenFixture.svelte';
import ButtonFixture from './test-fixtures/ButtonFixture.svelte';

// `ClientExperienceRenderer`'s onDiagnostic defers via `queueMicrotask` (see
// its own comment for why); a test asserting against the debug panel needs to
// let that microtask settle first.
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

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
      const plan = await resolveExperience({ nodes: 'not-an-array' } as never, { components: {} });
      const { container } = render(ServerExperienceRenderer, {
        props: { experience: plan, config: { components: {} }, debug: true } as never,
      });
      expect(container.innerHTML).toContain('data-experiences-debug-errors');
      expect(container.innerHTML).toContain('"nodes" is not an array');
    } finally {
      warn.mockRestore();
    }
  });

  it('malformed-slot: a slot value that is not an array', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        nodes: [
          componentNode('contentful-container', {
            id: 'page',
            slots: { children: 'oops' as unknown as never },
          }),
        ],
      };
      const config: Config = { components: { 'contentful-container': ButtonFixture } };
      const plan = await resolveExperience(payload, config);
      const { container } = render(ServerExperienceRenderer, {
        props: { experience: plan, config, debug: true } as never,
      });
      expect(container.innerHTML).toContain('data-experiences-debug-errors');
      expect(container.innerHTML).toContain('Slot "children"');
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
      const config: Config = { components: { button: ButtonFixture } };
      const plan = await resolveExperience(payload, config);
      const { container } = render(ServerExperienceRenderer, {
        props: { experience: plan, config, debug: true } as never,
      });
      expect(container.innerHTML).toContain('data-experiences-debug-errors');
      expect(container.innerHTML).toContain('Skipping unidentifiable node');
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
            component: ButtonFixture,
          },
        },
      };
      const plan = await resolveExperience(payload, config);
      expect(plan.diagnostics[0]).toBeInstanceOf(Error);
      expect((plan.diagnostics[0]!.cause as Error)?.message).toBe('enrichment service down');
      const { container } = render(ServerExperienceRenderer, {
        props: { experience: plan, config, debug: true } as never,
      });
      expect(container.innerHTML).toContain('data-experiences-debug-errors');
      expect(container.innerHTML).toContain('component:button');
      expect(container.innerHTML).toContain('enrichment service down');
    } finally {
      warn.mockRestore();
    }
  });

  it('token-unresolved: a DesignToken with no resolveToken mapping', async () => {
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
      const { container } = render(ServerExperienceRenderer, {
        props: { experience: plan, config, debug: true } as never,
      });
      expect(container.innerHTML).toContain('data-experiences-debug-errors');
      expect(container.innerHTML).toContain('color.brand');
      expect(container.innerHTML).toContain('resolveToken');
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
      const { container } = render(ServerExperienceRenderer, {
        props: { experience: plan, config, debug: true } as never,
      });
      expect(container.innerHTML).toContain('data-experiences-debug-errors');
      expect(container.innerHTML).toContain('No component registered for id "missing"');
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
      const plan = await resolveExperience(payload as never, config);
      const { container } = render(ServerExperienceRenderer, {
        props: { experience: plan, config, debug: true } as never,
      });
      expect(container.innerHTML).toContain('data-experiences-debug-errors');
      expect(container.innerHTML).toContain(
        'No experience template registered for id "missing-template"'
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('component-render-error: a registered component that throws while rendering', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const payload: ExperiencePayload = {
        nodes: [componentNode('broken', { id: 'b' })],
      };
      const config: Config = { components: { broken: BrokenFixture } };
      const plan = await resolveExperience(payload, config);

      const { container } = render(ClientExperienceRenderer, {
        props: { experience: plan, config, debug: true } as never,
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

describe('debug panel — Delivery diagnostic privacy', () => {
  it.each([ServerExperienceRenderer, ClientExperienceRenderer])(
    'omits private upstream details with debug enabled',
    (Renderer) => {
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
      const { container } = render(Renderer, {
        props: { experience: plan, config, debug: true } as never,
      });
      const html = container.innerHTML;

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
    }
  );
});
