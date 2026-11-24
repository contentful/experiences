import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExperienceSourceMap } from '@contentful/experiences-sdk-core';
import { useLivePreviewInspection, type UseLivePreviewInspectionOptions } from './index';

function Probe({ options }: { options: UseLivePreviewInspectionOptions }) {
  useLivePreviewInspection(options);
  return <div data-cf-node-id={Object.keys(options.sourceMap?.nodes ?? {})[0]}>rendered</div>;
}

const sourceMap = (id: string): ExperienceSourceMap => ({
  version: 1,
  variants: [],
  spaces: [],
  environments: [],
  locales: [],
  entries: [],
  assets: [],
  layers: [{ kind: 'SourceNode', sourceEntity: 1, id: 'authored' }],
  dataAssemblies: [],
  nodes: { [id]: { layers: [0, 1] } },
});

describe('useLivePreviewInspection', () => {
  let root: Root;
  let container: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) =>
      window.setTimeout(() => callback(0), 16)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
    container = document.createElement('section');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('observes supplied maps after commit, replaces pending work and never opens a session', async () => {
    const connect = vi.fn();
    vi.stubGlobal('WebSocket', connect);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const first = sourceMap('first');
    const second = sourceMap('second');
    await act(async () => root.render(<Probe options={{ sourceMap: first, enabled: true }} />));
    await act(async () => root.render(<Probe options={{ sourceMap: second, enabled: true }} />));
    vi.spyOn(container.firstElementChild!, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(5, 6, 70, 80)
    );
    vi.advanceTimersByTime(200);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.lastCall?.[0].payload).toMatchObject({
      sourceMap: second,
      nodes: { second: { coordinates: { x: 5, y: 6, width: 70, height: 80 } } },
    });
    expect(postMessage.mock.lastCall?.[0].payload.sourceMap).toBe(second);
    expect(connect).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    postMessage.mockClear();
    window.dispatchEvent(new Event('resize'));
    await act(async () => root.render(<Probe options={{ sourceMap: second, enabled: false }} />));
    vi.advanceTimersByTime(200);
    expect(postMessage).not.toHaveBeenCalled();
    await act(async () => root.render(<Probe options={{ sourceMap: second, enabled: true }} />));
    act(() => root.unmount());
    vi.advanceTimersByTime(200);
    expect(postMessage).not.toHaveBeenCalled();
  });
});
