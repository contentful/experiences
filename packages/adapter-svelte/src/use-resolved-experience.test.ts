import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

import ResolvedExperienceProbe from './test-fixtures/ResolvedExperienceProbe.svelte';
import type { UseResolvedExperienceOptions } from './use-resolved-experience.svelte.js';

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

const initialExperience = {
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

describe('useResolvedExperience', () => {
  it('resolves raw data into an experience', async () => {
    const view = render(ResolvedExperienceProbe, {
      props: {
        options: {
          data: payload('updated'),
          initialExperience,
          resolveOptions,
        } satisfies UseResolvedExperienceOptions,
      },
    });

    await vi.waitFor(() => expect(view.container.textContent).toBe('updated'));
  });

  it('keeps the initial experience when resolving raw data fails', async () => {
    const view = render(ResolvedExperienceProbe, {
      props: {
        options: {
          data: payload('failed'),
          initialExperience,
          resolveOptions: {
            config: {
              components: {
                hero: {
                  resolveData: () => Promise.reject(new Error('resolver failed')),
                },
              },
            },
          },
        } satisfies UseResolvedExperienceOptions,
      },
    });

    await vi.waitFor(() => expect(view.container.textContent).toBe('initial'));
  });
});
