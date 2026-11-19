import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { ContentfulExperiences } from '@contentful/experiences-web';
import { ContentfulExperiences as Runtime } from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { createExperiences } from '../../experience/create-experiences.js';
import type {
  ManagedExperience,
  ManagedExperienceAcquireOptions,
} from '../../experience/source-types.js';
import type { KitExperiencesRootProps } from '../../kit/client-binding.js';
import { bindSvelteKitClientExperiences } from '../../kit/client-binding.js';
import type { ManagedRequestExperience } from '../../kit/request-controller.svelte.js';
import { createRequestSource, type RequestCandidate } from '../../kit/request-source.js';
import KitRequestHarness from '../fixtures/KitRequestHarness.svelte';
import type { RuntimeProbeCapture } from '../fixtures/runtime-probe.js';
import { profile } from '../fixtures/runtime-profile.js';
import * as navigation from '../kit-navigation.js';

const owners: ContentfulExperiences[] = [];
const track = { events: [{ type: 'track' as const, event: 'reference_custom_action' }] };
const identify = {
  events: [{ type: 'identify' as const, userId: 'charles', traits: { identified: true } }],
};
const page = { events: [{ type: 'page' as const, properties: { title: 'Explicit action' } }] };
const plan = (marker: string): PortableRenderPlan => ({
  experienceId: 'primary',
  nodes: [],
  metadata: { marker },
  debug: false,
  diagnostics: [],
});
function candidate(marker: string, routeKey = '/'): RequestCandidate {
  return {
    routeKey,
    result: {
      requestId: marker,
      routeKey,
      experience: { experienceId: 'primary' },
      plan: plan(marker),
      initialPageOwner: 'server',
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup(
  read = vi.fn(async () => ({
    ...candidate('kit-read'),
    result: {
      ...candidate('kit-read').result!,
      eventFree: true,
      initialPageOwner: undefined,
    },
  })),
  buildPagePayload?: KitExperiencesRootProps['buildPagePayload']
) {
  const config = { components: {} };
  const sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'test' },
    defaults: { consent: true, persistenceConsent: false, profile: profile('visitor') },
    allowedEventTypes: [],
    autoTrackEntryInteraction: { views: false, hovers: false, clicks: false },
  });
  owners.push(sdk);
  let webCount = 0;
  // Preserve the Web policy owners; intercept only content and event transport.
  const fetch = vi
    .spyOn(Runtime.prototype, 'fetchExperience')
    .mockImplementation(async () => plan(`web-${++webCount}`));
  const send = vi.spyOn(sdk.api.personalization, 'upsertProfile').mockResolvedValue({
    profile: profile('visitor'),
  } as never);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
  const request = bindSvelteKitClientExperiences({
    config,
    endpoint: '/_exo/primary',
    sdk,
  }).request;
  const WebExperience = createExperiences({ config }).Experience;
  let context!: Parameters<RuntimeProbeCapture>[0];
  let web!: ManagedExperience;
  let native!: ManagedRequestExperience;
  const initial = candidate('initial');
  const view = render(KitRequestHarness, {
    Root: request.ExperiencesRoot,
    Experience: request.Experience,
    WebExperience,
    buildPagePayload,
    source: createRequestSource(initial, read),
    capture: (value) => {
      context = value;
    },
    observeRequest: (value) => {
      native = value;
    },
    observeWeb: (value) => {
      web = value;
    },
  });
  await waitFor(() => expect(context?.state.ready).toBe(true));
  expect(native.result).toBe(initial.result);
  expect(web.result).toBeUndefined();
  expect(view.container.textContent).toContain('initial|success|primary|initial');
  expect(fetch).not.toHaveBeenCalled();
  return {
    sdk,
    fetch,
    send,
    read,
    view,
    get context() {
      return context;
    },
    get native() {
      return native;
    },
    get web() {
      return web;
    },
    action: (personalization: ManagedExperienceAcquireOptions['personalization'] = track) =>
      native.acquire({ personalization }),
    navigate: async () => {
      const next = candidate('next-route', '/page-two');
      const from = new URL(window.location.href);
      window.history.replaceState({}, '', '/page-two');
      await view.rerender({ source: createRequestSource(next) });
      navigation.navigationHooks.after.forEach((callback) =>
        callback({ from: { url: from }, to: { url: new URL(window.location.href) } })
      );
      await waitFor(() => expect(native.result).toBe(next.result));
      expect(web.result).toBeUndefined();
      expect(view.container.textContent).toContain('next-route|success|primary|next-route');
      return next;
    },
  };
}
afterEach(() => {
  cleanup();
  for (const sdk of owners.splice(0)) sdk.destroy();
  navigation.navigationHooks.reset();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('Kit and managed Web source handover', () => {
  it('executes identical actions against the committed selector without rerunning the native loader or replacing the SDK', async () => {
    const state = await setup();
    const initial = state.native.result;
    const identified = await state.action(identify);
    expect(state.native.result).toBeUndefined();
    expect(identified?.request).toMatchObject({
      experienceId: 'primary',
      personalization: identify,
    });
    expect(state.web.result).toBe(identified);
    const first = await state.action();
    const second = await state.action();
    expect(first?.id).not.toBe(second?.id);
    expect(second).toBe(state.web.result);
    expect(initial?.requestId).toBe('initial');
    expect(
      state.fetch.mock.calls.map(([input]) =>
        input.personalization?.events?.map((event) => event.type)
      )
    ).toEqual([['identify'], ['track'], ['track']]);
    expect(state.context.owner.current.sdk).toBe(state.sdk);
    expect(state.read).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe('/');
  });

  it('retains applicable native content when Web acquisition fails and retries only the active browser source', async () => {
    const state = await setup();
    const nativePlan = state.native.data;
    state.fetch.mockRejectedValueOnce(new Error('Offline'));
    const failed = await state.action();
    expect(failed?.error?.message).toBe('Offline');
    expect(failed?.plan).toBeUndefined();
    expect(state.web.result).toBe(failed);
    expect(state.native.result).toBeUndefined();
    expect(state.native.data).toBe(nativePlan);
    await state.native.retry();
    expect(state.web.result?.plan?.metadata.marker).toBe('web-1');
    expect(state.read).not.toHaveBeenCalled();
    expect(state.fetch.mock.calls[1]?.[0].personalization?.events).toBeUndefined();
  });

  it('rejects the previous Kit read and directs event-free Retry to the active Web source', async () => {
    const pending = deferred<RequestCandidate>();
    const read = vi.fn(() => pending.promise);
    const state = await setup(read);
    const oldRead = state.native.retry();
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    await state.action();
    pending.resolve({
      ...candidate('stale-kit-read'),
      result: {
        ...candidate('stale-kit-read').result!,
        eventFree: true,
        initialPageOwner: undefined,
      },
    });
    await oldRead;
    expect(state.web.data?.metadata.marker).toBe('web-1');
    await fireEvent.click(state.view.getByText('Retry active content'));
    await waitFor(() => expect(state.web.data?.metadata.marker).toBe('web-2'));
    expect(read).toHaveBeenCalledOnce();
    expect(state.fetch).toHaveBeenCalledTimes(2);
    expect(state.fetch.mock.calls[1]?.[0].personalization?.events).toBeUndefined();
  });

  it('supersedes an earlier identical action without adopting its late profile or plan', async () => {
    const state = await setup();
    const pending = deferred<PortableRenderPlan>();
    state.fetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(plan('replacement'));
    const stale = state.action();
    await waitFor(() => expect(state.fetch).toHaveBeenCalledOnce());
    const replacement = await state.action();
    pending.resolve({
      ...plan('stale-action'),
      personalization: { profile: profile('old-visitor') },
    });
    await expect(stale).resolves.toBeUndefined();
    expect(state.sdk.states.profile.current?.id).toBe('visitor');
    expect(state.web.data).toBe(replacement?.plan);
  });

  it('adopts the next Kit source without old Web completion or cleanup replacing it', async () => {
    const state = await setup();
    await state.action();
    const pending = deferred<PortableRenderPlan>();
    state.fetch.mockImplementationOnce(() => pending.promise);
    const stale = state.action();
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(2));
    const next = await state.navigate();
    pending.resolve(plan('stale-web-action'));
    await expect(stale).resolves.toBeUndefined();
    expect(state.native.result).toBe(next.result);
    expect(state.native.data).toBe(next.result?.plan);
    expect(state.context.owner.current.sdk).toBe(state.sdk);
    expect(state.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects pending private Kit hydration when a Web action takes over', async () => {
    const state = await setup();
    const started = deferred<void>();
    const gate = deferred<void>();
    const intercepted = deferred<void>();
    state.sdk.interceptors.state.add(async (snapshot) => {
      if (snapshot.profile?.id === 'old-kit-profile') {
        started.resolve();
        await gate.promise;
        intercepted.resolve();
      }
      return snapshot;
    });
    const initial = candidate('incoming', '/incoming');
    const incoming: RequestCandidate = {
      ...initial,
      result: {
        ...initial.result!,
        initialPageOwner: undefined,
        handoff: {
          spaceId: 'space',
          environmentId: 'environment',
          cache: { scope: 'private-request' },
          state: { profile: profile('old-kit-profile') },
          replay: {
            routeKey: '/incoming',
            events: [state.sdk.eventBuilder.buildTrack({ event: 'old-kit-action' })],
          },
        },
      },
    };
    const from = new URL(window.location.href);
    window.history.replaceState({}, '', '/incoming');
    navigation.navigationHooks.after.forEach((callback) =>
      callback({ from: { url: from }, to: { url: new URL(window.location.href) } })
    );
    await state.view.rerender({ source: createRequestSource(incoming) });
    await started.promise;
    await state.action();
    const attempt = state.sdk.states.eventStream.current;
    expect(attempt?.type).toBe('track');
    gate.resolve();
    await intercepted.promise;
    await tick();
    await tick();
    expect(state.sdk.states.profile.current?.id).toBe('visitor');
    expect(state.web.data?.metadata.marker).toBe('web-1');
    expect(state.native.result).toBeUndefined();
    expect(state.sdk.states.eventStream.current).toBe(attempt);
  });

  it('keeps consent, reset and teardown guards on pending Web actions after handover', async () => {
    const state = await setup();
    state.sdk.consent({ events: false });
    const personalized = { ...track, profileId: 'action-visitor' };
    await state.action(personalized);
    expect(state.fetch.mock.calls[0]?.[0].personalization?.events).toEqual([]);
    expect(state.fetch.mock.calls[0]?.[0].personalization?.profileId).toBe('action-visitor');
    const pending = deferred<PortableRenderPlan>();
    state.fetch.mockImplementationOnce(() => pending.promise);
    const stale = state.action(personalized);
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(2));
    state.context.actions.reset();
    pending.resolve(plan('stale-after-reset'));
    await expect(stale).resolves.toBeUndefined();
    expect(state.web.data?.metadata.marker).not.toBe('stale-after-reset');
    expect(state.sdk.states.profile.current).toBeUndefined();
    await state.native.retry();
    expect(state.fetch.mock.lastCall?.[0].personalization?.profileId).toBeUndefined();
    expect(state.fetch.mock.lastCall?.[0].personalization?.events).toBeUndefined();
    const completed = state.native.data;
    const pendingTeardown = deferred<PortableRenderPlan>();
    state.fetch.mockReturnValueOnce(pendingTeardown.promise);
    const destroyed = state.action();
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(4));
    state.context.runtime.destroy();
    expect(state.native.data).toBe(completed);
    pendingTeardown.resolve(plan('stale-after-destroy'));
    await expect(destroyed).resolves.toBeUndefined();
    expect(state.native.status).not.toBe('loading');
    expect(state.native.data?.metadata.marker).not.toBe('stale-after-destroy');
    await expect(state.action()).resolves.toBeUndefined();
  });

  it('discards pending browser work on an inherited locale change and keeps Retry browser-owned', async () => {
    const state = await setup();
    await state.action();
    const pending = deferred<PortableRenderPlan>();
    state.fetch.mockReturnValueOnce(pending.promise);
    const stale = state.action();
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(2));
    state.sdk.setLocale('de-DE');
    await waitFor(() => expect(state.native.data).toBeUndefined());
    expect(state.native.status).not.toBe('loading');
    pending.resolve(plan('stale-locale'));
    await expect(stale).resolves.toBeUndefined();
    await state.native.retry();
    expect(state.fetch.mock.lastCall?.[0].locale).toBe('de-DE');
    expect(state.fetch.mock.lastCall?.[0].personalization?.events).toBeUndefined();
    expect(state.web.data?.metadata.marker).toBe('web-2');
    expect(state.read).not.toHaveBeenCalled();
  });

  it('follows an active browser Destination redirect once under the Kit navigation policy', async () => {
    const goto = vi.spyOn(navigation, 'goto');
    const state = await setup();
    state.fetch.mockResolvedValueOnce({ redirect: { path: '//external.invalid' } });
    const invalid = await state.action();
    expect(invalid?.redirect).toEqual({ path: '//external.invalid' });
    expect(state.native.error).toBeInstanceOf(TypeError);
    expect(state.native.data?.metadata.marker).toBe('initial');
    expect(goto).not.toHaveBeenCalled();
    state.fetch.mockResolvedValueOnce({ redirect: { path: '/local' } });
    const result = await state.action();
    expect(result?.redirect).toEqual({ path: '/local' });
    expect(goto.mock.calls).toEqual([['/local']]);
    expect(state.read).not.toHaveBeenCalled();
  });

  it('keeps an explicit blocked page eligible through event-free Retry, without restoring blocked nonpage intent', async () => {
    const state = await setup();
    state.sdk.consent({ events: false });
    await state.action({ events: [...page.events, ...track.events] });
    await state.native.retry();
    expect(state.fetch.mock.calls[1]?.[0].personalization?.events).toBeUndefined();
    state.sdk.consent({ events: true });
    await waitFor(() => expect(state.send).toHaveBeenCalledOnce());
    const events = state.send.mock.calls.flatMap(([body]) => body.events);
    expect(events).toMatchObject([{ type: 'page', properties: { title: 'Explicit action' } }]);
  });

  it('uses the current root builder on a browser-owned visit after native adoption', async () => {
    const original = vi.fn(() => ({ properties: { title: 'Original route' } }));
    const latest = vi.fn(() => ({ properties: { title: 'Browser route' } }));
    const state = await setup(undefined, original);
    expect(original).not.toHaveBeenCalled();
    const from = new URL(window.location.href);
    window.history.replaceState({}, '', '/browser');
    navigation.navigationHooks.after.forEach((callback) =>
      callback({ from: { url: from }, to: { url: new URL(window.location.href) } })
    );
    await state.view.rerender({
      source: undefined,
      webExperienceId: 'primary',
      buildPagePayload: latest,
    });
    await waitFor(() => expect(state.web.data?.metadata.marker).toBe('web-1'));
    const events = state.fetch.mock.calls[0]?.[0].personalization?.events;
    expect(events).toMatchObject([{ type: 'page', properties: { title: 'Browser route' } }]);
    const result = await state.native.acquire({ personalization: track });
    expect(result).toBe(state.web.result);
    expect(result?.plan?.metadata.marker).toBe('web-2');
    expect(state.native.result).toBeUndefined();
    expect(state.read).not.toHaveBeenCalled();
  });
});
