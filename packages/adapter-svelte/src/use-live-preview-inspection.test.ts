import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LivePreviewInspectionProbe from './test-fixtures/LivePreviewInspectionProbe.svelte';
import { minimalSourceMap } from './test-fixtures/source-map.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useLivePreviewInspection', () => {
  it('observes the supplied map after rendering without opening a Preview Session', async () => {
    const sourceMap = minimalSourceMap();
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const fetch = vi.fn();
    const webSocket = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('WebSocket', webSocket);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      globalThis.DOMRect.fromRect({ x: 10, y: 20, width: 100, height: 40 })
    );

    render(LivePreviewInspectionProbe, { props: { options: { sourceMap, enabled: true } } });

    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        {
          source: 'customer-app',
          eventType: 'canvasGeometryUpdated',
          payload: {
            size: expect.any(Object),
            nodes: { n: { coordinates: { x: 10, y: 20, width: 100, height: 40 } } },
            sourceMap,
          },
        },
        '*'
      )
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(webSocket).not.toHaveBeenCalled();
    expect(postMessage.mock.calls.at(-1)?.[0].payload.sourceMap).toBe(sourceMap);
  });

  it('replaces maps after the corresponding DOM commits, clears a missing map, and stops without clearing', async () => {
    vi.useFakeTimers();
    const sourceMap = minimalSourceMap();
    const nextMap = minimalSourceMap({ node: 'next' });
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      globalThis.DOMRect.fromRect({ x: 10, y: 20, width: 100, height: 40 })
    );
    const view = render(LivePreviewInspectionProbe, { props: { options: { sourceMap } } });
    await vi.advanceTimersByTimeAsync(100);
    expect(postMessage).not.toHaveBeenCalled();

    await view.rerender({ options: { sourceMap, enabled: true } });
    await vi.advanceTimersByTimeAsync(100);
    expect(postMessage.mock.calls.at(-1)?.[0].payload.nodes).toEqual({
      n: { coordinates: { x: 10, y: 20, width: 100, height: 40 } },
    });

    await view.rerender({ options: { sourceMap: nextMap, enabled: true }, nodeId: 'next' });
    await vi.advanceTimersByTimeAsync(100);
    expect(postMessage.mock.calls.at(-1)?.[0].payload).toMatchObject({
      sourceMap: nextMap,
      nodes: { next: { coordinates: { x: 10, y: 20, width: 100, height: 40 } } },
    });

    await view.rerender({ options: { enabled: true } });
    await vi.advanceTimersByTimeAsync(100);
    expect(postMessage.mock.calls.at(-1)?.[0].payload).toMatchObject({
      sourceMap: null,
      nodes: {},
    });

    await view.rerender({ options: { sourceMap: nextMap, enabled: true } });
    await view.rerender({ options: { sourceMap: nextMap, enabled: false } });
    postMessage.mockClear();
    window.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(100);
    expect(postMessage).not.toHaveBeenCalled();

    await view.rerender({ options: { sourceMap, enabled: true } });
    view.unmount();
    await tick();
    await vi.advanceTimersByTimeAsync(100);
    expect(postMessage).not.toHaveBeenCalled();
  });
});
