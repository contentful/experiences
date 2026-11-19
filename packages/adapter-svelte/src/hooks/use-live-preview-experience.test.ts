import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { type Config } from '@contentful/experiences-web';
import { cleanup, render } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { fromStore, writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LivePreviewExperienceProbe from '../test/fixtures/LivePreviewExperienceProbe.svelte';
import { componentNode } from '../test/fixtures/render-plan.js';
import RuntimeHarness from '../test/fixtures/RuntimeHarness.svelte';
import {
  useLivePreviewExperience,
  type UseLivePreviewExperienceOptions,
} from './use-live-preview-experience.svelte.js';
import { useLivePreview } from './use-live-preview.svelte.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly close = vi.fn();
  onopen: ((event: { type: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor() {
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
  sys: { type: 'Experience' },
  nodes: [componentNode('hero', { contentProperties: { title } })],
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

  it('forwards live content and status, retains content during reconnect and exposes terminal failure', async () => {
    vi.useFakeTimers();
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const view = render(LivePreviewExperienceProbe, {
      props: { options: options({ initialPayload: payload('initial') }) },
    });
    expect(view.container.textContent).toBe('initial');
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(postMessage).not.toHaveBeenCalled();
    FakeWebSocket.instances[0]!.emitOpen();
    FakeWebSocket.instances[0]!.emitMessage(
      JSON.stringify({ type: 'next', data: payload('updated') })
    );
    await tick();
    expect(view.container.textContent).toBe('updated');
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: 'experiences/live-preview',
        type: 'status',
        status: 'live',
      },
      '*'
    );
    FakeWebSocket.instances[0]!.emitClose({ code: 1006, reason: 'network' });
    vi.runOnlyPendingTimers();
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1]!.emitOpen();
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toBe('updated');
    for (let retry = 0; retry < 4; retry += 1) {
      FakeWebSocket.instances.at(-1)!.emitClose({ code: 1006, reason: 'network' });
      vi.runOnlyPendingTimers();
    }
    await tick();
    expect(view.container.querySelector('output')?.dataset.error).toBe(
      'LivePreviewConnectionError'
    );
    expect(view.container.textContent).toBe('updated');
    view.unmount();
  });

  it.each([undefined, { ...previewSessionOptions, sessionId: undefined }])(
    'keeps initial content and reports static without complete session options (%s)',
    (previewSessionOptions) => {
      const postMessage = vi
        .spyOn(window.parent, 'postMessage')
        .mockImplementation(() => undefined);
      const view = render(LivePreviewExperienceProbe, {
        props: { options: { initialPayload: payload('initial'), previewSessionOptions } },
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
    }
  );
});

describe('useLivePreviewExperience in managed context', () => {
  const config: Config = {
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'test' },
    locale: 'en-US',
  };
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it.each([undefined, { ...previewSessionOptions, sessionId: undefined }])(
    'preserves supplied payload and plan without publishing legacy status (%s)',
    (previewSessionOptions) => {
      const postMessage = vi
        .spyOn(window.parent, 'postMessage')
        .mockImplementation(() => undefined);
      const initialPayload = payload('supplied');
      const initialPlan = { nodes: [], metadata: {}, debug: false, diagnostics: [] };
      let supplied: ReturnType<typeof useLivePreviewExperience> | undefined;
      let plan: ReturnType<typeof useLivePreview> | undefined;
      const view = render(RuntimeHarness, {
        config,
        initialize() {
          supplied = useLivePreviewExperience(() => ({ initialPayload, previewSessionOptions }));
          plan = useLivePreview(() => ({
            previewSessionOptions,
            initialPlan,
            resolveOptions: { config: { components: {} } },
          }));
        },
      });
      expect(supplied?.data).toEqual(initialPayload);
      expect(supplied?.error).toBeUndefined();
      expect(plan?.data).toEqual(initialPlan);
      expect(plan?.error).toBeUndefined();
      expect(postMessage).not.toHaveBeenCalled();
      view.unmount();
    }
  );

  it.each([false, true])(
    'refuses competing Preview client creation (configured later: %s)',
    (later) => {
      const configured = writable(later ? undefined : previewSessionOptions);
      const current = fromStore(configured);
      const initialize = () =>
        useLivePreviewExperience(() => ({ previewSessionOptions: current.current }));
      if (later) {
        render(RuntimeHarness, { config, initialize });
        expect(() => flushSync(() => configured.set(previewSessionOptions))).toThrow(
          'Legacy Preview hooks cannot own'
        );
      } else {
        expect(() => render(RuntimeHarness, { config, initialize })).toThrow(
          'Legacy Preview hooks cannot own'
        );
      }
    }
  );
});
