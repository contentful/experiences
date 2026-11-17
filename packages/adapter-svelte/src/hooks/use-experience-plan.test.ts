import * as core from '@contentful/experiences-sdk-core';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import ExperiencePlanProbe from '../test/fixtures/ExperiencePlanProbe.svelte';
import type { UseExperiencePlanOptions } from './use-experience-plan.svelte.js';

const payload = (title: string): ExperiencePayload => ({
  nodes: [
    {
      component: {
        sys: {
          type: 'ResourceLink',
          linkType: 'Contentful:Component',
          urn: 'crn:contentful:::experience:components/hero',
        },
      },
      contentProperties: { title },
      designProperties: {},
      slots: {},
    },
  ],
  sys: { type: 'Experience' },
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
  it('resolves raw data into an experience', async () => {
    const view = render(ExperiencePlanProbe, {
      props: {
        options: {
          payload: payload('updated'),
          initialPlan,
          resolveOptions,
        } satisfies UseExperiencePlanOptions,
      },
    });

    await vi.waitFor(() => expect(view.container.textContent).toBe('updated'));
  });

  it.each(['diagnostic', 'rejection'] as const)(
    'retains the last successful plan after a completed update with a %s',
    async (failure) => {
      const resolve = vi.spyOn(core, 'resolveExperience');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const view = render(ExperiencePlanProbe, {
          props: {
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
