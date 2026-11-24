import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import LivePreviewPlanProbe from './test-fixtures/LivePreviewPlanProbe.svelte';
import LivePreviewRenderProbe from './test-fixtures/LivePreviewRenderProbe.svelte';
import { minimalSourceMap } from './test-fixtures/source-map.js';
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

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly close = vi.fn();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  emit(payload: ExperiencePayload): void {
    this.onmessage?.({ data: JSON.stringify({ type: 'next', data: payload }) });
  }
}

const previewSessionOptions = {
  environmentId: 'environment-id',
  previewToken: 'preview-token',
  sessionHost: 'wss://preview-session.example.test',
  sessionId: 'session-id',
  spaceId: 'space-id',
};

const payload = (
  title: string,
  sourceMap = minimalSourceMap({ node: title })
): ExperiencePayload => ({
  nodes: [
    {
      id: title,
      component: {
        sys: {
          type: 'ResourceLink',
          linkType: 'Contentful:Component',
          urn: 'crn:contentful:::experience:components/hero',
        },
      },
      contentProperties: { title },
    },
  ],
  sys: { type: 'Experience' },
  extensions: { sourceMap },
});

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useLivePreview', () => {
  it('returns the initial plan when no Preview Session is configured', () => {
    const options: UseLivePreviewOptions = {
      initialPlan,
      resolveOptions: { config: { components: {} } },
    };

    const view = render(LivePreviewPlanProbe, { props: { options } });

    expect(view.container.textContent).toBe('initial');
  });

  it.each([
    { inspection: undefined, sourceMap: undefined, requested: false },
    { inspection: false, sourceMap: undefined, requested: false },
    { inspection: true, sourceMap: false, requested: true },
    { inspection: undefined, sourceMap: true, requested: true },
  ])(
    'requests maps with inspection=$inspection and sourceMap=$sourceMap',
    ({ inspection, sourceMap, requested }) => {
      render(LivePreviewPlanProbe, {
        props: {
          options: {
            previewSessionOptions: { ...previewSessionOptions, sourceMap },
            inspection,
            resolveOptions: { config: { components: {} } },
          },
        },
      });
      expect(new URL(FakeWebSocket.instances[0]!.url).searchParams.has('source_map')).toBe(
        requested
      );
    }
  );

  it('toggles inspection without reconnecting an unchanged map subscription', async () => {
    vi.useFakeTimers();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      globalThis.DOMRect.fromRect({ x: 10, y: 20, width: 100, height: 40 })
    );
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation((message) => {
      globalThis.structuredClone(message);
    });
    const snapshots = () =>
      postMessage.mock.calls
        .map(([message]) => message)
        .filter((message) => message.eventType === 'canvasGeometryUpdated');
    const options: UseLivePreviewOptions = {
      initialPlan,
      previewSessionOptions,
      resolveOptions: { config: { components: {} } },
    };
    const view = render(LivePreviewRenderProbe, { props: { options } });
    FakeWebSocket.instances[0]!.emit(payload('updated'));
    await tick();
    await vi.advanceTimersByTimeAsync(100);
    expect(view.container.querySelector('output')?.textContent).toBe('updated');
    expect(snapshots()).toEqual([]);

    const withMaps = {
      ...options,
      previewSessionOptions: { ...previewSessionOptions, sourceMap: true },
    };
    await view.rerender({ options: withMaps });
    await vi.advanceTimersByTimeAsync(100);
    expect(new URL(FakeWebSocket.instances.at(-1)!.url).searchParams.get('source_map')).toBe(
      'true'
    );
    expect(view.container.querySelector('output')?.textContent).toBe('updated');
    expect(snapshots()).toEqual([]);

    const count = FakeWebSocket.instances.length;
    const mappedSocket = FakeWebSocket.instances.at(-1)!;
    FakeWebSocket.instances[0]!.emit(payload('obsolete'));
    await view.rerender({ options: { ...withMaps, inspection: true } });
    expect(FakeWebSocket.instances).toHaveLength(count);
    expect(mappedSocket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(view.container.querySelector('output')?.textContent).toBe('updated');
    expect(snapshots().at(-1)?.payload).toMatchObject({
      sourceMap: minimalSourceMap({ node: 'updated' }),
      nodes: { updated: { coordinates: { x: 10, y: 20, width: 100, height: 40 } } },
    });

    await view.rerender({ options: withMaps });
    expect(FakeWebSocket.instances).toHaveLength(count);
    expect(mappedSocket.close).not.toHaveBeenCalled();
    postMessage.mockClear();
    window.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(100);
    expect(snapshots()).toEqual([]);

    await view.rerender({ options });
    expect(new URL(FakeWebSocket.instances.at(-1)!.url).searchParams.has('source_map')).toBe(false);
  });

  it('observes only successful, current rendered plans', async () => {
    vi.useFakeTimers();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      globalThis.DOMRect.fromRect({ x: 10, y: 20, width: 100, height: 40 })
    );
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const snapshots = () =>
      postMessage.mock.calls
        .map(([message]) => message)
        .filter((message) => message.eventType === 'canvasGeometryUpdated');
    let finishSlow: ((value: Record<string, unknown>) => void) | undefined;
    const options: UseLivePreviewOptions = {
      initialPlan,
      previewSessionOptions: { ...previewSessionOptions, sourceMap: true },
      resolveOptions: {
        config: {
          components: {
            hero: {
              resolveData: ({ content }: { content: Record<string, unknown> }) => {
                if (content.title === 'rejected') throw new Error('resolver failed');
                if (content.title === 'slow')
                  return new Promise((resolve) => {
                    finishSlow = resolve;
                  });
                return {};
              },
            },
          },
        },
      },
    };
    const view = render(LivePreviewRenderProbe, { props: { options } });
    await view.rerender({ options: { ...options, inspection: true } });
    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances.at(-1)!;
    expect(new URL(socket.url).searchParams.get('source_map')).toBe('true');
    await vi.advanceTimersByTimeAsync(100);
    expect(snapshots().at(-1)?.payload).toMatchObject({ sourceMap: null, nodes: {} });
    socket.emit(payload('accepted'));
    await tick();
    await vi.advanceTimersByTimeAsync(100);
    expect(view.container.querySelector('output')?.textContent).toBe('accepted');
    expect(snapshots().at(-1)?.payload.sourceMap).toEqual(minimalSourceMap({ node: 'accepted' }));

    for (const title of ['rejected', 'slow']) {
      socket.emit(payload(title));
      await tick();
      await vi.advanceTimersByTimeAsync(100);
      window.dispatchEvent(new Event('resize'));
      await vi.advanceTimersByTimeAsync(100);
      expect(view.container.querySelector('output')?.textContent).toBe('accepted');
      expect(snapshots().at(-1)?.payload.sourceMap).toEqual(minimalSourceMap({ node: 'accepted' }));
    }
    socket.emit(payload('latest'));
    await tick();
    await vi.advanceTimersByTimeAsync(100);
    finishSlow?.({});
    await vi.advanceTimersByTimeAsync(100);
    expect(view.container.querySelector('output')?.textContent).toBe('latest');
    expect(snapshots().at(-1)?.payload.sourceMap).toEqual(minimalSourceMap({ node: 'latest' }));

    socket.emit({ ...payload('mapless'), extensions: undefined });
    await tick();
    await vi.advanceTimersByTimeAsync(100);
    expect(view.container.querySelector('output')?.textContent).toBe('mapless');
    expect(snapshots().at(-1)?.payload).toMatchObject({ sourceMap: null, nodes: {} });

    socket.emit(payload('obsolete'));
    view.unmount();
    postMessage.mockClear();
    await vi.advanceTimersByTimeAsync(100);
    expect(socket.close).toHaveBeenCalled();
    expect(snapshots()).toEqual([]);
  });
});
