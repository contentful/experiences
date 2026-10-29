// @vitest-environment jsdom

import type { Profile as EventProfile } from '@contentful/optimization-api-client/api-schemas';
import {
  withEventConsent,
  PROFILE_CACHE_KEY,
  type ExperiencesHandoff,
} from '@contentful/experiences-runtime';
import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';
import { seedConsent, clearIdentityCookies } from './test-fixtures/consent.js';
import { deferred } from './test-fixtures/dom.js';
import { completeProfile } from './test-fixtures/profile.js';

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

function createRuntime(profile?: EventProfile) {
  const runtime = new TestContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    ...(profile === undefined ? {} : { defaults: { profile } }),
  });
  runtimes.add(runtime);
  return runtime;
}

// Prepared for an opted-in visitor, matching the browser these tests run as.
function prepared(runtime: TestContentfulExperiences, consent = true) {
  return [
    runtime.eventBuilder.buildTrack({ event: 'prepared' }),
    runtime.eventBuilder.buildPageView(),
  ].map((event) => withEventConsent(event, consent));
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
    const pending = deferred<{ profile: EventProfile }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValue(pending.promise as never);
    const runtime = createRuntime();
    const events = prepared(runtime, true);

    await expect(runtime.admit(events, undefined, 'de-DE')).resolves.toEqual({ accepted: true });
    expect(runtime.states.experienceRequestState.current.status).toBe('pending');
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
    expect(runtime.states.profile.current).toBeUndefined();

    pending.resolve({ profile: completeProfile('api-profile') });
    await vi.waitFor(() =>
      expect(runtime.states.profile.current).toEqual(completeProfile('api-profile'))
    );
    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(
      completeProfile('api-profile')
    );
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
    expect(runtime.states.experienceRequestState.current.status).toBe('idle');
  });

  it('drops early Analytics under a bare continuation ID without persisting a synthetic profile', async () => {
    const pending = deferred<{ profile: EventProfile }>();
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
    expect(runtime.states.profile.current).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();

    // Insights rejects an id-only profile, so a click under the bare continuation ID is
    // accepted but never sent.
    await expect(
      runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' })
    ).resolves.toEqual({ accepted: true });
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();

    const apiProfile = completeProfile('api-profile');
    pending.resolve({ profile: apiProfile });
    await vi.waitFor(() => expect(runtime.states.profile.current).toEqual(apiProfile));
    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(apiProfile);
    await runtime.flush();
    expect(analytics).not.toHaveBeenCalled();

    // Once the Experience API returns the complete profile, Analytics flows again.
    await runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' });
    await runtime.flush();
    expect(analytics).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ profile: apiProfile }),
    ]);
  });

  it('sends an ordinary online event while prepared HTTP is pending', async () => {
    const pending = deferred<{ profile: EventProfile }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(pending.promise as never)
      .mockResolvedValueOnce({ profile: completeProfile('direct-profile') } as never);
    const runtime = createRuntime(completeProfile('existing-profile'));

    await runtime.admit(prepared(runtime));
    await expect(runtime.track({ event: 'ordinary' })).resolves.toMatchObject({
      accepted: true,
      data: { profile: completeProfile('direct-profile') },
    });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1]?.[0].events).toHaveLength(1);
    expect(runtime.states.profile.current).toEqual(completeProfile('direct-profile'));

    pending.resolve({ profile: completeProfile('stale-prepared-profile') });
    await vi.waitFor(() =>
      expect(runtime.states.experienceRequestState.current.status).toBe('success')
    );
    expect(runtime.states.profile.current).toEqual(completeProfile('direct-profile'));
  });

  it('queues while offline and flushes on reconnect', async () => {
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockResolvedValue({ profile: completeProfile('connected-profile') } as never);
    const runtime = createRuntime();
    window.dispatchEvent(new Event('offline'));

    await expect(runtime.admit(prepared(runtime))).resolves.toEqual({ accepted: true });
    await expect(runtime.track({ event: 'offline-ordinary' })).resolves.toEqual({ accepted: true });
    expect(upsert).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(runtime.states.profile.current).toEqual(completeProfile('connected-profile'))
    );
  });

  it('ignores stale prepared responses after reset and cleans up a failed retry', async () => {
    vi.useFakeTimers();
    const pending = deferred<{ profile: EventProfile }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(pending.promise as never)
      .mockRejectedValueOnce(new Error('offline'));
    const runtime = createRuntime();

    await runtime.admit(prepared(runtime));
    runtime.reset();
    pending.resolve({ profile: completeProfile('old-profile') });
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.states.profile.current).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    expect(runtime.states.experienceRequestState.current.status).toBe('idle');

    await runtime.admit(prepared(runtime));
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.states.experienceRequestState.current).toEqual({
      status: 'failed',
      reason: 'api-error',
    });
    runtime.reset();
    await vi.advanceTimersByTimeAsync(1000);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(runtime.states.experienceRequestState.current.status).toBe('idle');
  });

  it('ignores a late prepared response after destroy', async () => {
    const pending = deferred<{ profile: EventProfile }>();
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockReturnValue(
      pending.promise as never
    );
    const runtime = createRuntime();

    await runtime.admit(prepared(runtime));
    runtime.destroy();
    pending.resolve({ profile: completeProfile('old-profile') });
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.states.profile.current).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('does not persist a late ordinary Personalization response after destroy', async () => {
    const pending = deferred<{ profile: EventProfile }>();
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockReturnValue(
      pending.promise as never
    );
    const runtime = createRuntime();
    const send = runtime.track({ event: 'in-flight' });
    await vi.waitFor(() => expect(ExperienceApiClient.prototype.upsertProfile).toHaveBeenCalled());

    runtime.destroy();
    pending.resolve({ profile: completeProfile('late-profile') });
    await send;
    expect(runtime.states.profile.current).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('cancels an old destroy drain without clearing a replacement Web profile', async () => {
    const pending = deferred<{ profile: EventProfile }>();
    const upsert = vi
      .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
      .mockReturnValueOnce(pending.promise as never)
      .mockResolvedValue({ profile: completeProfile('later-profile') } as never);
    const oldRuntime = createRuntime();
    await oldRuntime.admit(prepared(oldRuntime), undefined, 'de-DE');
    await oldRuntime.admit(prepared(oldRuntime), undefined, 'fr-FR');
    expect(upsert).toHaveBeenCalledTimes(1);

    oldRuntime.destroy();
    const replacement = createRuntime(completeProfile('replacement-profile'));
    oldRuntime.reset();
    pending.resolve({ profile: completeProfile('old-profile') });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(replacement.states.profile.current).toEqual(completeProfile('replacement-profile'));
    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(
      completeProfile('replacement-profile')
    );
  });

  it('does not send ordinary Analytics after destroy releases ownership', async () => {
    const analytics = vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents');
    const runtime = createRuntime(completeProfile('browser-profile'));

    runtime.destroy();
    await expect(
      runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' })
    ).resolves.toEqual({ accepted: false });
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
