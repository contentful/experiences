import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import LivePreviewPlanProbe from './test-fixtures/LivePreviewPlanProbe.svelte';
import type { UseLivePreviewOptions } from './use-live-preview.svelte.js';

const payload: ExperiencePayload = {
  nodes: [],
  sys: { type: 'Experience' },
  viewports: [{ displayName: 'Default', id: 'default', previewSize: '1024px', query: '*' }],
};

const initialPlan: PortableRenderPlan = {
  fallbackViewportIndex: 0,
  nodes: [
    {
      nodeId: 'initial',
      registration: { kind: 'component', id: 'hero' },
      props: { content: { title: 'initial' }, design: {}, designRaw: {} },
      slots: {},
    },
  ],
  viewports: payload.viewports,
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

    const view = render(LivePreviewPlanProbe, { props: { options } });

    expect(view.container.textContent).toBe('initial');
  });
});
