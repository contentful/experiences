// @vitest-environment jsdom

import {
  buildPreparedEvents,
  PROFILE_CACHE_KEY,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';
import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';
import { seedConsent, clearIdentityCookies } from './test-fixtures/consent.js';

class TestContentfulExperiences extends ContentfulExperiences {
  admit(
    events: NonNullable<ExperiencesHandoff['replay']>['events'],
    profileId?: string,
    locale?: string
  ) {
    return this.sendPreparedExperienceEvents(events, profileId, locale);
  }
}

const runtimes = new Set<TestContentfulExperiences>();

function createRuntime(profile?: { id: string }) {
  const runtime = new TestContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    ...(profile === undefined ? {} : { profile }),
  });
  runtimes.add(runtime);
  return runtime;
}

// Prepared for an opted-in visitor, matching the browser these tests run as.
function prepared(runtime: TestContentfulExperiences, consent = true) {
  return buildPreparedEvents({
    eventBuilder: runtime.eventBuilder,
    initialEvents: [{ type: 'track', event: 'prepared' }],
    eventConsent: consent,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

// Consent is not what these tests are about: run as a visitor who has opted in.
beforeEach(() => {
  seedConsent({ events: true, persistence: true });
});

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  window.localStorage.clear();
  clearIdentityCookies();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Web prepared Personalization delivery', () => {
  it('admits the exact batch before HTTP completes and stamps the browser consent', async () => {
    const pending = deferred<{ profile: { id: string } }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValue(pending.promise as never);
    const runtime = createRuntime();
    const events = prepared(runtime, true);

    await expect(runtime.admit(events, undefined, 'de-DE')).resolves.toEqual({ accepted: true });
    expect(runtime.personalizationDeliveryState.status).toBe('pending');
    expect(upsert).toHaveBeenCalledWith(
      { profileId: undefined, events },
      { preflight: false, locale: 'de-DE' }
    );
    expect(upsert.mock.calls[0]?.[0].events.map((event) => event.messageId)).toEqual(
      events.map((event) => event.messageId)
    );
    expect(
      upsert.mock.calls[0]?.[0].events.every((event) => event.context.gdpr?.isConsentGiven === true)
    ).toBe(true);
    expect(runtime.profile).toBeUndefined();

    pending.resolve({ profile: { id: 'api-profile' } });
    await vi.waitFor(() => expect(runtime.profile).toEqual({ id: 'api-profile' }));
    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual({
      id: 'api-profile',
    });
  });

  it('refuses an oversized prepared batch atomically', async () => {
    const upsert = vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile');
    const runtime = createRuntime();
    const events = [
      ...Array.from({ length: 100 }, () => runtime.eventBuilder.buildTrack({ event: 'prepared' })),
      runtime.eventBuilder.buildPageView(),
    ];

    await expect(runtime.admit(events)).resolves.toEqual({ accepted: false });
    expect(upsert).not.toHaveBeenCalled();
    expect(runtime.personalizationDeliveryState.status).toBe('idle');
  });

  it('uses a continuation ID for early Analytics without persisting a synthetic profile', async () => {
    const pending = deferred<{ profile: { id: string } }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValue(pending.promise as never);
    const analytics = vi
      .spyOn(InsightsApiClient.prototype, 'sendBatchEvents')
      .mockResolvedValue(true);
    const runtime = createRuntime();

    await expect(runtime.admit(prepared(runtime), 'server-profile')).resolves.toEqual({
      accepted: true,
    });
    expect(upsert.mock.calls[0]?.[0].profileId).toBe('server-profile');
    expect(runtime.profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();

    await expect(runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' })).resolves.toBe(
      true
    );
    // Personalization is held open on purpose, so start the flush and wait for Analytics.
    void runtime.flush();
    await vi.waitFor(() => expect(analytics).toHaveBeenCalled());
    expect(analytics).toHaveBeenCalledWith([
      expect.objectContaining({ profile: { id: 'server-profile' } }),
    ]);
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();

    pending.resolve({ profile: { id: 'api-profile' } });
    await vi.waitFor(() => expect(runtime.profile).toEqual({ id: 'api-profile' }));
    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual({
      id: 'api-profile',
    });
  });

  it('prefers an established browser profile over a handoff continuation ID', async () => {
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'browser-profile' } } as never);
    const runtime = createRuntime({ id: 'browser-profile' });

    await expect(
      runtime.hydrateAndTrackCurrentPage(
        {
          spaceId: 'space',
          environmentId: 'environment',
          cache: { scope: 'private-request' },
          profileId: 'server-profile',
          replay: { routeKey: '/first', events: prepared(runtime) },
        },
        { routeKey: '/first' }
      )
    ).resolves.toEqual({ accepted: true });
    expect(upsert.mock.calls[0]?.[0].profileId).toBe('browser-profile');
  });

  it('keeps the adopted continuation ID when another prepared handoff arrives', async () => {
    const first = deferred<{ profile: { id: string } }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(first.promise as never)
      .mockResolvedValueOnce({ profile: { id: 'committed-profile' } } as never);
    const analytics = vi
      .spyOn(InsightsApiClient.prototype, 'sendBatchEvents')
      .mockResolvedValue(true);
    const runtime = createRuntime();

    await expect(
      runtime.hydrateAndTrackCurrentPage(
        {
          spaceId: 'space',
          environmentId: 'environment',
          cache: { scope: 'private-request' },
          profileId: 'first-profile',
          replay: { routeKey: '/first', events: prepared(runtime) },
        },
        { routeKey: '/first' }
      )
    ).resolves.toEqual({ accepted: true });
    await expect(
      runtime.hydrateAndTrackCurrentPage(
        {
          spaceId: 'space',
          environmentId: 'environment',
          cache: { scope: 'private-request' },
          profileId: 'second-profile',
          replay: { routeKey: '/second', events: prepared(runtime) },
        },
        { routeKey: '/second' }
      )
    ).resolves.toEqual({ accepted: true });
    expect(upsert).toHaveBeenCalledTimes(1);

    await expect(runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' })).resolves.toBe(
      true
    );
    // Personalization is held open on purpose, so start the flush and wait for Analytics.
    void runtime.flush();
    await vi.waitFor(() => expect(analytics).toHaveBeenCalled());
    expect(analytics).toHaveBeenCalledWith([
      expect.objectContaining({ profile: { id: 'first-profile' } }),
    ]);

    first.resolve({ profile: { id: 'first-committed-profile' } });
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
    expect(upsert.mock.calls[1]?.[0].profileId).toBe('first-profile');
  });

  it('sends an ordinary online event while prepared HTTP is pending', async () => {
    const pending = deferred<{ profile: { id: string } }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(pending.promise as never)
      .mockResolvedValueOnce({ profile: { id: 'direct-profile' } } as never);
    const runtime = createRuntime({ id: 'existing-profile' });

    await runtime.admit(prepared(runtime));
    await expect(runtime.track({ event: 'ordinary' })).resolves.toMatchObject({
      accepted: true,
      data: { profile: { id: 'direct-profile' } },
    });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1]?.[0].events).toHaveLength(1);
    expect(runtime.profile).toEqual({ id: 'direct-profile' });

    pending.resolve({ profile: { id: 'stale-prepared-profile' } });
    await vi.waitFor(() => expect(runtime.personalizationDeliveryState.status).toBe('success'));
    expect(runtime.profile).toEqual({ id: 'direct-profile' });
  });

  it('queues while offline and flushes on reconnect', async () => {
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: { id: 'connected-profile' } } as never);
    const runtime = createRuntime();
    window.dispatchEvent(new Event('offline'));

    await expect(runtime.admit(prepared(runtime))).resolves.toEqual({ accepted: true });
    await expect(runtime.track({ event: 'offline-ordinary' })).resolves.toEqual({ accepted: true });
    expect(upsert).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(runtime.profile).toEqual({ id: 'connected-profile' }));
  });

  it('ignores stale prepared responses after reset and cleans up a failed retry', async () => {
    vi.useFakeTimers();
    const pending = deferred<{ profile: { id: string } }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(pending.promise as never)
      .mockRejectedValueOnce(new Error('offline'));
    const runtime = createRuntime();

    await runtime.admit(prepared(runtime));
    runtime.reset();
    pending.resolve({ profile: { id: 'old-profile' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    expect(runtime.personalizationDeliveryState.status).toBe('idle');

    await runtime.admit(prepared(runtime));
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.personalizationDeliveryState).toEqual({ status: 'failed', reason: 'api-error' });
    runtime.reset();
    await vi.advanceTimersByTimeAsync(1000);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(runtime.personalizationDeliveryState.status).toBe('idle');
  });

  it('ignores a late prepared response after destroy', async () => {
    const pending = deferred<{ profile: { id: string } }>();
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockReturnValue(
      pending.promise as never
    );
    const runtime = createRuntime();

    await runtime.admit(prepared(runtime));
    runtime.destroy();
    pending.resolve({ profile: { id: 'old-profile' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('does not persist a late ordinary Personalization response after destroy', async () => {
    const pending = deferred<{ profile: { id: string } }>();
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockReturnValue(
      pending.promise as never
    );
    const runtime = createRuntime();
    const send = runtime.track({ event: 'in-flight' });

    runtime.destroy();
    pending.resolve({ profile: { id: 'late-profile' } });
    await send;
    expect(runtime.profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('cancels an old destroy drain without clearing a replacement Web profile', async () => {
    const pending = deferred<{ profile: { id: string } }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(pending.promise as never)
      .mockResolvedValue({ profile: { id: 'later-profile' } } as never);
    const oldRuntime = createRuntime();
    await oldRuntime.admit(prepared(oldRuntime), undefined, 'de-DE');
    await oldRuntime.admit(prepared(oldRuntime), undefined, 'fr-FR');
    expect(upsert).toHaveBeenCalledTimes(1);

    oldRuntime.destroy();
    const replacement = createRuntime({ id: 'replacement-profile' });
    oldRuntime.reset();
    pending.resolve({ profile: { id: 'old-profile' } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(replacement.profile).toEqual({ id: 'replacement-profile' });
    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual({
      id: 'replacement-profile',
    });
  });

  it('does not send ordinary Analytics after destroy releases ownership', async () => {
    const analytics = vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents');
    const runtime = createRuntime({ id: 'browser-profile' });

    runtime.destroy();
    await expect(runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' })).resolves.toBe(
      false
    );
    expect(analytics).not.toHaveBeenCalled();
  });

  it('removes its connectivity listeners on destroy', () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const runtime = createRuntime();
    const online = added.mock.calls.find(([name]) => name === 'online')?.[1];
    const offline = added.mock.calls.find(([name]) => name === 'offline')?.[1];

    expect(online).toBeTypeOf('function');
    expect(offline).toBeTypeOf('function');
    runtime.destroy();
    expect(removed).toHaveBeenCalledWith('online', online);
    expect(removed).toHaveBeenCalledWith('offline', offline);
  });
});
