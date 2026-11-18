import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentfulExperiences } from '@contentful/experiences-web';
import {
  ContentfulExperiences as Runtime,
  type ExperiencesHandoff,
  type FetchExperienceOptions,
} from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { profile } from '../test/fixtures/runtime-profile.js';
import { createPageSequence } from './page-sequence.svelte.js';

const resolve = { config: { components: {} } };
const plan: PortableRenderPlan = { nodes: [], diagnostics: [], metadata: {}, debug: false };
const cleanups: (() => void)[] = [];

function setup() {
  const sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'test' },
    defaults: { consent: false, persistenceConsent: false },
    allowedEventTypes: [],
    autoTrackEntryInteraction: { views: false, hovers: false, clicks: false },
  });
  const route = createPageSequence(() => sdk);
  const fetch = vi.spyOn(Runtime.prototype, 'fetchExperience').mockResolvedValue(plan);
  const send = vi.spyOn(sdk.api.personalization, 'upsertProfile').mockResolvedValue({
    profile: profile('visitor'),
  } as never);
  route.update({ routeKey: '/first', initialPagePayload: { properties: { title: 'First' } } });
  cleanups.push(() => {
    route.dispose();
    sdk.destroy();
  });
  return { sdk, route, fetch, send };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('committed route page sequencing', () => {
  it.each(['matching', 'profile-only', 'mismatched'] as const)(
    'suppresses automatic XDA page injection only for matching replay (%s)',
    async (kind) => {
      const { sdk, route } = setup();
      const fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue(plan);
      const hydrate = vi
        .spyOn(sdk, 'hydrateAndTrackCurrentPage')
        .mockResolvedValue({ accepted: true });
      const handoff: ExperiencesHandoff = {
        spaceId: 'space',
        environmentId: 'environment',
        cache: { scope: 'private-request' },
        profileId: 'visitor',
        ...(kind === 'profile-only'
          ? {}
          : {
              replay: {
                routeKey: kind === 'matching' ? '/first' : '/other',
                events: [sdk.eventBuilder.buildPageView()],
              },
            }),
      };
      route.update({ routeKey: '/first', handoff, initialPagePayload: {} });
      await route.fetchExperience(sdk, { experienceId: 'first' }, resolve, false);
      expect(fetch.mock.calls[0]?.[0].personalization?.events).toEqual(
        kind === 'matching' ? undefined : [{ type: 'page' }]
      );
      expect(hydrate).toHaveBeenCalledWith(
        handoff,
        expect.objectContaining({ routeKey: '/first' })
      );
    }
  );

  it('uses latest payload without restarting a route, and treats logical keys as opaque', async () => {
    const { sdk, route, fetch } = setup();
    sdk.consent({ events: true });
    const content = vi.spyOn(sdk, 'fetchExperience');
    const build = vi.fn((_metadata: { isInitialEmission: boolean }) => ({
      properties: { title: 'Latest' },
    }));
    route.update({ routeKey: '/first', buildPagePayload: build });
    expect(build).not.toHaveBeenCalled();
    await route.fetchExperience(sdk, { experienceId: 'first' }, resolve, false);
    expect(fetch.mock.calls[0]?.[0].personalization?.events).toEqual([
      expect.objectContaining({
        type: 'page',
        properties: expect.objectContaining({ title: 'Latest' }),
      }),
    ]);
    const pending = content.mock.calls[0]?.[2]?.isCurrent;
    expect(pending?.()).toBe(true);
    // An ordinary fragment uses the unchanged host key. Hash routers commit another key.
    route.update({ routeKey: '/first', buildPagePayload: build });
    expect(pending?.()).toBe(true);
    route.update({ routeKey: '/#/second', buildPagePayload: build });
    expect(pending?.()).toBe(false);
    await route.fetchExperience(sdk, { experienceId: 'second' }, resolve, false);
    expect(content.mock.calls[1]?.[2]?.routeKey).toBe('/#/second');
    expect(build.mock.calls).toEqual([
      [{ isInitialEmission: true }],
      [{ isInitialEmission: false }],
    ]);
  });

  it.each([false, true])(
    'preserves fresh explicit event authority after reset and event-free refresh (consent=%s)',
    async (consent) => {
      const { sdk, route, fetch, send } = setup();
      sdk.consent({ events: true });
      const build = vi.fn(() => ({}));
      route.update({ routeKey: '/first', buildPagePayload: build });
      const request: FetchExperienceOptions = {
        experienceId: 'first',
        personalization: { events: [] },
      };
      await route.fetchExperience(sdk, request, resolve, false);
      expect(build).not.toHaveBeenCalled();
      expect(fetch.mock.calls[0]?.[0].personalization?.events).toEqual([]);
      await route.fetchExperience(
        sdk,
        {
          ...request,
          personalization: { events: [{ type: 'track', event: 'manual' }] },
        },
        resolve,
        true
      );
      expect(build).not.toHaveBeenCalled();
      expect(fetch.mock.calls[1]?.[0].personalization?.events).toBeUndefined();
      sdk.consent({ events: false });
      sdk.consent({ events: true });
      expect(build).not.toHaveBeenCalled();
      sdk.reset();
      sdk.consent({ events: consent });
      await route.fetchExperience(
        sdk,
        {
          experienceId: 'next-selection',
          personalization: { events: [{ type: 'track', event: 'fresh' }, { type: 'page' }] },
        },
        resolve,
        false
      );
      expect(fetch.mock.calls[2]?.[0].personalization?.events?.map((event) => event.type)).toEqual(
        consent ? ['track', 'page'] : []
      );
      sdk.consent({ events: true });
      await sdk.flush();
      expect(send).toHaveBeenCalledTimes(consent ? 0 : 1);
      expect(build).toHaveBeenCalledTimes(consent ? 0 : 1);
      sdk.reset();
      send.mockClear();
      build.mockClear();
      sdk.consent({ events: false });
      await route.fetchExperience(
        sdk,
        { experienceId: 'no-events', personalization: { events: [] } },
        resolve,
        false
      );
      sdk.consent({ events: true });
      await sdk.flush();
      expect(send).not.toHaveBeenCalled();
      expect(fetch.mock.calls[3]?.[0].personalization?.events).toEqual([]);
      expect(build).not.toHaveBeenCalled();
    }
  );

  it.each(['denied', 'refresh', 'reset'] as const)(
    'retries only current ordinary page intent after consent grant (%s)',
    async (consentCase) => {
      const { sdk, route, fetch, send } = setup();
      const reset = consentCase === 'reset';
      const attempts: string[] = [];
      const subscription = sdk.states.eventStream.subscribe((event) => {
        if (event) attempts.push(event.type);
      });
      cleanups.push(() => subscription.unsubscribe());
      await route.fetchExperience(
        sdk,
        {
          experienceId: 'first',
          personalization: { events: [{ type: 'track', event: 'blocked' }, { type: 'page' }] },
        },
        resolve,
        false
      );
      expect(attempts).toEqual([]);
      if (consentCase === 'refresh') {
        await route.fetchExperience(sdk, { experienceId: 'first' }, resolve, true);
        expect(fetch.mock.calls[1]?.[0].personalization?.events).toBeUndefined();
      }
      if (reset) {
        sdk.reset();
        route.update({ routeKey: '/first', buildPagePayload: () => ({}) });
        await route.fetchExperience(sdk, { experienceId: 'first' }, resolve, true);
      }
      sdk.consent({ events: true });
      if (reset) {
        await sdk.flush();
        expect(send).not.toHaveBeenCalled();
        expect(attempts).toEqual([]);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[1]?.[0].personalization?.events).toBeUndefined();
        route.update({ routeKey: '/next', initialPagePayload: {} });
        await route.fetchExperience(sdk, { experienceId: 'next' }, resolve, false);
        expect(attempts).toEqual(['page']);
        return;
      }
      await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      expect(attempts).toEqual(['page']);
      expect(fetch).toHaveBeenCalledTimes(consentCase === 'refresh' ? 2 : 1);
    }
  );

  it.each(['denied', 'reset'] as const)(
    'retries only current complete handoff intent after consent grant (%s)',
    async (consentCase) => {
      const { sdk, route, send } = setup();
      const reset = consentCase === 'reset';
      const handoff: ExperiencesHandoff = {
        spaceId: 'space',
        environmentId: 'environment',
        cache: { scope: 'private-request' },
        profileId: 'visitor',
        replay: {
          routeKey: '/first',
          events: [
            sdk.eventBuilder.buildTrack({ event: 'blocked' }),
            sdk.eventBuilder.buildPageView(),
          ],
        },
      };
      const attempts: string[] = [];
      const subscription = sdk.states.eventStream.subscribe((event) => {
        if (event) attempts.push(event.type);
      });
      cleanups.push(() => subscription.unsubscribe());
      route.update({ routeKey: '/first', handoff });
      await vi.waitFor(() =>
        expect(sdk.states.personalizationRequestState.current.status).toBe('success')
      );
      expect(attempts).toEqual([]);
      if (reset) {
        sdk.reset();
        route.update({ routeKey: '/first', handoff, buildPagePayload: () => ({}) });
        await route.fetchExperience(sdk, { experienceId: 'first' }, resolve, true);
      }
      sdk.consent({ events: true });
      if (reset) {
        await sdk.flush();
        expect(send).not.toHaveBeenCalled();
        expect(attempts).toEqual([]);
        return;
      }
      await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      expect(attempts).toEqual(['page']);
    }
  );

  it('retains eligible prepared and browser page intent through reads and cached preparations without reviving blocked nonpage work', async () => {
    const { sdk, route, send } = setup();
    const track = sdk.eventBuilder.buildTrack({ event: 'prepared' });
    const page = sdk.eventBuilder.buildPageView({ properties: { title: 'Prepared page' } });
    const handoff: ExperiencesHandoff = {
      spaceId: 'space',
      environmentId: 'environment',
      cache: { scope: 'private-request' },
      profileId: 'visitor',
      replay: { routeKey: '/eligible', events: [track, page] },
    };
    route.update({ routeKey: '/eligible', selection: 'primary' });
    await route.adoptRequest({
      routeKey: '/eligible',
      handoff,
      explicitEvents: true,
      preparation: sdk.capturePreparation(),
      isCurrent: () => true,
    });
    await route.adoptRequest({
      routeKey: '/eligible',
      eventFree: true,
      explicitEvents: false,
      isCurrent: () => true,
    });
    // Kit can reuse another prepared result at this same selection; it creates no new intent.
    await route.adoptRequest({
      routeKey: '/eligible',
      handoff,
      explicitEvents: true,
      isCurrent: () => true,
    });
    expect(send).not.toHaveBeenCalled();
    expect(sdk.states.eventStream.current).toBeUndefined();
    sdk.consent({ events: true });
    await sdk.flush();
    const sent = () => send.mock.calls.flatMap(([request]) => request.events);
    expect(sent().map((event) => event.type)).toEqual(['page']);
    expect([track.messageId, page.messageId]).not.toContain(sent()[0]?.messageId);
    expect(sent()[0]).toMatchObject({ properties: { title: 'Prepared page' } });
    sdk.reset();
    sdk.consent({ events: false });
    await route.adoptRequest({
      routeKey: '/eligible',
      handoff,
      explicitEvents: true,
      isCurrent: () => true,
    });
    sdk.consent({ events: true });
    await sdk.flush();
    expect(sent().map((event) => event.type)).toEqual(['page']);
    sdk.consent({ events: false });
    route.update({ routeKey: '/browser' });
    await route.adoptRequest({
      routeKey: '/browser',
      explicitEvents: false,
      initialPagePayload: { properties: { title: 'Browser page' } },
      handoff: {
        spaceId: 'space',
        environmentId: 'environment',
        cache: { scope: 'private-request' },
        profileId: 'visitor',
      },
      isCurrent: () => true,
    });
    await route.adoptRequest({
      routeKey: '/browser',
      eventFree: true,
      explicitEvents: false,
      isCurrent: () => true,
    });
    sdk.consent({ events: true });
    await sdk.flush();
    expect(sent().map((event) => event.type)).toEqual(['page', 'page']);
    expect(sent()[1]).toMatchObject({ properties: { title: 'Browser page' } });
    route.update({ routeKey: '/server' });
    await route.adoptRequest({
      routeKey: '/server',
      initialPageOwner: 'server',
      explicitEvents: false,
      initialPagePayload: {},
      isCurrent: () => true,
    });
    sdk.consent({ events: false });
    sdk.consent({ events: true });
    await sdk.flush();
    expect(sent().map((event) => event.type)).toEqual(['page', 'page']);
  });

  it.each(['source', 'route', 'reset', 'dispose'] as const)(
    'invalidates pending event admission after %s ends its authority',
    async (ending) => {
      const { sdk, route } = setup();
      let sourceCurrent = true;
      let guard: (() => boolean) | undefined;
      vi.spyOn(sdk, 'fetchExperience').mockImplementation((_request, _resolve, page) => {
        guard = page?.isCurrent;
        return Promise.resolve(plan);
      });
      await route.fetchExperience(
        sdk,
        { experienceId: 'first' },
        resolve,
        false,
        () => sourceCurrent
      );
      expect(guard?.()).toBe(true);
      if (ending === 'source') sourceCurrent = false;
      else if (ending === 'route') route.update({ routeKey: '/next' });
      else route[ending]();
      expect(guard?.()).toBe(false);
    }
  );
});
