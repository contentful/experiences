import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

import LivePreviewExperienceProbe from './test-fixtures/LivePreviewExperienceProbe.svelte';
import type { UseLivePreviewExperienceOptions } from './use-live-preview-experience.svelte.js';

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

  emitClose(event: { code: number; reason: string }): void {
    this.onclose?.(event);
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

const previewSessionOptions = {
  environmentId: 'environment-id',
  previewToken: 'preview-token',
  sessionHost: 'wss://preview-session.example.test',
  sessionId: 'session-id',
  spaceId: 'space-id',
};

const options = (
  overrides: Partial<UseLivePreviewExperienceOptions> = {}
): UseLivePreviewExperienceOptions => ({
  previewSessionOptions,
  ...overrides,
});

describe('useLivePreviewExperience', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns initial raw data and updates from the Preview Session', async () => {
    const initialPayload = payload('initial');
    const view = render(LivePreviewExperienceProbe, {
      props: { options: options({ initialPayload }) },
    });
    expect(view.container.textContent).toBe('initial');
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0]?.emitMessage(
      JSON.stringify({ type: 'next', data: payload('updated') })
    );
    await vi.waitFor(() => expect(view.container.textContent).toBe('updated'));
  });

  it('does not connect when a session credential is missing', () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const view = render(LivePreviewExperienceProbe, {
      props: {
        options: options({
          initialPayload: payload('initial'),
          previewSessionOptions: { ...previewSessionOptions, sessionId: undefined },
        }),
      },
    });

    expect(view.container.textContent).toBe('initial');
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
    render(LivePreviewExperienceProbe, { props: { options: options() } });

    expect(postMessage).not.toHaveBeenCalled();

    FakeWebSocket.instances[0]?.emitOpen();
    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        {
          source: 'experiences/live-preview',
          type: 'status',
          status: 'live',
        },
        '*'
      )
    );
  });

  it('does not send static status while the session socket reconnects', async () => {
    vi.useFakeTimers();
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    render(LivePreviewExperienceProbe, { props: { options: options() } });

    FakeWebSocket.instances[0]?.emitOpen();
    FakeWebSocket.instances[0]?.emitClose({ code: 1006, reason: 'network' });
    vi.advanceTimersByTime(100);
    FakeWebSocket.instances[1]?.emitOpen();

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

  it('sends static status without Preview Session options', () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    render(LivePreviewExperienceProbe, {
      props: { options: { initialPayload: payload('initial') } },
    });

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
});
