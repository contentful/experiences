import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { ContentfulExperiences } from '@contentful/experiences-web';
import { ContentfulExperiences as Runtime } from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { createExperiences } from '../../experience/create-experiences.js';
import type { BoundExperienceProps } from '../../experience/presentation-types.js';
import type { ManagedExperience } from '../../experience/source-types.js';
import { bindSvelteKitClientExperiences } from '../../kit/client-binding.js';
import type { ManagedRequestExperience } from '../../kit/request-controller.svelte.js';
import { createRequestSource, type RequestCandidate } from '../../kit/request-source.js';
import KitRequestHarness from '../fixtures/KitRequestHarness.svelte';
import type { RuntimeProbeCapture } from '../fixtures/runtime-probe.js';
import { profile } from '../fixtures/runtime-profile.js';
import { navigationHooks } from '../kit-navigation.js';

const owners: ContentfulExperiences[] = [];
const track = { events: [{ type: 'track' as const, event: 'reference_custom_action' }] };
const identify = {
  events: [{ type: 'identify' as const, userId: 'charles', traits: { identified: true } }],
};
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
  }))
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
  vi.spyOn(sdk.api.personalization, 'upsertProfile').mockResolvedValue({
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
    action: async (cycle = 1, personalization: BoundExperienceProps['personalization'] = track) => {
      await view.rerender({ actionCycle: cycle, action: personalization });
      await waitFor(() => expect(view.container.textContent).toContain(`success|web-${cycle}`));
    },
    navigate: async () => {
      const next = candidate('next-route', '/page-two');
      const from = new URL(window.location.href);
      window.history.replaceState({}, '', '/page-two');
      await view.rerender({ actionCycle: 0, source: createRequestSource(next) });
      navigationHooks.after.forEach((callback) =>
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
  navigationHooks.reset();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('Kit and managed Web source handover', () => {
  it('executes explicit same-URL actions, including identical keyed replacements, without repeating rerenders or replacing the SDK', async () => {
    const state = await setup();
    await state.action(1, identify);
    expect(state.native.result).toBeUndefined();
    expect(state.web.result?.request.personalization).toEqual(identify);
    await state.view.rerender({ actionCycle: 1, action: identify });
    await tick();
    expect(state.fetch).toHaveBeenCalledOnce();
    await state.action(2);
    await state.action(3);
    expect(
      state.fetch.mock.calls.map(([input]) =>
        input.personalization?.events?.map((event) => event.type)
      )
    ).toEqual([['identify'], ['track'], ['track']]);
    expect(state.context.owner.current.sdk).toBe(state.sdk);
    expect(state.read).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe('/');
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

  it.each(['action', 'selector'] as const)(
    'supersedes pending %s input while outgoing DOM remains, without accepting its late state or cleanup',
    async (kind) => {
      const animations: { onfinish?: () => void; cancel(): void }[] = [];
      const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
      Object.defineProperty(Element.prototype, 'animate', {
        configurable: true,
        value: () => {
          const animation = { cancel: vi.fn() };
          animations.push(animation);
          return animation;
        },
      });
      try {
        const state = await setup();
        const pending = deferred<PortableRenderPlan>();
        state.fetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({
          ...plan('replacement'),
          experienceId: kind === 'selector' ? 'next' : 'primary',
        });
        await state.view.rerender({
          outro: () => ({ duration: 1000 }),
          actionCycle: 1,
          action: kind === 'action' ? track : undefined,
        });
        await waitFor(() => expect(state.fetch).toHaveBeenCalledOnce());
        await state.view.rerender({
          actionCycle: 2,
          actionExperienceId: kind === 'selector' ? 'next' : 'primary',
        });
        expect(state.view.container.querySelectorAll('[data-action]')).toHaveLength(2);
        await waitFor(() => expect(state.web.data?.metadata.marker).toBe('replacement'));
        expect(state.fetch).toHaveBeenCalledTimes(2);
        pending.resolve({
          ...plan('stale-outgoing'),
          personalization: { profile: profile('old-visitor') },
        });
        await tick();
        await tick();
        expect(state.sdk.states.profile.current?.id).toBe('visitor');
        for (const animation of animations) animation.onfinish?.();
        await tick();
        expect(state.web.data?.metadata.marker).toBe('replacement');
        expect(state.context.owner.current.sdk).toBe(state.sdk);
      } finally {
        cleanup();
        if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
        else Reflect.deleteProperty(Element.prototype, 'animate');
      }
    }
  );

  it('adopts the next Kit source without old Web completion or cleanup replacing it', async () => {
    const state = await setup();
    await state.action();
    const pending = deferred<PortableRenderPlan>();
    state.fetch.mockImplementationOnce(() => pending.promise);
    await state.view.rerender({ actionCycle: 2, action: track });
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(2));
    const next = await state.navigate();
    pending.resolve(plan('stale-web-action'));
    await tick();
    await tick();
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
    navigationHooks.after.forEach((callback) =>
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

  it('keeps consent and reset guards on pending Web actions after handover', async () => {
    const state = await setup();
    state.sdk.consent({ events: false });
    await state.action();
    expect(state.fetch.mock.calls[0]?.[0].personalization?.events).toEqual([]);
    const pending = deferred<PortableRenderPlan>();
    state.fetch.mockImplementationOnce(() => pending.promise);
    await state.view.rerender({ actionCycle: 2, action: track });
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(2));
    state.context.actions.reset();
    pending.resolve(plan('stale-after-reset'));
    await tick();
    await tick();
    expect(state.web.data?.metadata.marker).not.toBe('stale-after-reset');
    expect(state.sdk.states.profile.current).toBeUndefined();
  });
});
