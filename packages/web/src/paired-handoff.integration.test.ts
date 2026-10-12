// @vitest-environment jsdom

import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// This source-only import exercises both public runtime leaves without adding a Web package dependency.
import { ContentfulExperiences as NodeExperiences } from '../../node/src/contentful-experiences.js';
import { ContentfulExperiences as WebExperiences } from './contentful-experiences.js';

const active = new Set<NodeExperiences | WebExperiences>();

function node() {
  const sdk = new NodeExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'de-DE',
    delivery: { accessToken: 'delivery-token' },
  });
  active.add(sdk);
  return sdk;
}

function web() {
  const sdk = new WebExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
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

afterEach(() => {
  for (const sdk of active) sdk.destroy();
  active.clear();
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('paired Node preparation and Web delivery', () => {
  it('round trips one exact prepared batch and accepts it before a failed HTTP send retries', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const firstDelivery = deferred<{ profile: { id: string } }>();
    const secondDelivery = deferred<{ profile: { id: string } }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValueOnce({ profile: { id: 'preview-profile' } } as never)
      .mockReturnValueOnce(firstDelivery.promise as never)
      .mockReturnValueOnce(secondDelivery.promise as never);
    const server = node();
    const request = server.forRequest({
      locale: 'de-DE',
      profile: { id: 'known-profile' },
      eventContext: { userAgent: 'server-agent' },
      eventConsent: false,
    });
    const prepared = await request.prepareRequestHandoff({
      routeKey: '/products?sort=popular',
      initialEvents: [
        { type: 'identify', userId: 'user-1' },
        { type: 'track', event: 'experience_rendered' },
      ],
    });

    expect(prepared.data?.profile.id).toBe('preview-profile');
    expect(prepared.handoff.profileId).toBe('known-profile');
    expect(upsert).toHaveBeenCalledTimes(1);
    const [previewBody, previewOptions] = upsert.mock.calls[0]!;
    expect(previewOptions).toEqual({ locale: 'de-DE', preflight: true });
    expect(previewBody.profileId).toBe('known-profile');
    expect(previewBody.events.map((event) => event.type)).toEqual(['identify', 'track', 'page']);
    expect(new Set(previewBody.events.map((event) => event.messageId)).size).toBe(3);
    for (const event of previewBody.events) {
      expect(event.context).toMatchObject({
        locale: 'de-DE',
        userAgent: 'server-agent',
        gdpr: { isConsentGiven: false },
      });
    }
    expect(prepared.handoff.replay?.events).toEqual(previewBody.events);

    server.destroy();
    const browser = web();
    const handoff = JSON.parse(JSON.stringify(prepared.handoff));
    const admission = browser.hydrateAndTrackCurrentPage(handoff, {
      routeKey: '/products?sort=popular',
    });
    await expect(admission).resolves.toEqual({ accepted: true });
    expect(browser.personalizationDeliveryState.status).toBe('pending');
    expect(upsert).toHaveBeenCalledTimes(2);
    const [firstBody, firstOptions] = upsert.mock.calls[1]!;
    expect(firstBody).toEqual({ profileId: 'known-profile', events: previewBody.events });
    expect(firstOptions).toEqual({ locale: 'de-DE', preflight: false });
    expect(browser.profile).toBeUndefined();

    firstDelivery.reject(new Error('response lost after request may have arrived'));
    await vi.waitFor(() => expect(browser.personalizationDeliveryState.status).toBe('failed'));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert.mock.calls[2]).toEqual([firstBody, firstOptions]);
    secondDelivery.resolve({ profile: { id: 'committed-profile' } });
    await vi.waitFor(() => expect(browser.profile).toEqual({ id: 'committed-profile' }));
  });

  it('carries a preview-issued continuation ID across JSON for a new visitor', async () => {
    const delivery = deferred<{ profile: { id: string } }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValueOnce({ profile: { id: 'issued-profile' } } as never)
      .mockReturnValueOnce(delivery.promise as never);
    const analytics = vi
      .spyOn(InsightsApiClient.prototype, 'sendBatchEvents')
      .mockResolvedValue(true);
    const server = node();
    const prepared = await server.forRequest().prepareRequestHandoff({ routeKey: '/new' });

    expect(prepared.handoff.profileId).toBe('issued-profile');
    expect(upsert.mock.calls[0]?.[0].profileId).toBeUndefined();
    expect(upsert.mock.calls[0]?.[1]).toEqual({ locale: 'de-DE', preflight: true });

    server.destroy();
    const browser = web();
    await expect(
      browser.hydrateAndTrackCurrentPage(JSON.parse(JSON.stringify(prepared.handoff)), {
        routeKey: '/new',
      })
    ).resolves.toEqual({ accepted: true });
    expect(upsert.mock.calls[1]?.[0].profileId).toBe('issued-profile');
    expect(upsert.mock.calls[1]?.[0].events).toEqual(prepared.handoff.replay?.events);
    await browser.trackClick({ entityId: 'hero', entityKind: 'Experience' });
    expect(analytics.mock.calls[0]?.[0][0]?.profile.id).toBe('issued-profile');

    delivery.resolve({ profile: { id: 'committed-profile' } });
    await vi.waitFor(() => expect(browser.profile).toEqual({ id: 'committed-profile' }));
  });

  it('retains replay after preview failure and uses an ordinary page on a different route', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockRejectedValueOnce(new Error('preview unavailable'))
      .mockResolvedValue({ profile: { id: 'committed-profile' } } as never);
    const server = node();
    const prepared = await server
      .forRequest({ profile: { id: 'known-profile' }, eventConsent: true })
      .prepareRequestHandoff({
        routeKey: '/original',
        initialEvents: [{ type: 'track', event: 'prepared' }],
      });
    expect(prepared.data).toBeUndefined();
    expect(prepared.handoff.replay?.events.map((event) => event.type)).toEqual(['track', 'page']);
    expect(prepared.handoff.replay?.events).toEqual(upsert.mock.calls[0]?.[0].events);
    expect(upsert.mock.calls[0]?.[1]).toEqual({ locale: 'de-DE', preflight: true });
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Request preview failed'));

    server.destroy();
    const browser = web();
    const handoff = JSON.parse(JSON.stringify(prepared.handoff));
    await expect(
      browser.hydrateAndTrackCurrentPage(handoff, {
        routeKey: '/different',
        buildPayload: () => ({ properties: { source: 'current-route' } }),
      })
    ).resolves.toMatchObject({ accepted: true });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1]?.[0]).toMatchObject({
      profileId: 'known-profile',
      events: [{ type: 'page', properties: { source: 'current-route' } }],
    });
    expect(upsert.mock.calls[1]?.[0].events[0]?.messageId).not.toBe(
      prepared.handoff.replay?.events.at(-1)?.messageId
    );
  });

  it('refuses the entire next prepared batch at capacity, then reassesses it explicitly', async () => {
    const firstDelivery = deferred<{ profile: { id: string } }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValueOnce({ profile: { id: 'preview-profile' } } as never)
      .mockResolvedValueOnce({ profile: { id: 'preview-profile' } } as never)
      .mockReturnValueOnce(firstDelivery.promise as never)
      .mockResolvedValue({ profile: { id: 'committed-profile' } } as never);
    const server = node();
    const request = server.forRequest({ profile: { id: 'known-profile' } });
    const full = await request.prepareRequestHandoff({
      routeKey: '/full',
      initialEvents: Array.from({ length: 99 }, () => ({ type: 'track' as const, event: 'bulk' })),
    });
    const next = await request.prepareRequestHandoff({
      routeKey: '/next',
      initialEvents: [{ type: 'track', event: 'next' }],
    });
    expect(full.handoff.replay?.events).toHaveLength(100);
    expect(next.handoff.replay?.events).toHaveLength(2);
    expect(upsert.mock.calls.map(([, options]) => options)).toEqual([
      { locale: 'de-DE', preflight: true },
      { locale: 'de-DE', preflight: true },
    ]);

    server.destroy();
    const browser = web();
    const fullHandoff = JSON.parse(JSON.stringify(full.handoff));
    const nextHandoff = JSON.parse(JSON.stringify(next.handoff));
    await expect(
      browser.hydrateAndTrackCurrentPage(fullHandoff, { routeKey: '/full' })
    ).resolves.toEqual({ accepted: true });
    await expect(
      browser.hydrateAndTrackCurrentPage(nextHandoff, { routeKey: '/next' })
    ).resolves.toEqual({ accepted: false });
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert.mock.calls[2]?.[0].events).toEqual(full.handoff.replay?.events);

    firstDelivery.resolve({ profile: { id: 'committed-profile' } });
    await vi.waitFor(() => expect(browser.personalizationDeliveryState.status).toBe('success'));
    await expect(
      browser.hydrateAndTrackCurrentPage(nextHandoff, { routeKey: '/next' })
    ).resolves.toEqual({ accepted: true });
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(4));
    expect(upsert.mock.calls[3]?.[0].events).toEqual(next.handoff.replay?.events);
  });
});
