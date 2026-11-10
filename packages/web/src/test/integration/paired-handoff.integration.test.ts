// @vitest-environment jsdom

import {
  type BuiltFetchExperienceOptions,
  ContentfulExperiences as RuntimeExperiences,
  type FetchExperienceOptions,
  type FetchResolveOptions,
  withEventConsent,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import {
  ExperienceApiClient as PersonalizationApiClient,
  InsightsApiClient as AnalyticsApiClient,
} from '@contentful/optimization-api-client';
import type { Profile as EventProfile } from '@contentful/optimization-api-client/api-schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// This source-only import exercises both public runtime leaves without adding a Web package dependency.
import { ContentfulExperiences as NodeExperiences } from '../../../../node/src/contentful-experiences.js';
import { ContentfulExperiences as WebExperiences } from '../../contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from '../fixtures/consent.js';
import { completeProfile } from '../fixtures/profile.js';

const active = new Set<NodeExperiences | WebExperiences>();
const payloadRuntime = RuntimeExperiences.prototype as unknown as {
  fetchExperiencePayload(
    options: BuiltFetchExperienceOptions,
    resolve: FetchResolveOptions
  ): Promise<ExperiencePayload>;
};
const resolveOptions = { config: { components: {} } };

function evaluate(
  request: ReturnType<NodeExperiences['forRequest']>,
  routeKey: string,
  events: NonNullable<FetchExperienceOptions['personalization']>['events']
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
    extensions: { personalization: { profile: completeProfile('preview-profile') } },
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
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: completeProfile('evaluated-profile') } as never);
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

  it('preserves request locale across JSON replay despite differing event and browser locales', async () => {
    const upsert = vi
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: completeProfile('profile') } as never);
    const server = new NodeExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      locale: 'en-US',
      delivery: { accessToken: 'delivery-token' },
    });
    active.add(server);
    const request = server.forRequest({
      locale: 'de-DE',
      eventContext: { locale: 'it-IT' },
      consent: true,
    });
    expect(request.locale).toBe('de-DE');
    const prepared = await evaluate(request, '/localized', [
      request.eventBuilder.buildTrack({ event: 'opened', locale: 'es-ES' }),
      request.eventBuilder.buildPageView({ locale: 'fr-FR' }),
    ]);
    expect(prepared.handoff.replay?.locale).toBe('de-DE');
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
    expect(upsert.mock.calls[0]?.[1]).toEqual({ locale: 'de-DE', preflight: false });
  });

  it('round trips the evaluated batch and adopts the committed browser response', async () => {
    vi.useFakeTimers();
    const firstDelivery = deferred<{ profile: EventProfile }>();
    const upsert = vi
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockReturnValue(firstDelivery.promise as never);
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

    expect(prepared.plan?.personalization?.profile?.id).toBe('preview-profile');
    expect(prepared.handoff.profileId).toBe('preview-profile');
    expect(upsert).not.toHaveBeenCalled();
    const previewBody = vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[0]![0]
      .personalization!;
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
    expect(browser.states.personalizationRequestState.current.status).toBe('pending');
    expect(upsert).toHaveBeenCalledTimes(1);
    const [firstBody, firstOptions] = upsert.mock.calls[0]!;
    // The same events in the same order, except that the consent flag is the browser's
    // (opted in) and no longer the server's (denied), which admitted them for sending.
    expect(firstBody).toEqual({
      profileId: 'preview-profile',
      events: prepared.handoff.replay!.events.map((event) => withEventConsent(event, true)),
    });
    expect(firstOptions).toEqual({ locale: 'de-DE', preflight: false });
    expect(browser.states.profile.current).toEqual(completeProfile('preview-profile'));

    expect(serverHook).toHaveBeenCalledTimes(3);
    expect(browserHook).not.toHaveBeenCalled();
    firstDelivery.resolve({ profile: completeProfile('committed-profile') });
    await vi.waitFor(() =>
      expect(browser.states.profile.current).toEqual(completeProfile('committed-profile'))
    );
  });

  it('carries a preview-issued continuation ID across JSON for a new visitor', async () => {
    const delivery = deferred<{ profile: EventProfile }>();
    const upsert = vi
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(delivery.promise as never);
    vi.mocked(payloadRuntime.fetchExperiencePayload).mockResolvedValueOnce({
      nodes: [],
      extensions: { personalization: { profile: completeProfile('issued-profile') } },
    });
    const analytics = vi
      .spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents')
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

    const committed = completeProfile('committed-profile');
    delivery.resolve({ profile: committed });
    await vi.waitFor(() => expect(browser.states.profile.current).toEqual(committed));
    await browser.trackClick({ entityId: 'hero', entityKind: 'Experience' });
    await browser.flush();
    expect(analytics).toHaveBeenCalledTimes(2);
    expect(analytics.mock.calls[1]?.[0][0]?.profile.id).toBe('committed-profile');
  });

  it('retains replay after XDA failure and uses an ordinary page on a different route', async () => {
    const upsert = vi
      .spyOn(PersonalizationApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: completeProfile('committed-profile') } as never);
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
});
