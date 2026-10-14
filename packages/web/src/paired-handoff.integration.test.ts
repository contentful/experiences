// @vitest-environment jsdom

import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// This source-only import exercises both public runtime leaves without adding a Web package dependency.
import { ContentfulExperiences as NodeExperiences } from '../../node/src/contentful-experiences.js';
import { identitySetCookie, readIdentity } from '../../../examples/node/identity-cookie.js';
import { ContentfulExperiences as WebExperiences } from './contentful-experiences.js';
import { getCookie } from './lib/cookies.js';
import { seedConsent, clearIdentityCookies } from './test-fixtures/consent.js';

const active = new Set<NodeExperiences | WebExperiences>();

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

// Consent is not what these tests are about: the browser is a visitor who has opted in.
beforeEach(() => {
  seedConsent({ events: true, persistence: true });
});

afterEach(() => {
  for (const sdk of active) sdk.destroy();
  active.clear();
  window.localStorage.clear();
  clearIdentityCookies();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('paired Node preparation and Web delivery', () => {
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
      const prepared = await request.prepareRequestHandoff({
        routeKey: '/localized',
        initialEvents: [{ type: 'track', event: 'opened', locale: 'es-ES' }],
        page: { locale: 'fr-FR' },
      });
      expect(prepared.handoff.replay?.locale).toBe(transportLocale);
      const events = prepared.handoff.replay?.events;
      expect(events?.map(({ context }) => context.locale)).toEqual(['es-ES', 'fr-FR']);
      expect(upsert.mock.calls[0]?.[1]).toEqual({ locale: transportLocale, preflight: true });

      const browser = web();
      browser.setLocale('nl-NL');
      await expect(
        browser.hydrateAndTrackCurrentPage(JSON.parse(JSON.stringify(prepared.handoff)), {
          routeKey: '/localized',
        })
      ).resolves.toEqual({ accepted: true });
      expect(upsert.mock.calls[1]?.[0].events).toEqual(events);
      expect(upsert.mock.calls[1]?.[1]).toEqual({ locale: transportLocale, preflight: false });

      await request.identify({ userId: 'visitor', locale: 'ja-JP' });
      expect(upsert.mock.calls[2]?.[0].events[0]?.context.locale).toBe('ja-JP');
      expect(upsert.mock.calls[2]?.[1]).toEqual({ locale: transportLocale });
      await request.page();
      expect(upsert.mock.calls[3]?.[0].events[0]?.context.locale).toBe(requestLocale ?? 'it-IT');
      expect(upsert.mock.calls[3]?.[1]).toEqual({ locale: transportLocale });
    }
  );

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
    // Event consent is denied, but the prepared types are allow-listed, so the batch is
    // prepared and its events keep the denied flag through the replay.
    const server = node({ allowedEventTypes: ['identify', 'track', 'page'] });
    const request = server.forRequest({
      locale: 'de-DE',
      profile: { id: 'known-profile' },
      eventContext: { userAgent: 'server-agent' },
      consent: { events: false },
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
    // The same events in the same order, except that the consent flag is the browser's
    // (opted in) and no longer the server's (denied), which admitted them for sending.
    expect(firstBody).toEqual({
      profileId: 'known-profile',
      events: previewBody.events.map((event) => ({
        ...event,
        context: { ...event.context, gdpr: { ...event.context.gdpr, isConsentGiven: true } },
      })),
    });
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
    const prepared = await server
      .forRequest({ consent: true })
      .prepareRequestHandoff({ routeKey: '/new' });

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
      .forRequest({ profile: { id: 'known-profile' }, consent: true })
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

  it.each([true, false])(
    'uses ordinary fallback guards at prepared capacity when online is %s',
    async (online) => {
      const firstDelivery = deferred<{ profile: { id: string } }>();
      const upsert = vi
        .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
        .mockResolvedValueOnce({ profile: { id: 'preview-profile' } } as never)
        .mockResolvedValueOnce({ profile: { id: 'preview-profile' } } as never)
        .mockReturnValueOnce(firstDelivery.promise as never)
        .mockResolvedValue({ profile: { id: 'committed-profile' } } as never);
      const server = node();
      const request = server.forRequest({ profile: { id: 'known-profile' }, consent: true });
      const full = await request.prepareRequestHandoff({
        routeKey: '/full',
        initialEvents: Array.from({ length: 99 }, () => ({
          type: 'track' as const,
          event: 'bulk',
        })),
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
      expect(upsert).toHaveBeenCalledTimes(online ? 4 : 3);
      expect(upsert.mock.calls[2]?.[0].events).toEqual(full.handoff.replay?.events);
      if (online) {
        const fallback = upsert.mock.calls[3];
        expect(fallback?.[0]).toMatchObject({
          profileId: 'known-profile',
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
      await vi.waitFor(() => expect(browser.personalizationDeliveryState.status).toBe('success'));
      const repeated = await browser.hydrateAndTrackCurrentPage(nextHandoff, {
        routeKey: '/next',
        buildPayload,
      });
      if (online) {
        expect(repeated).toBe(result);
        expect(buildPayload).toHaveBeenCalledTimes(1);
      } else {
        expect(repeated).toEqual({ accepted: true });
        await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(4));
        expect(upsert.mock.calls[3]?.[0].events).toEqual(next.handoff.replay?.events);
      }
      expect(upsert).toHaveBeenCalledTimes(4);
    }
  );
});

// The identity cookie carries a visitor from the browser to a server and back. The host
// application owns the HTTP: it reads the cookie, supplies the profile and its own consent,
// and decides what to write from `canPersistProfile`. Neither the cookie's presence nor
// browser storage is ever taken as server-side consent.
describe('identity cookie round trip between Web, a host, and Node', () => {
  const PROFILE_BODY = { profile: { id: 'visitor-1' } };

  /** One server request, as a host adapts it: cookie in, SDK request, Set-Cookie out. */
  async function serverRequest({
    server,
    cookieHeader,
    serverConsent,
  }: {
    server: NodeExperiences;
    cookieHeader: string | undefined;
    serverConsent: boolean;
  }) {
    const identity = readIdentity(cookieHeader);
    const request = server.forRequest({
      profile: identity === undefined ? undefined : { id: identity },
      consent: { events: serverConsent, persistence: serverConsent },
    });
    const prepared = await request.prepareRequestHandoff({ routeKey: '/products' });
    return {
      identity,
      request,
      prepared,
      setCookie: identitySetCookie({
        canPersistProfile: request.canPersistProfile,
        profileId: request.profile?.id,
        hadCookie: identity !== undefined,
      }),
    };
  }

  it('carries one identity from the browser, through a server request, and back', async () => {
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue(
      PROFILE_BODY as never
    );

    // 1. The Web SDK persists an allowed identity.
    const browser = web();
    await browser.identify({ userId: 'user-1' });
    expect(getCookie('ctfl-opt-aid')).toBe('visitor-1');

    // 2. The browser includes it on the next server request, and Node reuses that profile.
    const server = node();
    const { identity, request, prepared } = await serverRequest({
      server,
      cookieHeader: `ctfl-opt-aid=${getCookie('ctfl-opt-aid')}`,
      serverConsent: true,
    });
    expect(identity).toBe('visitor-1');
    expect(request.profile).toEqual({ id: 'visitor-1' });
    expect(
      vi.mocked(ExperienceApiClient.prototype.upsertProfile).mock.calls.at(-1)![0].profileId
    ).toBe('visitor-1');

    // 3. The handoff the server returns continues the same identity in a new browser runtime.
    expect(prepared.handoff.profileId).toBe('visitor-1');
    browser.destroy();
    const next = web();
    await next.hydrateAndTrackCurrentPage(JSON.parse(JSON.stringify(prepared.handoff)), {
      routeKey: '/products',
    });
    expect(
      vi.mocked(ExperienceApiClient.prototype.upsertProfile).mock.calls.at(-1)![0].profileId
    ).toBe('visitor-1');
    expect(getCookie('ctfl-opt-aid')).toBe('visitor-1');
  });

  it('writes the response cookie only when the host grants persistence', async () => {
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue(
      PROFILE_BODY as never
    );
    const server = node();

    const granted = await serverRequest({ server, cookieHeader: undefined, serverConsent: true });
    const withheld = await serverRequest({ server, cookieHeader: undefined, serverConsent: false });

    expect(granted.setCookie).toMatch(/^ctfl-opt-aid=visitor-1; Path=\/; Expires=/);
    expect(withheld.setCookie).toBeUndefined();
  });

  it('does not treat the cookie as server-side consent', async () => {
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue(
      PROFILE_BODY as never
    );
    const server = node();

    // The browser sent an identity, but the application has not granted consent for it.
    const { request, setCookie } = await serverRequest({
      server,
      cookieHeader: 'ctfl-opt-aid=visitor-1',
      serverConsent: false,
    });

    expect(request.canPersistProfile).toBe(false);
    // The identity is expired, in its scope, rather than kept alive.
    expect(setCookie).toBe('ctfl-opt-aid=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/');
  });

  it('expires the cookie on withdrawal in the scope it was written in, then writes it after a later grant', async () => {
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue(
      PROFILE_BODY as never
    );
    const server = node();
    const settings = {
      domain: 'example.com',
      path: '/shop',
      sameSite: 'Lax',
      secure: true,
    } as const;
    const scoped = (consent: boolean) => {
      const request = server.forRequest({
        profile: { id: 'visitor-1' },
        consent: { events: consent, persistence: consent },
      });
      return identitySetCookie({
        canPersistProfile: request.canPersistProfile,
        profileId: request.profile?.id,
        hadCookie: true,
        settings,
      });
    };

    const withdrawn = scoped(false);
    const granted = scoped(true);

    expect(withdrawn).toBe(
      'ctfl-opt-aid=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/shop; Domain=example.com; SameSite=Lax; Secure'
    );
    expect(granted).toMatch(
      /^ctfl-opt-aid=visitor-1; Path=\/shop; Domain=example\.com; SameSite=Lax; Secure; Expires=/
    );
  });

  it('expires nothing when withheld and there was no cookie to begin with', async () => {
    const server = node();
    const request = server.forRequest({ consent: { events: false, persistence: false } });

    expect(
      identitySetCookie({
        canPersistProfile: request.canPersistProfile,
        profileId: undefined,
        hadCookie: false,
      })
    ).toBeUndefined();
  });
});
