import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

import ExperiencePlanProbe from './test-fixtures/ExperiencePlanProbe.svelte';
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
  viewports: [
    {
      displayName: 'Default',
      id: 'default',
      previewSize: '1024px',
      query: '*',
    },
  ],
});

const initialPlan = {
  fallbackViewportIndex: 0,
  nodes: [
    {
      nodeId: 'initial',
      registration: { kind: 'component' as const, id: 'hero' },
      props: { content: { title: 'initial' }, design: {}, designRaw: {} },
      slots: {},
    },
  ],
  viewports: payload('initial').viewports,
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

  it('keeps the initial experience when resolving raw data fails', async () => {
    const view = render(ExperiencePlanProbe, {
      props: {
        options: {
          payload: payload('failed'),
          initialPlan,
          resolveOptions: {
            config: {
              components: {
                hero: {
                  resolveData: () => Promise.reject(new Error('resolver failed')),
                },
              },
            },
          },
        } satisfies UseExperiencePlanOptions,
      },
    });

    await vi.waitFor(() => expect(view.container.textContent).toBe('initial'));
  });
});
