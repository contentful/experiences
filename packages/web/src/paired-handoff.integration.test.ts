// @vitest-environment jsdom

import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContentfulExperiences as RuntimeExperiences,
  type RuntimeFetchExperienceOptions,
  type BuiltRuntimeFetchExperienceOptions,
  type RuntimeFetchResolveOptions,
  withEventConsent,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

// This source-only import exercises both public runtime leaves without adding a Web package dependency.
import { ContentfulExperiences as NodeExperiences } from '../../node/src/contentful-experiences.js';
import { ContentfulExperiences as WebExperiences } from './contentful-experiences.js';
import { seedConsent, clearIdentityCookies } from './test-fixtures/consent.js';

const active = new Set<NodeExperiences | WebExperiences>();
const payloadRuntime = RuntimeExperiences.prototype as unknown as {
  fetchExperiencePayload(
    options: BuiltRuntimeFetchExperienceOptions,
    resolve: RuntimeFetchResolveOptions
  ): Promise<ExperiencePayload>;
};
const resolveOptions = { config: { components: {} } };

function evaluate(
  request: ReturnType<NodeExperiences['forRequest']>,
  routeKey: string,
  events: NonNullable<RuntimeFetchExperienceOptions['personalization']>['events']
) {
  return request.fetchExperienceForHandoff(
    { experienceId: 'experience', personalization: { events } },
    resolveOptions,
    { routeKey }
  );
}

function node(policy: { allowedEventTypes?: readonly ('identify' | 'page' | 'track')[] } = {}) {
  const sdk = new NodeExperiences({
    ...policy,
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'de-DE',
    delivery: { accessToken: 'delivery-token' },
  });
  active.add(sdk);
  return sdk;
}

function web(config: Partial<ConstructorParameters<typeof WebExperiences>[0]> = {}) {
  const sdk = new WebExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    ...config,
  });
  active.add(sdk);
  return sdk;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Consent is not what these tests are about: the browser is a visitor who has opted in.
beforeEach(() => {
  seedConsent({ events: true, persistence: true });
  vi.spyOn(payloadRuntime, 'fetchExperiencePayload').mockResolvedValue({
    nodes: [],
    extensions: { personalization: { profile: { id: 'preview-profile' } } },
  });
});

afterEach(() => {
  for (const sdk of active) sdk.destroy();
  active.clear();
  window.localStorage.clear();
  clearIdentityCookies();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('paired XDA evaluation and Web delivery', () => {
  it('consumes the complete XDA handoff without rerunning finalized event hooks', async () => {
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'evaluated-profile' } } as never);
    const server = node();
    const serverHook = vi.fn((event) =>
      event.type === 'track' ? { ...event, event: 'server-enriched' } : event
    );
    server.interceptors.event.add(serverHook);
    const request = server.forRequest({ consent: true, profile: { id: 'original-profile' } });
    const result = await evaluate(request, '/intercepted', [
      request.eventBuilder.buildTrack({ event: 'original' }),
      request.eventBuilder.buildPageView(),
    ]);
    expect(serverHook).toHaveBeenCalledTimes(2);
    expect(result.handoff.replay?.events).toEqual(
      vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[0]?.[0].personalization?.events
    );
    expect(upsert).not.toHaveBeenCalled();

    const browser = web();
    const browserHook = vi.fn((event) => event);
    browser.interceptors.event.add(browserHook);
    await browser.hydrateAndTrackCurrentPage(JSON.parse(JSON.stringify(result.handoff)), {
      routeKey: '/intercepted',
    });
    await browser.flush();
    expect(browser.states.profile.current?.id).toBe('evaluated-profile');
    expect(browserHook).not.toHaveBeenCalled();
    expect(serverHook).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]?.[0].events).toEqual(result.handoff.replay?.events);
  });

  it.each([
    { configuredLocale: 'en-US', requestLocale: 'de-DE', transportLocale: 'de-DE' },
    { configuredLocale: 'de-DE', requestLocale: undefined, transportLocale: 'de-DE' },
    { configuredLocale: undefined, requestLocale: undefined, transportLocale: undefined },
  ])(
    'separates event locales from request/content locale ($transportLocale) through replay',
    async ({ configuredLocale, requestLocale, transportLocale }) => {
      const upsert = vi
        .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: { id: 'profile' } } as never);
      const server = new NodeExperiences({
        spaceId: 'space',
        environmentId: 'environment',
        locale: configuredLocale,
        delivery: { accessToken: 'delivery-token' },
      });
      active.add(server);
      const request = server.forRequest({
        locale: requestLocale,
        eventContext: { locale: 'it-IT' },
        consent: true,
      });
      expect(request.locale).toBe(transportLocale);
      const prepared = await evaluate(request, '/localized', [
        request.eventBuilder.buildTrack({ event: 'opened', locale: 'es-ES' }),
        request.eventBuilder.buildPageView({ locale: 'fr-FR' }),
      ]);
      expect(prepared.handoff.replay?.locale).toBe(transportLocale);
      const events = prepared.handoff.replay?.events;
      expect(events?.map(({ context }) => context.locale)).toEqual(['es-ES', 'fr-FR']);
      expect(upsert).not.toHaveBeenCalled();

      const browser = web();
      browser.setLocale('nl-NL');
      await expect(
        browser.hydrateAndTrackCurrentPage(JSON.parse(JSON.stringify(prepared.handoff)), {
          routeKey: '/localized',
        })
      ).resolves.toEqual({ accepted: true });
      expect(upsert.mock.calls[0]?.[0].events).toEqual(events);
      expect(upsert.mock.calls[0]?.[1]).toEqual({ locale: transportLocale, preflight: false });

      await request.identify({ userId: 'visitor', locale: 'ja-JP' });
      expect(upsert.mock.calls[1]?.[0].events[0]?.context.locale).toBe('ja-JP');
      expect(upsert.mock.calls[1]?.[1]).toEqual({ locale: transportLocale });
      await request.page();
      expect(upsert.mock.calls[2]?.[0].events[0]?.context.locale).toBe(requestLocale ?? 'it-IT');
      expect(upsert.mock.calls[2]?.[1]).toEqual({ locale: transportLocale });
    }
  );

  it('round trips one exact prepared batch and accepts it before a failed HTTP send retries', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const firstDelivery = deferred<{ profile: { id: string } }>();
    const secondDelivery = deferred<{ profile: { id: string } }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(firstDelivery.promise as never)
      .mockReturnValueOnce(secondDelivery.promise as never);
    // Event consent is denied, but the prepared types are allow-listed, so the batch is
    // prepared and its events keep the denied flag through the replay.
    const server = node({ allowedEventTypes: ['identify', 'track', 'page'] });
    const serverHook = vi.fn((event) =>
      event.type === 'track' ? { ...event, event: 'server-evaluated' } : event
    );
    server.interceptors.event.add(serverHook);
    const request = server.forRequest({
      locale: 'de-DE',
      profile: { id: 'known-profile' },
      eventContext: { userAgent: 'server-agent' },
      consent: { events: false },
    });
    const prepared = await evaluate(request, '/products?sort=popular', [
      request.eventBuilder.buildIdentify({ userId: 'user-1' }),
      request.eventBuilder.buildTrack({ event: 'experience_rendered' }),
      request.eventBuilder.buildPageView(),
    ]);

    expect(prepared.plan?.personalization?.profileId).toBe('preview-profile');
    expect(prepared.handoff.profileId).toBe('preview-profile');
    expect(upsert).not.toHaveBeenCalled();
    const previewBody = vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[0]![0]
      .personalization!;
    expect(previewBody.profileId).toBe('known-profile');
    expect(previewBody.events!.map((event) => event.type)).toEqual(['identify', 'track', 'page']);
    expect(new Set(previewBody.events!.map((event) => event.messageId)).size).toBe(3);
    for (const event of previewBody.events!) {
      expect(event.context).toMatchObject({
        locale: 'de-DE',
        userAgent: 'server-agent',
        gdpr: { isConsentGiven: false },
      });
    }
    expect(prepared.handoff.replay?.events).toEqual(previewBody.events);

    server.destroy();
    const browser = web();
    const browserHook = vi.fn((event) => event);
    browser.interceptors.event.add(browserHook);
    expect(serverHook).toHaveBeenCalledTimes(3);
    expect(previewBody.events![1]).toMatchObject({ type: 'track', event: 'server-evaluated' });
    const handoff = JSON.parse(JSON.stringify(prepared.handoff));
    const admission = browser.hydrateAndTrackCurrentPage(handoff, {
      routeKey: '/products?sort=popular',
    });
    await expect(admission).resolves.toEqual({ accepted: true });
    expect(browser.states.experienceRequestState.current.status).toBe('pending');
    expect(upsert).toHaveBeenCalledTimes(1);
    const [firstBody, firstOptions] = upsert.mock.calls[0]!;
    // The same events in the same order, except that the consent flag is the browser's
    // (opted in) and no longer the server's (denied), which admitted them for sending.
    expect(firstBody).toEqual({
      profileId: 'preview-profile',
      events: prepared.handoff.replay!.events.map((event) => withEventConsent(event, true)),
    });
    expect(firstOptions).toEqual({ locale: 'de-DE', preflight: false });
    expect(browser.states.profile.current).toBeUndefined();

    firstDelivery.reject(new Error('response lost after request may have arrived'));
    await vi.waitFor(() =>
      expect(browser.states.experienceRequestState.current.status).toBe('failed')
    );
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1]).toEqual([firstBody, firstOptions]);
    expect(serverHook).toHaveBeenCalledTimes(3);
    expect(browserHook).not.toHaveBeenCalled();
    secondDelivery.resolve({ profile: { id: 'committed-profile' } });
    await vi.waitFor(() =>
      expect(browser.states.profile.current).toEqual({ id: 'committed-profile' })
    );
  });

  it('carries a preview-issued continuation ID across JSON for a new visitor', async () => {
    const delivery = deferred<{ profile: { id: string } }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(delivery.promise as never);
    vi.mocked(payloadRuntime.fetchExperiencePayload).mockResolvedValueOnce({
      nodes: [],
      extensions: { personalization: { profile: { id: 'issued-profile' } } },
    });
    const analytics = vi
      .spyOn(InsightsApiClient.prototype, 'sendBatchEvents')
      .mockResolvedValue(true);
    const server = node();
    const request = server.forRequest({ consent: true });
    const prepared = await evaluate(request, '/new', [request.eventBuilder.buildPageView()]);

    expect(prepared.handoff.profileId).toBe('issued-profile');
    expect(
      vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[0]?.[0].personalization?.profileId
    ).toBeUndefined();
    expect(upsert).not.toHaveBeenCalled();

    server.destroy();
    const browser = web();
    await expect(
      browser.hydrateAndTrackCurrentPage(JSON.parse(JSON.stringify(prepared.handoff)), {
        routeKey: '/new',
      })
    ).resolves.toEqual({ accepted: true });
    expect(upsert.mock.calls[0]?.[0].profileId).toBe('issued-profile');
    expect(upsert.mock.calls[0]?.[0].events).toEqual(prepared.handoff.replay?.events);
    await browser.trackClick({ entityId: 'hero', entityKind: 'Experience' });
    // The replayed delivery is held open, so start the flush and wait for Analytics.
    void browser.flush();
    await vi.waitFor(() => expect(analytics).toHaveBeenCalled());
    expect(analytics.mock.calls[0]?.[0][0]?.profile.id).toBe('issued-profile');

    delivery.resolve({ profile: { id: 'committed-profile' } });
    await vi.waitFor(() =>
      expect(browser.states.profile.current).toEqual({ id: 'committed-profile' })
    );
  });

  it('retains replay after XDA failure and uses an ordinary page on a different route', async () => {
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'committed-profile' } } as never);
    const failure = new Error('XDA unavailable');
    vi.mocked(payloadRuntime.fetchExperiencePayload).mockRejectedValueOnce(failure);
    const server = node();
    const request = server.forRequest({ profile: { id: 'known-profile' }, consent: true });
    const prepared = await evaluate(request, '/original', [
      request.eventBuilder.buildTrack({ event: 'prepared' }),
      request.eventBuilder.buildPageView(),
    ]);
    expect(prepared.error).toBe(failure);
    expect(prepared.handoff.replay?.events.map((event) => event.type)).toEqual(['track', 'page']);
    expect(prepared.handoff.replay?.events).toEqual(
      vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[0]?.[0].personalization?.events
    );
    expect(upsert).not.toHaveBeenCalled();

    server.destroy();
    const browser = web();
    const handoff = JSON.parse(JSON.stringify(prepared.handoff));
    await expect(
      browser.hydrateAndTrackCurrentPage(handoff, {
        routeKey: '/different',
        buildPayload: () => ({ properties: { source: 'current-route' } }),
      })
    ).resolves.toMatchObject({ accepted: true });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]?.[0]).toMatchObject({
      profileId: 'known-profile',
      events: [{ type: 'page', properties: { source: 'current-route' } }],
    });
    expect(upsert.mock.calls[0]?.[0].events[0]?.messageId).not.toBe(
      prepared.handoff.replay?.events.at(-1)?.messageId
    );
  });

  it.each([true, false])(
    'uses ordinary fallback guards at prepared capacity when online is %s',
    async (online) => {
      const firstDelivery = deferred<{ profile: { id: string } }>();
      const upsert = vi
        .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
        .mockReturnValueOnce(firstDelivery.promise as never)
        .mockResolvedValue({ profile: { id: 'committed-profile' } } as never);
      const server = node();
      const request = server.forRequest({ profile: { id: 'known-profile' }, consent: true });
      const full = await evaluate(request, '/full', [
        ...Array.from({ length: 99 }, () => request.eventBuilder.buildTrack({ event: 'bulk' })),
        request.eventBuilder.buildPageView(),
      ]);
      const next = await evaluate(request, '/next', [
        request.eventBuilder.buildTrack({ event: 'next' }),
        request.eventBuilder.buildPageView(),
      ]);
      expect(full.handoff.replay?.events).toHaveLength(100);
      expect(next.handoff.replay?.events).toHaveLength(2);
      expect(upsert).not.toHaveBeenCalled();

      server.destroy();
      const browser = web();
      const fullHandoff = JSON.parse(JSON.stringify(full.handoff));
      const nextHandoff = JSON.parse(JSON.stringify(next.handoff));
      await expect(
        browser.hydrateAndTrackCurrentPage(fullHandoff, { routeKey: '/full' })
      ).resolves.toEqual({ accepted: true });
      if (!online) window.dispatchEvent(new Event('offline'));
      const buildPayload = vi.fn(() => ({ properties: { source: 'capacity-fallback' } }));
      const result = await browser.hydrateAndTrackCurrentPage(nextHandoff, {
        routeKey: '/next',
        buildPayload,
      });
      expect(result).toEqual(
        online
          ? { accepted: true, data: { profile: { id: 'committed-profile' } } }
          : { accepted: false }
      );
      expect(buildPayload).toHaveBeenCalledExactlyOnceWith({ isInitialEmission: false });
      expect(upsert).toHaveBeenCalledTimes(online ? 2 : 1);
      expect(upsert.mock.calls[0]?.[0].events).toEqual(full.handoff.replay?.events);
      if (online) {
        const fallback = upsert.mock.calls[1];
        expect(fallback?.[0]).toMatchObject({
          profileId: 'preview-profile',
          events: [{ type: 'page', properties: { source: 'capacity-fallback' } }],
        });
        expect(fallback?.[0].events).toHaveLength(1);
        expect(fallback?.[1]).toEqual({ locale: 'en-US' });
        expect(next.handoff.replay?.events.map(({ messageId }) => messageId)).not.toContain(
          fallback?.[0].events[0]?.messageId
        );
      }

      firstDelivery.resolve({ profile: { id: 'committed-profile' } });
      window.dispatchEvent(new Event('online'));
      await browser.flush();
      expect(browser.states.experienceRequestState.current.status).toBe('success');
      const repeated = await browser.hydrateAndTrackCurrentPage(nextHandoff, {
        routeKey: '/next',
        buildPayload,
      });
      if (online) {
        expect(repeated).toBe(result);
        expect(buildPayload).toHaveBeenCalledTimes(1);
      } else {
        expect(repeated).toEqual({ accepted: true });
        await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
        expect(upsert.mock.calls[1]?.[0].events).toEqual(next.handoff.replay?.events);
      }
      expect(upsert).toHaveBeenCalledTimes(2);
    }
  );
});
