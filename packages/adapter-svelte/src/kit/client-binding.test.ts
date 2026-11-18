import { ContentfulExperiences, createWebSnapshotRuntime } from '@contentful/experiences-web';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RuntimeHarness from '../test/fixtures/RuntimeHarness.svelte';
import type { RuntimeProbeCapture } from '../test/fixtures/runtime-probe.js';
import { bindSvelteKitClientExperiences } from './client-binding.js';

const browserConfig = {
  spaceId: 'space',
  environmentId: 'environment',
  delivery: { accessToken: 'browser-token' },
};
function bind(options = {}) {
  return bindSvelteKitClientExperiences({
    config: { components: {} },
    endpoint: '/_exo/primary',
    ...browserConfig,
    ...options,
  }).request;
}
function captureContext() {
  let current: Parameters<RuntimeProbeCapture>[0];
  return {
    capture: (next: typeof current) => {
      current = next;
    },
    get current() {
      return current!;
    },
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  globalThis.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('Kit client startup', () => {
  it('defers construction, initializes once and shares startup with the mounted root', async () => {
    const ready = vi.fn();
    const request = bind({ onStatesReady: ready });
    // Binding itself leaves the Web singleton available.
    new ContentfulExperiences(browserConfig).destroy();
    await request.init();
    await request.init();
    expect(ready).toHaveBeenCalledOnce();
    const context = captureContext();
    const view = render(RuntimeHarness, {
      config: browserConfig,
      Root: request.ExperiencesRoot,
      capture: context.capture,
    });
    const sdk = context.current.owner.current.sdk;
    expect(view.container.textContent).toContain('ready|');
    await view.rerender({ routeKey: '/next?query=1' });
    expect(context.current.owner.current.sdk).toBe(sdk);
    expect(ready).toHaveBeenCalledOnce();
    view.unmount();
    expect(context.current.state.status).toBe('disposed');
    expect(() => render(request.ExperiencesProvider, { sdk: {} as ContentfulExperiences })).toThrow(
      /ownership mode cannot change/
    );
    new ContentfulExperiences(browserConfig).destroy();
    await request.init();
    const next = render(RuntimeHarness, { config: browserConfig, Root: request.ExperiencesRoot });
    expect(next.container.textContent).toContain('ready|');
    expect(ready).toHaveBeenCalledTimes(2);
  });

  it('presents a sticky construction failure without retrying at mount or later init', async () => {
    const existing = new ContentfulExperiences(browserConfig);
    const setup = vi.fn();
    const request = bind({ onStatesReady: setup });
    await expect(request.init()).resolves.toBeUndefined();
    existing.destroy();
    const view = render(RuntimeHarness, { config: browserConfig, Root: request.ExperiencesRoot });
    expect(view.container.textContent).toContain('error|');
    expect(view.container.textContent).toContain('already initialized');
    expect(view.getByText('supplied content')).toBeTruthy();
    await request.init();
    expect(setup).not.toHaveBeenCalled();
  });

  it('leaves browser initialization available after server evaluation', async () => {
    const ready = vi.fn();
    const request = bind({ onStatesReady: ready });
    const browser = window;
    vi.stubGlobal('window', undefined);
    await request.init();
    expect(ready).not.toHaveBeenCalled();
    vi.stubGlobal('window', browser);
    const view = render(RuntimeHarness, { config: browserConfig, Root: request.ExperiencesRoot });
    expect(view.container.textContent).toContain('ready|');
    expect(ready).toHaveBeenCalledOnce();
  });

  it('captures the preselected caller SDK until teardown and accepts a fresh binding after caller destruction', async () => {
    const sdk = new ContentfulExperiences(browserConfig);
    const destroy = vi.spyOn(sdk, 'destroy');
    const release = vi.fn();
    const ready = vi.fn(() => release);
    const { request } = bindSvelteKitClientExperiences({
      config: { components: {} },
      endpoint: '/_exo/primary',
      sdk,
      onStatesReady: ready,
    });
    await request.init();
    await request.init();
    expect(ready).toHaveBeenCalledOnce();
    const context = captureContext();
    const view = render(RuntimeHarness, {
      config: browserConfig,
      sdk,
      Provider: request.ExperiencesProvider,
      capture: context.capture,
    });
    expect(context.current.owner.current.sdk).toBe(sdk);
    await view.rerender({ sdk: createWebSnapshotRuntime() as ContentfulExperiences });
    expect(context.current.owner.current.sdk).toBe(sdk);
    window.history.replaceState({}, '', '/?preview_session_id=caller-owned');
    await view.rerender({ routeKey: '/?preview_session_id=caller-owned' });
    expect(context.current.owner.current.sdk).toBe(sdk);
    expect(ready).toHaveBeenCalledOnce();
    view.unmount();
    expect(release).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
    sdk.destroy();
    const nextSdk = new ContentfulExperiences(browserConfig);
    try {
      const nextRequest = bind({ sdk: nextSdk });
      await nextRequest.init();
      const next = render(RuntimeHarness, {
        config: browserConfig,
        sdk: nextSdk,
        Provider: nextRequest.ExperiencesProvider,
        capture: context.capture,
      });
      expect(context.current.state.ready).toBe(true);
      expect(context.current.owner.current.sdk).toBe(nextSdk);
      next.unmount();
    } finally {
      nextSdk.destroy();
    }
  });

  it('replaces early and mounted Preview activations when the committed URL session changes', async () => {
    const ready = vi.fn();
    const request = bind({ preview: { accessToken: 'preview' }, onStatesReady: ready });
    await request.init();
    const context = captureContext();
    window.history.replaceState({}, '', '/?preview_session_id=first');
    const view = render(RuntimeHarness, {
      config: browserConfig,
      Root: request.ExperiencesRoot,
      capture: context.capture,
    });
    const first = context.current.owner.current.sdk;
    if (!(first instanceof ContentfulExperiences)) throw new Error('Expected live Preview SDK');
    expect(first.isPreview).toBe(true);
    await request.init();
    expect(ready).toHaveBeenCalledTimes(2);
    window.history.replaceState({}, '', '/?preview_session_id=second');
    await view.rerender({ routeKey: '/?preview_session_id=second' });
    expect(context.current.state.ready).toBe(true);
    expect(context.current.owner.current.sdk).not.toBe(first);
    await request.init();
    expect(ready).toHaveBeenCalledTimes(3);
  });
});
