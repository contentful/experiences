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
    { inspection: undefined, sourceMap: undefined, requested: false },
    { inspection: false, sourceMap: undefined, requested: false },
    { inspection: true, sourceMap: false, requested: true },
    { inspection: undefined, sourceMap: true, requested: true },
    { inspection: false, sourceMap: true, requested: true },
  ])(
    'requests source maps with inspection=$inspection and sourceMap=$sourceMap',
    async ({ inspection, sourceMap, requested }) => {
      ({ container, root } = renderRoot());
      await act(async () => {
        root!.render(
          <LivePreviewProbe
            options={{
              previewSessionOptions: { ...previewSessionOptions, sourceMap },
              inspection,
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
    'does not report geometry when inspection is %s',
    async (inspection) => {
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
            options={{ initialPlan, inspection, resolveOptions: { config: { components: {} } } }}
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

  it('observes the committed initial map when inspection is enabled while mounted', async () => {
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
      layers: [
        { kind: 'Experience', id: 'page' },
        { kind: 'SourceNode', sourceEntity: 0, id: 'hero' },
      ],
      dataAssemblies: [],
      nodes: {
        initial: {
          layers: [1, 0],
        },
      },
    };
    ({ container, root } = renderRoot());
    await act(async () => {
      root!.render(
        <LivePreviewProbe
          options={{
            initialPlan: { ...initialPlan, sourceMap },
            inspection: false,
            resolveOptions: { config: { components: {} } },
          }}
        />
      );
    });
    await act(async () => {
      root!.render(
        <LivePreviewProbe
          options={{
            initialPlan: { ...initialPlan, sourceMap },
            inspection: true,
            resolveOptions: { config: { components: {} } },
          }}
        />
      );
    });
    vi.spyOn(container.querySelector('output')!, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(20, 30, 200, 48)
    );
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(0, 0, 800, 600)
    );
    vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(0, 0, 800, 2000)
    );
    vi.advanceTimersByTime(200);

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
      nodes: { streamed: { layers: [] } },
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
            inspection: true,
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
    vi.advanceTimersByTime(200);
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
    vi.advanceTimersByTime(200);
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
      vi.advanceTimersByTime(200);
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
    vi.advanceTimersByTime(200);
    expect(output.textContent).toBe('mapless');
    expect(snapshots().at(-1)?.payload).toMatchObject({ nodes: {}, sourceMap: null });

    postMessage.mockClear();
    act(() => root!.unmount());
    root = undefined;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(32);
    expect(snapshots()).toEqual([]);
  });

  it.each([false, true])(
    'keeps geometry and subscription options in sync with explicit sourceMap=%s',
    async (sourceMap) => {
      vi.useFakeTimers();
      vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) =>
        window.setTimeout(() => callback(0), 16)
      );
      vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
      const postMessage = vi
        .spyOn(window.parent, 'postMessage')
        .mockImplementation(() => undefined);
      const snapshots = () =>
        postMessage.mock.calls
          .map(([message]) => message)
          .filter((message) => message.eventType === 'canvasGeometryUpdated');
      const resolveOptions = { config: { components: {} } };
      const options = {
        initialPlan,
        previewSessionOptions: { ...previewSessionOptions, sourceMap },
        resolveOptions,
      };
      ({ container, root } = renderRoot());
      await act(async () => root!.render(<LivePreviewProbe options={options} />));
      const first = FakeWebSocket.instances.at(-1)!;
      await act(async () => first.emitMessage({ type: 'next', data: payload('current') }));
      expect(container.textContent).toBe('current');
      await act(async () =>
        root!.render(<LivePreviewProbe options={{ ...options, inspection: true }} />)
      );
      expect(first.close).toHaveBeenCalledTimes(sourceMap ? 0 : 1);
      const refreshed = FakeWebSocket.instances.at(-1)!;
      expect(refreshed === first).toBe(sourceMap);
      expect(new URL(refreshed.url).searchParams.get('source_map')).toBe('true');
      expect(container.textContent).toBe('current');
      vi.advanceTimersByTime(200);
      expect(snapshots().at(-1)?.payload).toMatchObject({ nodes: {}, sourceMap: null });
      const map = {
        version: 1,
        variants: [],
        spaces: [],
        environments: [],
        locales: [],
        entries: [],
        assets: [],
        layers: [{ kind: 'SourceNode', sourceEntity: 0, id: 'authored' }],
        dataAssemblies: [],
        nodes: { current: { layers: [0] } },
      };
      await act(async () =>
        refreshed.emitMessage({
          type: 'next',
          data: {
            ...payload('mapped'),
            nodes: [{ ...payload('mapped').nodes[0]!, id: 'current' }],
            extensions: { sourceMap: map },
          },
        })
      );
      const output = container.querySelector('output')!;
      vi.spyOn(output, 'getBoundingClientRect').mockReturnValue(
        new globalThis.DOMRect(4, 8, 120, 40)
      );
      vi.advanceTimersByTime(200);
      expect(snapshots().at(-1)?.payload).toMatchObject({
        sourceMap: map,
        nodes: { current: { coordinates: { x: 4, y: 8, width: 120, height: 40 } } },
      });
      postMessage.mockClear();
      window.dispatchEvent(new Event('resize'));
      await act(async () =>
        root!.render(<LivePreviewProbe options={{ ...options, inspection: false }} />)
      );
      if (!sourceMap) {
        await act(async () => refreshed.emitMessage({ type: 'next', data: payload('obsolete') }));
      }
      expect(refreshed.close).toHaveBeenCalledTimes(sourceMap ? 0 : 1);
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(200);
      expect(container.textContent).toBe('mapped');
      expect(snapshots()).toEqual([]);
      const disabled = FakeWebSocket.instances.at(-1)!;
      await act(async () =>
        root!.render(
          <LivePreviewProbe
            options={{
              ...options,
              inspection: false,
              previewSessionOptions: { ...previewSessionOptions, sourceMap: !sourceMap },
            }}
          />
        )
      );
      expect(disabled.close).toHaveBeenCalled();
      expect(new URL(FakeWebSocket.instances.at(-1)!.url).searchParams.has('source_map')).toBe(
        !sourceMap
      );
      expect(container.textContent).toBe('mapped');
      vi.advanceTimersByTime(200);
      expect(snapshots()).toEqual([]);
    }
  );

  it('keeps geometry paired with the latest committed render when an older resolve completes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) =>
      window.setTimeout(() => callback(0), 16)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    let finishSlow: ((value: Record<string, unknown>) => void) | undefined;
    const resolveOptions = {
      config: {
        components: {
          hero: {
            resolveData: ({ content }: { content: Record<string, unknown> }) =>
              content.title === 'slow'
                ? new Promise<Record<string, unknown>>((resolve) => {
                    finishSlow = resolve;
                  })
                : {},
          },
        },
      },
    };
    const map = (id: string) => ({
      version: 1,
      variants: [],
      spaces: [],
      environments: [],
      locales: [],
      entries: [],
      assets: [],
      layers: [],
      dataAssemblies: [],
      nodes: { [id]: { layers: [] } },
    });
    const update = (title: string) => ({
      ...payload(title),
      nodes: [{ ...payload(title).nodes[0]!, id: title }],
      extensions: { sourceMap: map(title) },
    });
    ({ container, root } = renderRoot());
    await act(async () =>
      root!.render(
        <LivePreviewProbe
          options={{ initialPlan, inspection: true, previewSessionOptions, resolveOptions }}
        />
      )
    );
    const socket = FakeWebSocket.instances.at(-1)!;
    await act(async () => socket.emitMessage({ type: 'next', data: update('slow') }));
    await act(async () => socket.emitMessage({ type: 'next', data: update('fast') }));
    await act(async () => finishSlow!({}));
    vi.advanceTimersByTime(200);
    expect(container.textContent).toBe('fast');
    const snapshots = postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.eventType === 'canvasGeometryUpdated');
    expect(snapshots.at(-1)?.payload.sourceMap).toEqual(map('fast'));
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
      vi.advanceTimersByTime(200);
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
