/** @vitest-environment jsdom */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { useLivePreview, type UseLivePreviewOptions } from './use-live-preview';

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
  viewports: payload('initial').viewports,
  metadata: {},
  debug: false,
  diagnostics: [],
};

function LivePreviewProbe({ options }: { options: UseLivePreviewOptions }): ReactElement {
  const { data } = useLivePreview(options);
  return <output>{data?.nodes[0]?.props.content.title ?? ''}</output>;
}

function renderRoot(): { container: HTMLElement; root: Root } {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  return { container, root };
}

describe('useLivePreview', () => {
  let root: Root | undefined;
  let container: HTMLElement | undefined;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
  });

  it('returns the initial plan when no Preview Session is configured', async () => {
    ({ container, root } = renderRoot());

    await act(async () => {
      root.render(
        <LivePreviewProbe
          options={{
            initialPlan,
            resolveOptions: { config: { components: {} } },
          }}
        />
      );
    });

    expect(container.textContent).toBe('initial');
  });
});
