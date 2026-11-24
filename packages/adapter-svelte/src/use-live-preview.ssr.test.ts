import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LivePreviewInspectionProbe from './test-fixtures/LivePreviewInspectionProbe.svelte';
import LivePreviewRenderProbe from './test-fixtures/LivePreviewRenderProbe.svelte';
import { minimalSourceMap } from './test-fixtures/source-map.js';

afterEach(() => vi.unstubAllGlobals());

describe('Live Preview inspection during SSR', () => {
  it('imports the public helpers and renders enabled inspection without browser work', async () => {
    const fetch = vi.fn();
    const webSocket = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', webSocket);
    const api = await import('./index.js');
    expect(typeof api.useLivePreviewInspection).toBe('function');
    const sourceMap = minimalSourceMap();

    const standalone = render(LivePreviewInspectionProbe, {
      props: { options: { sourceMap, enabled: true } },
    });
    expect(standalone.body).toContain('data-cf-node-id="n"');

    const integrated = render(LivePreviewRenderProbe, {
      props: {
        options: {
          inspection: true,
          initialPlan: {
            nodes: [
              {
                nodeId: 'n',
                registration: { kind: 'component', id: 'hero' },
                props: { content: { title: 'server' }, design: {}, designRaw: {} },
                slots: {},
              },
            ],
            metadata: {},
            diagnostics: [],
            debug: false,
            sourceMap,
          },
          previewSessionOptions: {
            spaceId: 'space',
            environmentId: 'environment',
            sessionId: 'session',
            previewToken: 'token',
          },
          resolveOptions: { config: { components: {} } },
        },
      },
    });
    expect(integrated.body).toContain('data-cf-node-id="n"');
    expect(integrated.body).toContain('server');
    expect(fetch).not.toHaveBeenCalled();
    expect(webSocket).not.toHaveBeenCalled();
  });
});
