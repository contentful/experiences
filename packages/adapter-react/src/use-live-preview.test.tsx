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
  const { data } = useLivePreviewExperience(options);
  return <output>{data?.nodes[0]?.contentProperties?.title ?? ''}</output>;
}

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

  it('sends static status when a session credential is missing', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const initialPayload = payload('initial');
    ({ container, root } = renderRoot());

    await act(async () => {
      root.render(
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
      root.render(<RawLivePreviewProbe options={rawOptions()} />);
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
      root.render(<RawLivePreviewProbe options={rawOptions()} />);
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

  it('sends a new status when the live-preview configuration changes', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    ({ root } = renderRoot());

    await act(async () => {
      root.render(
        <RawLivePreviewProbe
          options={rawOptions({
            previewSessionOptions: { ...previewSessionOptions, sessionId: undefined },
          })}
        />
      );
    });

    await act(async () => {
      root.render(<RawLivePreviewProbe options={rawOptions()} />);
    });
    await act(async () => {
      FakeWebSocket.instances[0]?.emitOpen();
    });

    await act(async () => {
      root.render(
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
