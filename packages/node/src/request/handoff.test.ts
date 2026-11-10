import { setupPayloadRuntime as setup } from '../test/runtime.js';
import { deferred } from '../test/deferred.js';
import { profileFixture } from '../test/fixtures/profile.js';
import { payloadScope as scope } from '../test/fixtures/payload.js';
import { describe, expect, it, vi } from 'vitest';
import type { OptimizationEventStreamEvent } from '@contentful/experiences-runtime';

const resolver = { config: { components: {} } };
const route = { routeKey: '/' };

describe('Node browser-handoff producer', () => {
  it.each(['home', '', undefined, null])(
    'rejects invalid route descriptors (%s) before XDA',
    async (routeKey) => {
      const { request, options, fetch, commit } = setup({ locale: 'en-US' }, { consent: true });
      await expect(
        request.fetchExperienceForHandoff(options, resolver, { routeKey } as never)
      ).rejects.toThrow(/route key/);
      expect(fetch).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it.each(['fetch', 'resolve'] as const)(
    'retains a usable browser replay after %s failure',
    async (stage) => {
      const { sdk, options, fetch, commit } = setup({ locale: 'en-US' }, { consent: true });
      const failure = new Error('content failed');
      if (stage === 'fetch') fetch.mockRejectedValueOnce(failure);
      else vi.spyOn(sdk, 'resolveExperience').mockRejectedValueOnce(failure);
      const request = sdk.forRequest({ consent: true, profile: { id: 'incoming' } });
      const events = options.personalization.events;
      const { handoff, error, plan } = await request.fetchExperienceForHandoff(
        options,
        resolver,
        route
      );
      expect(error).toBe(failure);
      expect(plan).toBeUndefined();
      expect(handoff.replay?.events).toEqual(events);
      expect(handoff.profileId).toBe(stage === 'fetch' ? 'incoming' : 'xda-profile');
      expect(handoff.state).toEqual(
        stage === 'fetch' ? undefined : { profile: profileFixture('xda-profile') }
      );
      expect(commit).not.toHaveBeenCalled();
    }
  );

  it('finishes asynchronous identify interception before starting track interception', async () => {
    const { sdk, request, fetch, commit } = setup({ locale: 'en-US' }, { consent: true });
    const hold = deferred<void>();
    let identified = false;
    const hook = vi.fn(async (event: OptimizationEventStreamEvent) => {
      if (event.type === 'identify') {
        await hold.promise;
        identified = true;
      } else {
        expect(identified).toBe(true);
      }
      return event;
    });
    sdk.interceptors.event.add(hook);
    const pending = request.fetchExperienceForHandoff(
      {
        experienceId: 'experience',
        personalization: {
          events: [
            { type: 'identify', userId: 'user' },
            { type: 'track', event: 'opened' },
          ],
        },
      },
      resolver,
      route
    );
    expect(hook).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    hold.resolve();
    const { handoff, plan, error } = await pending;
    expect(hook.mock.calls.map(([event]) => event.type)).toEqual(['identify', 'track']);
    expect(handoff.replay?.events).toEqual(fetch.mock.calls[0]![0].personalization?.events);
    expect(plan).toBeDefined();
    expect(error).toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  it('stops remaining interception and XDA when destroyed during an asynchronous identify hook', async () => {
    const { sdk, request, fetch, commit } = setup({ locale: 'en-US' }, { consent: true });
    const hold = deferred<void>();
    const hook = vi.fn(async (event: OptimizationEventStreamEvent) => {
      await hold.promise;
      return event;
    });
    sdk.interceptors.event.add(hook);
    const pending = request.fetchExperienceForHandoff(
      {
        experienceId: 'experience',
        personalization: {
          events: [
            { type: 'identify', userId: 'user' },
            { type: 'track', event: 'opened' },
          ],
        },
      },
      resolver,
      route
    );
    request.destroy();
    hold.resolve();
    await expect(pending).rejects.toThrow(/destroyed/);
    expect(hook).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('passes a valid raw query-array body unchanged to XDA and returns content without committing', async () => {
    const { request, fetch, commit } = setup({ locale: 'en-US' }, { consent: true });
    const page = request.eventBuilder.buildPageView({
      properties: { url: 'https://example.test/?tag=one&tag=two' },
    });
    const raw = {
      ...page,
      context: { ...page.context, page: { ...page.context.page, query: { tag: ['one', 'two'] } } },
    };
    const original = globalThis.structuredClone(raw);
    const { handoff, plan, error } = await request.fetchExperienceForHandoff(
      { experienceId: 'experience', personalization: { events: [raw] } },
      resolver,
      route
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0].personalization?.events).toEqual([original]);
    expect(handoff.replay?.events).toEqual([original]);
    expect(raw).toEqual(original);
    expect(plan?.personalization?.profile?.id).toBe('xda-profile');
    expect(request.profile?.id).toBe('xda-profile');
    expect(error).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects invalid finalized XDA hook output before XDA', async () => {
    const { sdk, request, options, fetch, commit } = setup({ locale: 'en-US' }, { consent: true });
    const hook = vi.fn((event: OptimizationEventStreamEvent) => {
      Object.assign(event.context, { gdpr: { isConsentGiven: 'yes' } });
      return event;
    });
    sdk.interceptors.event.add(hook);
    await expect(request.fetchExperienceForHandoff(options, resolver, route)).rejects.toThrow(
      /Invalid Experience personalization options/
    );
    expect(hook).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('filters consent-blocked events before interception and preserves admitted replay', async () => {
    const onEventBlocked = vi.fn();
    const { sdk, options, fetch, commit } = setup(
      { locale: 'en-US', onEventBlocked },
      { consent: true }
    );
    const denied = sdk.forRequest({ consent: false, profile: { id: 'denied' } });
    const events = [
      ...options.personalization.events,
      sdk.eventBuilder.buildTrack({ event: 'opened' }),
    ];
    const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
    sdk.interceptors.event.add(hook);
    const { handoff: filtered } = await denied.fetchExperienceForHandoff(
      { ...options, personalization: { events } },
      resolver,
      route
    );
    expect(filtered.replay?.events.map((event) => event.type)).toEqual(['identify']);
    expect(filtered.replay?.events[0]).toMatchObject({
      context: { gdpr: { isConsentGiven: false } },
    });
    expect(hook).toHaveBeenCalledOnce();
    expect(onEventBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'consent', method: 'track' })
    );

    expect(fetch.mock.calls[0]![0].personalization?.events).toEqual(filtered.replay?.events);
    expect(commit).not.toHaveBeenCalled();
  });

  it('suppresses preview personalization and commitment while preserving request identity', async () => {
    const { sdk, options, fetch, commit } = setup({ locale: 'en-US' }, { consent: true });
    const request = sdk.forRequest({
      isPreview: true,
      consent: true,
      profile: { id: 'preview-owner' },
    });
    const { handoff } = await request.fetchExperienceForHandoff(options, resolver, route);
    expect(handoff.replay).toBeUndefined();
    expect(handoff.profileId).toBeUndefined();
    expect(request.profile?.id).toBe('preview-owner');
    expect(fetch.mock.calls[0]![0].personalization).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });

  it('returns a private aggregate without synthesizing event intent', async () => {
    const { request, fetch, commit } = setup({ locale: 'en-US' }, { consent: true });
    const { handoff } = await request.fetchExperienceForHandoff(
      { experienceId: 'experience' },
      resolver,
      route
    );
    expect(handoff).toEqual({
      ...scope,
      cache: { scope: 'private-request' },
      profileId: 'xda-profile',
      state: { profile: profileFixture('xda-profile') },
    });
    expect(fetch.mock.calls[0]![0].personalization).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });
});
