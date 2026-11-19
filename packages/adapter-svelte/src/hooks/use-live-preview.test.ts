import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PlanProbe from '../test/fixtures/PlanProbe.svelte';
import { useLivePreview } from './use-live-preview.svelte.js';
import type { UseLivePreviewOptions } from './use-live-preview.svelte.js';

const initialPlan: PortableRenderPlan = {
  nodes: [
    {
      nodeId: 'initial',
      registration: { kind: 'component', id: 'hero' },
      props: { content: { title: 'initial' }, design: {}, designRaw: {} },
      slots: {},
    },
  ],
  metadata: {},
  debug: false,
  diagnostics: [],
};

describe('useLivePreview', () => {
  it('returns the initial plan when no Preview Session is configured', () => {
    const options: UseLivePreviewOptions = {
      initialPlan,
      resolveOptions: { config: { components: {} } },
    };

    const view = render(PlanProbe<UseLivePreviewOptions>, {
      props: { options, use: useLivePreview },
    });

    expect(view.container.textContent).toBe('initial');
  });
});
