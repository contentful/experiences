import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { PreviewState } from '@contentful/experiences-web';

export function plan(title = 'content'): PortableRenderPlan {
  return {
    nodes: [
      {
        nodeId: 'hero',
        registration: { kind: 'component', id: 'hero' },
        props: { content: { title }, design: {}, designRaw: {} },
        slots: {},
      },
    ],
    metadata: {},
    debug: false,
    diagnostics: [],
  };
}

export function previewState(overrides: Partial<PreviewState> = {}): PreviewState {
  return {
    experienceId: 'home',
    sessionId: 'session-a',
    revision: 1,
    data: undefined,
    error: undefined,
    status: 'live',
    ...overrides,
  };
}
