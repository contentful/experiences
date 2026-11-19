import type { RequestResult } from './request-result.js';
import { profile } from '../test/fixtures/runtime-profile.js';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import type { PreviewClient } from '@contentful/experiences-runtime';
import { ContentfulExperiences, createWebSnapshotRuntime } from '@contentful/experiences-web';
import { hydrateOptimizationData } from '@contentful/experiences-web/bridge-support';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KitRequestHarness from '../test/fixtures/KitRequestHarness.svelte';
import { createRequestSource } from './request-source.js';
import RuntimeHarness from '../test/fixtures/RuntimeHarness.svelte';
import type { RuntimeProbeCapture } from '../test/fixtures/runtime-probe.js';
import { bindSvelteKitClientExperiences } from './client-binding.js';
import { navigationHooks } from '../test/kit-navigation.js';
import type { ManagedRequestExperience } from './request-controller.svelte.js';

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
  navigationHooks.reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  globalThis.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('Kit client startup', () => {
  it.each(['root', 'provider'] as const)(
    'adopts the committed native loader source in a retained %s without an explicit route key',
    async (mode) => {
      const request = bind();
      const sdk =
        mode === 'provider'
          ? new ContentfulExperiences({
              ...browserConfig,
              defaults: { profile: profile('visitor') },
            })
          : undefined;
      const fetch = vi.spyOn(globalThis, 'fetch');
      const source = (id: string, requestId = id) =>
        createRequestSource({
          routeKey: `/?id=${id}`,
          result: {
            requestId,
            routeKey: `/?id=${id}`,
            experience: { experienceId: id },
            plan: { experienceId: id, nodes: [], diagnostics: [], metadata: {}, debug: false },
            initialPageOwner: 'server',
          },
        });
      window.history.replaceState({}, '', '/?id=first');
      const context = captureContext();
      const view = render(KitRequestHarness, {
        ...(mode === 'provider'
          ? { Provider: request.ExperiencesProvider, sdk }
          : { Root: request.ExperiencesRoot }),
        Experience: request.Experience,
        source: source('first'),
        capture: context.capture,
      });
      try {
        expect(view.container.textContent).toContain('first|success|first');
        expect(fetch).not.toHaveBeenCalled();
        await waitFor(() => expect(view.container.textContent).toContain('first|success|first'));
        await tick();
        if (sdk) {
          const original = context.current.scope.presentation.current;
          const lifetime = sdk.captureLifetime();
          await hydrateOptimizationData(sdk, { profile: undefined });
          await tick();
          expect(lifetime()).toBe(true);
          expect(sdk.states.profile.current).toBeUndefined();
          expect(context.current.scope.presentation.current.data).toBe(original.data);
          expect(context.current.scope.presentation.current.result).toBe(original.result);
          // Profile changes retain completed content; applications own concealment.
          await hydrateOptimizationData(sdk, { profile: profile('visitor') });
          await view.rerender({ source: source('first', 'restored') });
          await waitFor(() =>
            expect(view.container.textContent).toContain('restored|success|first')
          );
          const completed = context.current.scope.presentation.current;
          sdk.reset();
          await tick();
          expect(context.current.scope.presentation.current.data).toBe(completed.data);
          expect(context.current.scope.presentation.current.result).toBe(completed.result);
          await hydrateOptimizationData(sdk, { profile: profile('visitor') });
          context.current.actions.reset();
          await tick();
          expect(sdk.states.profile.current).toBeUndefined();
          expect(context.current.scope.presentation.current.data).toBe(completed.data);
          expect(context.current.scope.presentation.current.result).toBe(completed.result);
          sdk.setLocale('de-DE');
          await tick();
          expect(context.current.scope.presentation.current.data).toBeUndefined();
        }
        const navigation = {
          from: { url: new URL('https://example.test/?id=first') },
          to: { url: new URL('https://example.test/?id=second') },
        };
        // Kit supplies the committed URL and exact loader data before afterNavigate.
        window.history.replaceState({}, '', '/?id=second');
        await view.rerender({ source: source('second') });
        navigationHooks.after.forEach((callback) => callback(navigation));
        await tick();
        await waitFor(() => expect(view.container.textContent).toContain('second|success|second'));
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        view.unmount();
        sdk?.destroy();
      }
    }
  );

  it('refreshes matching Preview revisions through event-free server reads, retaining and recovering Destination content independently of event consent', async () => {
    window.history.replaceState({}, '', '/preview?preview_session_id=session');
    let payload: ExperiencePayload | undefined;
    let publish: (() => void) | undefined;
    const client: PreviewClient = {
      getResult: () => ({ data: payload, error: undefined }),
      subscribe: (listener) => {
        publish = listener;
        return () => {
          publish = undefined;
        };
      },
      subscribeStatus: () => () => {},
    };
    const sdk = new ContentfulExperiences({
      ...browserConfig,
      environmentId: 'master',
      allowedEventTypes: [],
      defaults: { consent: false },
      preview: { accessToken: 'preview-token', createClient: () => client },
    });
    try {
      const request = bind({ sdk });
      await request.init();
      const context = captureContext();
      expect(sdk.isPreview).toBe(true);
      await vi.waitFor(() => expect(publish).toBeDefined());
      const routeKey = '/preview?preview_session_id=session';
      const initial: RequestResult = {
        requestId: 'initial-preview',
        routeKey,
        experience: { destinationId: 'destination', path: '/preview' },
        plan: { experienceId: 'primary', nodes: [], diagnostics: [], metadata: {}, debug: false },
      };
      const recovered: RequestResult = {
        ...initial,
        requestId: 'recovered-preview',
        eventFree: true,
        plan: { ...initial.plan!, metadata: { revision: 'recovered' } },
      };
      const operations: string[] = [];
      let release!: () => void;
      const delayedRead = new Promise<void>((resolve) => {
        release = resolve;
      });
      let finishPreparation!: () => void;
      let started!: () => void;
      const preparing = new Promise<void>((resolve) => {
        started = resolve;
      });
      const preparation = new Promise<void>((resolve) => {
        finishPreparation = resolve;
      });
      const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
        const { operation } = JSON.parse(init!.body as string);
        operations.push(operation);
        if (operations.length === 1) {
          started();
          await preparation;
          return new globalThis.Response(JSON.stringify(initial));
        }
        if (operations.length === 2) return new globalThis.Response('', { status: 503 });
        await delayedRead;
        return new globalThis.Response(JSON.stringify(recovered));
      });
      const loading = request.loadExperience(
        { url: new URL(routeKey, window.location.origin), fetch },
        { experience: initial.experience }
      );
      await preparing;
      sdk.consent({ events: true });
      finishPreparation();
      const source = await loading;
      let current!: ManagedRequestExperience;
      const browserFetch = vi.spyOn(sdk, 'fetchExperience');
      render(KitRequestHarness, {
        Provider: request.ExperiencesProvider,
        sdk,
        Experience: request.Experience,
        source,
        capture: context.capture,
        observeRequest: (value) => {
          current = value;
        },
      });
      await waitFor(() =>
        expect(context.current.scope.presentation.current.result).toEqual(initial)
      );
      expect(context.current.scope.presentation.current.status).toBe('success');
      expect(operations).toEqual(['prepare']);
      await expect(
        current.acquire({ personalization: { events: [{ type: 'track', event: 'ignored' }] } })
      ).resolves.toBeUndefined();
      expect(current.result).toEqual(initial);
      expect(browserFetch).not.toHaveBeenCalled();
      payload = { sys: { id: 'unrelated' }, nodes: [] };
      publish!();
      await tick();
      expect(operations).toEqual(['prepare']);

      payload = { sys: { id: 'primary' }, nodes: [] };
      publish!();
      await vi.waitFor(() =>
        expect(context.current.scope.presentation.current.error?.message).toBe(
          'Experience preparation is unavailable.'
        )
      );
      expect(context.current.scope.presentation.current.result).toBeUndefined();
      expect(context.current.scope.presentation.current.data).toEqual(initial.plan);
      expect(operations).toEqual(['prepare', 'read']);

      payload = { sys: { id: 'primary' }, nodes: [] };
      publish!();
      await vi.waitFor(() => expect(operations).toEqual(['prepare', 'read', 'read']));
      sdk.consent({ events: false });
      release();
      await vi.waitFor(() =>
        expect(context.current.scope.presentation.current.result).toEqual(recovered)
      );
      expect(context.current.scope.presentation.current.data).toEqual(recovered.plan);
      expect(context.current.scope.presentation.current.status).toBe('success');
      expect(context.current.scope.presentation.current.error).toBeUndefined();
      expect(sdk.states.eventStream.current).toBeUndefined();
      expect(sdk.states.profile.current).toBeUndefined();
    } finally {
      cleanup();
      sdk.destroy();
      window.history.replaceState({}, '', '/');
    }
  });

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
    cleanup();
    // Teardown ends that activation. A fresh failed activation must follow the
    // same sticky policy while its source changes, without constructing a fallback.
    const blocker = new ContentfulExperiences(browserConfig);
    const failedRequest = bind({ onStatesReady: setup });
    await failedRequest.init();
    blocker.destroy();
    const captured: RequestResult = {
      requestId: 'captured',
      routeKey: '/',
      experience: { experienceId: 'primary' },
      plan: { experienceId: 'primary', nodes: [], diagnostics: [], metadata: {}, debug: false },
    };
    const failedView = render(KitRequestHarness, {
      Root: failedRequest.ExperiencesRoot,
      Experience: failedRequest.Experience,
      source: createRequestSource({ routeKey: '/', result: captured }),
    });
    expect(failedView.container.textContent).toContain('captured|success|primary');
    window.history.replaceState({}, '', '/next');
    const failed = await failedRequest.loadExperience(
      { url: new URL(window.location.href), fetch: vi.fn() },
      { experience: { experienceId: 'next' } }
    );
    await failedView.rerender({ source: failed });
    await waitFor(() => expect(failedView.container.textContent).toContain('|error|'));
    expect(failedView.container.textContent).not.toContain('primary');
    await failedView.rerender({ source: undefined });
    await waitFor(() => expect(failedView.container.textContent).toContain('|idle|'));
    await failedRequest.init();
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

  it('presents exact cached sources across owned Preview teardown, session changes and native back without reevaluation or replay', async () => {
    const ready = vi.fn();
    const request = bind({ preview: { accessToken: 'preview' }, onStatesReady: ready });
    await request.init();
    const context = captureContext();
    const read = vi.fn();
    const source = (id: string, routeKey: string) =>
      createRequestSource(
        {
          routeKey,
          result: {
            requestId: id,
            routeKey,
            experience: { experienceId: id },
            plan: {
              experienceId: id,
              nodes: [],
              diagnostics: [],
              metadata: { original: id },
              debug: false,
            },
          },
        },
        read
      );
    const firstKey = '/?preview_session_id=first';
    const secondKey = '/?preview_session_id=second';
    const firstSource = source('first', firstKey);
    const secondSource = source('second', secondKey);
    window.history.replaceState({}, '', firstKey);
    const view = render(KitRequestHarness, {
      Root: request.ExperiencesRoot,
      Experience: request.Experience,
      source: firstSource,
      capture: context.capture,
    });
    await waitFor(() => expect(view.container.textContent).toContain('first|success|first'));
    const first = context.current.owner.current.sdk;
    if (!(first instanceof ContentfulExperiences)) throw new Error('Expected live Preview owner');
    expect(first.isPreview).toBe(true);
    const original = context.current.scope.presentation.current;
    const commit = async (routeKey: string, candidate: typeof firstSource) => {
      const from = new URL(window.location.href);
      window.history.replaceState({}, '', routeKey);
      navigationHooks.after.forEach((callback) =>
        callback({ from: { url: from }, to: { url: new URL(window.location.href) } })
      );
      await view.rerender({ source: candidate });
    };
    await commit(secondKey, secondSource);
    await waitFor(() => expect(view.container.textContent).toContain('second|success|second'));
    expect(context.current.owner.current.sdk).not.toBe(first);
    await commit(firstKey, firstSource);
    await waitFor(() => expect(view.container.textContent).toContain('first|success|first'));
    expect(context.current.owner.current.sdk).not.toBe(first);
    expect(context.current.scope.presentation.current.result).toBe(original.result);
    expect(context.current.scope.presentation.current.data).toBe(original.data);
    expect(context.current.state.profile).toBeUndefined();
    expect(context.current.state.eventStream).toBeUndefined();
    await commit('/', source('published', '/'));
    await waitFor(() =>
      expect(view.container.textContent).toContain('published|success|published')
    );
    const published = context.current.owner.current.sdk;
    if (!(published instanceof ContentfulExperiences))
      throw new Error('Expected live published owner');
    expect(published.isPreview).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalledTimes(5);
  });
});
