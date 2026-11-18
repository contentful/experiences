import * as core from '@contentful/experiences-sdk-core';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { componentNode } from '../test/fixtures/render-plan.js';
import PlanProbe from '../test/fixtures/PlanProbe.svelte';
import { useExperiencePlan } from './use-experience-plan.svelte.js';
import type { UseExperiencePlanOptions } from './use-experience-plan.svelte.js';

const payload = (title: string): ExperiencePayload => ({
  nodes: [componentNode('hero', { contentProperties: { title } })],
});

const initialPlan = {
  nodes: [
    {
      nodeId: 'initial',
      registration: { kind: 'component' as const, id: 'hero' },
      props: { content: { title: 'initial' }, design: {}, designRaw: {} },
      slots: {},
    },
  ],
  metadata: {},
  debug: false,
  diagnostics: [],
};

const resolveOptions = {
  config: { components: {} },
};

describe('useExperiencePlan', () => {
  it.each(['diagnostic', 'rejection'] as const)(
    'retains the last successful plan after a completed update with a %s',
    async (failure) => {
      const resolve = vi.spyOn(core, 'resolveExperience');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const view = render(PlanProbe<UseExperiencePlanOptions>, {
          props: {
            use: useExperiencePlan,
            options: {
              payload: payload('last good'),
              initialPlan,
              resolveOptions,
            } satisfies UseExperiencePlanOptions,
          },
        });
        await vi.waitFor(() => expect(view.container.textContent).toBe('last good'));

        let rejectUpdate!: (reason: Error) => void;
        const update = new Promise<never>((_resolve, reject) => {
          rejectUpdate = reject;
        });
        if (failure === 'rejection') resolve.mockReturnValueOnce(update);
        const resolveData = vi.fn(() => update);
        await view.rerender({
          options: {
            payload: payload('failed update'),
            initialPlan,
            resolveOptions: { config: { components: { hero: { resolveData } } } },
          } satisfies UseExperiencePlanOptions,
        });
        await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
        if (failure === 'diagnostic') {
          await vi.waitFor(() => expect(resolveData).toHaveBeenCalledOnce());
        }
        expect(view.container.textContent).toBe('last good');
        rejectUpdate(new Error('resolver failed'));

        // Observe the actual resolution promise, then flush the hook's reactive
        // publication before checking retention. Initial text alone cannot pass.
        const completed = resolve.mock.results[1]!.value as ReturnType<
          typeof core.resolveExperience
        >;
        if (failure === 'diagnostic') {
          expect((await completed).diagnostics).toHaveLength(1);
        } else {
          await expect(completed).rejects.toThrow('resolver failed');
        }
        await tick();
        expect(view.container.textContent).toBe('last good');
      } finally {
        resolve.mockRestore();
        warn.mockRestore();
      }
    }
  );
});
