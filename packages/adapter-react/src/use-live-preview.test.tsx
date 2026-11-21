/** @vitest-environment jsdom */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import {
  useLivePreviewExperience,
  type UseLivePreviewExperienceOptions,
} from './use-live-preview-experience';
import { useLivePreview, type UseLivePreviewOptions } from './use-live-preview';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly close = vi.fn();
  onopen: ((event: { type: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  emitOpen(): void {
    this.onopen?.({ type: 'open' });
  }

  emitClose(code = 1000, reason = ''): void {
    this.onclose?.({ code, reason });
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data });
  }
}

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
});

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

const previewSessionOptions = {
  environmentId: 'environment-id',
  previewToken: 'preview-token',
  sessionHost: 'wss://preview-session.example.test',
  sessionId: 'session-id',
  spaceId: 'space-id',
};

const rawOptions = (
  overrides: Partial<UseLivePreviewExperienceOptions> = {}
): UseLivePreviewExperienceOptions => ({
  previewSessionOptions,
  ...overrides,
});

function RawLivePreviewProbe({
  options,
}: {
  options: UseLivePreviewExperienceOptions;
}): ReactElement {
  const { data, error } = useLivePreviewExperience(options);
  return (
    <output data-error={error?.name ?? ''}>
      {(data?.nodes[0]?.contentProperties?.title as string) ?? ''}
    </output>
  );
}

function LivePreviewProbe({ options }: { options: UseLivePreviewOptions }): ReactElement {
  const { data } = useLivePreview(options);
  return (
    <output data-cf-node-id={data?.nodes[0]?.nodeId}>
      {(data?.nodes[0]?.props.content.title as string) ?? ''}
    </output>
  );
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
    FakeWebSocket.instances = [];
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the initial plan when no Preview Session is configured', async () => {
    ({ container, root } = renderRoot());

    await act(async () => {
      root!.render(
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

  it.each([
    { inspector: undefined, sourceMap: undefined, requested: false },
    { inspector: false, sourceMap: undefined, requested: false },
    { inspector: true, sourceMap: false, requested: true },
    { inspector: undefined, sourceMap: true, requested: true },
    { inspector: false, sourceMap: true, requested: true },
  ])(
    'requests source maps with inspector=$inspector and sourceMap=$sourceMap',
    async ({ inspector, sourceMap, requested }) => {
      ({ container, root } = renderRoot());
      await act(async () => {
        root!.render(
          <LivePreviewProbe
            options={{
              previewSessionOptions: { ...previewSessionOptions, sourceMap },
              inspector,
              resolveOptions: { config: { components: {} } },
            }}
          />
        );
      });
      expect(new URL(FakeWebSocket.instances[0]!.url).searchParams.has('source_map')).toBe(
        requested
      );
    }
  );

  it.each([undefined, false])(
    'does not report geometry when inspector is %s',
    async (inspector) => {
      vi.useFakeTimers();
      vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) =>
        window.setTimeout(() => callback(0), 16)
      );
      vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
      const postMessage = vi
        .spyOn(window.parent, 'postMessage')
        .mockImplementation(() => undefined);
      ({ container, root } = renderRoot());
      await act(async () => {
        root!.render(
          <LivePreviewProbe
            options={{ initialPlan, inspector, resolveOptions: { config: { components: {} } } }}
          />
        );
      });
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(32);
      expect(
        postMessage.mock.calls.filter(([message]) => message.eventType === 'canvasGeometryUpdated')
      ).toEqual([]);
    }
  );

  it('reports measured initial-plan geometry and its unchanged map to the parent like Studio', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) =>
      window.setTimeout(() => callback(0), 16)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const sourceMap = {
      version: 1,
      variants: [],
      spaces: [],
      environments: [],
      locales: [],
      entries: [],
      assets: [],
      layers: [{ kind: 'Experience', id: 'page' }],
      sources: [{ layer: 0, id: 'hero' }],
      dataAssemblies: [],
      nodes: {
        initial: {
          path: [0],
        },
      },
    };
    ({ container, root } = renderRoot());
    await act(async () => {
      root!.render(
        <LivePreviewProbe
          options={{
            initialPlan: { ...initialPlan, sourceMap },
            inspector: true,
            resolveOptions: { config: { components: {} } },
          }}
        />
      );
    });
    vi.spyOn(container.querySelector('output')!, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(20, 30, 200, 48)
    );
    const bodyRect = vi
      .spyOn(document.body, 'getBoundingClientRect')
      .mockReturnValue(new globalThis.DOMRect(0, 0, 800, 600));
    vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(0, 0, 800, 2000)
    );
    vi.advanceTimersByTime(16);

    expect(postMessage).toHaveBeenCalledWith(
      {
        source: 'customer-app',
        eventType: 'canvasGeometryUpdated',
        payload: {
          size: { width: 800, height: 600 },
          nodes: { initial: { coordinates: { x: 20, y: 30, width: 200, height: 48 } } },
          sourceMap,
        },
      },
      '*'
    );

    const duplicate = document.createElement('div');
    duplicate.setAttribute('data-cf-node-id', 'initial');
    await act(async () => container!.append(duplicate));
    vi.advanceTimersByTime(16);
    expect(postMessage.mock.lastCall?.[0].payload.nodes).toEqual({});
    await act(async () => duplicate.remove());
    vi.advanceTimersByTime(16);
    expect(postMessage.mock.lastCall?.[0].payload.nodes).toEqual({
      initial: { coordinates: { x: 20, y: 30, width: 200, height: 48 } },
    });

    bodyRect.mockReturnValue(new globalThis.DOMRect(0, 0, 800, 120));
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(16);
    expect(postMessage.mock.lastCall?.[0].payload.size).toEqual({ width: 800, height: 120 });

    vi.spyOn(container!, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(20, 30, 200, 48)
    );
    await act(async () => {
      container!.querySelector('output')!.style.marginBottom = '80px';
    });
    vi.advanceTimersByTime(16);
    expect(postMessage.mock.lastCall?.[0].payload.size).toEqual({ width: 800, height: 158 });
  });

  it('reports the accepted streamed plan and clears targets for missing or malformed maps', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) =>
      window.setTimeout(() => callback(0), 16)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const map = {
      version: 1,
      variants: [],
      spaces: [],
      environments: [],
      locales: [],
      entries: [],
      assets: [],
      layers: [],
      dataAssemblies: [],
      nodes: { streamed: { path: [] } },
    };
    const resolveOptions = {
      config: {
        components: {
          hero: {
            resolveData: ({ content }: { content: Record<string, unknown> }) => {
              if (content.title === 'rejected') throw new Error('rejected update');
              return {};
            },
          },
        },
      },
    };
    ({ container, root } = renderRoot());
    await act(async () => {
      root!.render(
        <LivePreviewProbe
          options={{
            initialPlan,
            previewSessionOptions,
            resolveOptions,
            inspector: true,
          }}
        />
      );
    });
    const output = container.querySelector('output')!;
    vi.spyOn(output, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(10, 50, 180, 40)
    );
    const socket = FakeWebSocket.instances[0]!;
    expect(new URL(socket.url).searchParams.get('source_map')).toBe('true');
    const update = (title: string, withMap = true): ExperiencePayload => ({
      ...payload(title),
      nodes: [{ ...payload(title).nodes[0]!, id: 'streamed' }],
      ...(withMap ? { extensions: { sourceMap: map } } : {}),
    });
    const snapshots = () =>
      postMessage.mock.calls
        .map(([message]) => message)
        .filter((message) => message.eventType === 'canvasGeometryUpdated');

    await act(async () =>
      socket.emitMessage(JSON.stringify({ type: 'next', data: update('accepted') }))
    );
    vi.advanceTimersByTime(16);
    expect(output.textContent).toBe('accepted');
    expect(snapshots().at(-1)?.payload).toMatchObject({
      nodes: { streamed: { coordinates: { x: 10, y: 50, width: 180, height: 40 } } },
      sourceMap: map,
    });

    postMessage.mockClear();
    await act(async () =>
      socket.emitMessage(JSON.stringify({ type: 'next', data: update('rejected') }))
    );
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(16);
    expect(output.textContent).toBe('accepted');
    expect(snapshots().at(-1)?.payload.sourceMap).toEqual(map);

    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(0, 0, 300, 100)
    );
    for (const sourceMap of [{}, { nodes: null }, { nodes: 42 }, { nodes: [] }]) {
      await act(async () =>
        socket.emitMessage(
          JSON.stringify({
            type: 'next',
            data: { ...update('malformed'), extensions: { sourceMap } },
          })
        )
      );
      vi.advanceTimersByTime(16);
      expect(output.textContent).toBe('malformed');
      expect(snapshots().at(-1)?.payload).toEqual({
        size: { width: 300, height: 100 },
        nodes: {},
        sourceMap: null,
      });
    }

    await act(async () =>
      socket.emitMessage(JSON.stringify({ type: 'next', data: update('mapless', false) }))
    );
    vi.advanceTimersByTime(16);
    expect(output.textContent).toBe('mapless');
    expect(snapshots().at(-1)?.payload).toMatchObject({ nodes: {}, sourceMap: null });

    postMessage.mockClear();
    act(() => root!.unmount());
    root = undefined;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(32);
    expect(snapshots()).toEqual([]);
  });

  it('sends static status when a session credential is missing', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const initialPayload = payload('initial');
    ({ container, root } = renderRoot());

    await act(async () => {
      root!.render(
        <RawLivePreviewProbe
          options={rawOptions({
            initialPayload,
            previewSessionOptions: { ...previewSessionOptions, sessionId: undefined },
          })}
        />
      );
    });

    expect(container.textContent).toBe('initial');
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: 'experiences/live-preview',
        type: 'status',
        status: 'static',
      },
      '*'
    );
  });

  it('sends live status after the session socket opens', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    ({ root } = renderRoot());

    await act(async () => {
      root!.render(<RawLivePreviewProbe options={rawOptions()} />);
    });

    expect(postMessage).not.toHaveBeenCalled();

    await act(async () => {
      FakeWebSocket.instances[0]?.emitOpen();
    });

    expect(postMessage).toHaveBeenCalledWith(
      {
        source: 'experiences/live-preview',
        type: 'status',
        status: 'live',
      },
      '*'
    );
  });

  it('does not send static status while the session socket reconnects', async () => {
    vi.useFakeTimers();
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    ({ root } = renderRoot());

    await act(async () => {
      root!.render(<RawLivePreviewProbe options={rawOptions()} />);
      FakeWebSocket.instances[0]?.emitOpen();
    });

    await act(async () => {
      FakeWebSocket.instances[0]?.onclose?.({ code: 1006, reason: 'network' });
      vi.advanceTimersByTime(100);
      FakeWebSocket.instances[1]?.emitOpen();
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith(
      {
        source: 'experiences/live-preview',
        type: 'status',
        status: 'live',
      },
      '*'
    );
  });

  it('exposes a connection error after retries are exhausted', async () => {
    vi.useFakeTimers();
    ({ container, root } = renderRoot());

    await act(async () => {
      root!.render(<RawLivePreviewProbe options={rawOptions()} />);
    });

    await act(async () => {
      for (let retry = 0; retry < 3; retry += 1) {
        FakeWebSocket.instances.at(-1)?.emitClose(1006, 'network');
        vi.runOnlyPendingTimers();
      }
      FakeWebSocket.instances.at(-1)?.emitClose(1006, 'network');
    });

    expect(container.querySelector('output')?.dataset.error).toBe('LivePreviewConnectionError');
  });

  it('sends a new status when the live-preview configuration changes', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    ({ root } = renderRoot());

    await act(async () => {
      root!.render(
        <RawLivePreviewProbe
          options={rawOptions({
            previewSessionOptions: { ...previewSessionOptions, sessionId: undefined },
          })}
        />
      );
    });

    await act(async () => {
      root!.render(<RawLivePreviewProbe options={rawOptions()} />);
    });
    await act(async () => {
      FakeWebSocket.instances[0]?.emitOpen();
    });

    await act(async () => {
      root!.render(
        <RawLivePreviewProbe
          options={rawOptions({
            previewSessionOptions: { ...previewSessionOptions, sessionId: undefined },
          })}
        />
      );
    });

    expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
      { source: 'experiences/live-preview', type: 'status', status: 'static' },
      { source: 'experiences/live-preview', type: 'status', status: 'live' },
      { source: 'experiences/live-preview', type: 'status', status: 'static' },
    ]);
  });
});
