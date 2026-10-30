// @vitest-environment jsdom

import { buildPreparedEvents } from '@contentful/experiences-runtime';
import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences, type ExperiencesWebConfig } from './contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from './test-fixtures/consent.js';
import { deferred, setDocumentVisibility } from './test-fixtures/dom.js';

class TestContentfulExperiences extends ContentfulExperiences {
  admit(
    events: NonNullable<
      Parameters<ContentfulExperiences['hydrateAndTrackCurrentPage']>[0]['replay']
    >['events']
  ) {
    return this.sendPreparedExperienceEvents(events, undefined, undefined);
  }
}

const runtimes = new Set<TestContentfulExperiences>();

function createRuntime(overrides: Partial<ExperiencesWebConfig> = {}) {
  const runtime = new TestContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    defaults: { profile: { id: 'visitor' } },
    ...overrides,
  } as ExperiencesWebConfig);
  runtimes.add(runtime);
  return runtime;
}

const click = (runtime: ContentfulExperiences) =>
  runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' });

const prepared = (runtime: TestContentfulExperiences) =>
  buildPreparedEvents({
    eventBuilder: runtime.eventBuilder,
    initialEvents: [{ type: 'track', event: 'prepared' }],
    eventConsent: true,
  });

beforeEach(() => {
  seedConsent({ events: true, persistence: true });
  vi.useFakeTimers();
  setDocumentVisibility('visible');
});

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearIdentityCookies();
});

describe('Web queue parity with Optimization', () => {
  describe('page hide', () => {
    it('gives a Personalization batch waiting for retry a final forced attempt', async () => {
      const upsert = vi
        .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue({ profile: { id: 'visitor' } } as never);
      vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
      const runtime = createRuntime();

      window.dispatchEvent(new Event('offline'));
      await runtime.page();
      expect(upsert).not.toHaveBeenCalled();

      // Reconnect; the first request fails and the batch waits for its backoff retry.
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      expect(upsert).toHaveBeenCalledTimes(1);

      // Leaving the page must not lose it: the backoff is bypassed by the forced attempt.
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);

      expect(upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('flush()', () => {
    it('awaits Analytics before flushing Personalization and waits for both queues', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const analyticsPending = deferred<boolean>();
      const personalizationPending = deferred<{ profile: { id: string } }>();
      const analytics = vi
        .spyOn(InsightsApiClient.prototype, 'sendBatchEvents')
        .mockReturnValue(analyticsPending.promise);
      const upsert = vi
        .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
        .mockRejectedValueOnce(new Error('offline'))
        .mockReturnValueOnce(personalizationPending.promise as never);
      const runtime = createRuntime();

      // A Personalization batch fails once and waits in backoff.
      window.dispatchEvent(new Event('offline'));
      await runtime.page();
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      expect(upsert).toHaveBeenCalledTimes(1);

      // Move the clock past the backoff without firing timers, so the batch is eligible
      // for flush() but nothing else has retried it.
      vi.setSystemTime(Date.now() + 60_000);
      await click(runtime);

      // Personalization must wait until the Analytics request completes.
      let settled = false;
      const flushing = runtime.flush().then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(analytics).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);

      analyticsPending.resolve(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(settled).toBe(false);

      personalizationPending.resolve({ profile: { id: 'visitor' } });
      await flushing;
      expect(settled).toBe(true);
    });
  });

  describe('queuePolicy.offlineMaxEvents', () => {
    const offlineTracks = async (runtime: ContentfulExperiences, count: number) => {
      const results = [];
      for (let index = 0; index < count; index += 1) {
        results.push(await runtime.track({ event: `offline-${index}` }));
      }
      return results;
    };

    it('forwards the configured ordinary-event capacity to its queue', async () => {
      const upsert = vi
        .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
        .mockResolvedValue({ profile: { id: 'visitor' } } as never);
      const runtime = createRuntime({ queuePolicy: { offlineMaxEvents: 3 } });
      window.dispatchEvent(new Event('offline'));
      expect((await offlineTracks(runtime, 4)).every((result) => result.accepted)).toBe(true);
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      expect(upsert.mock.calls[0]?.[0].events).toHaveLength(3);
    });

    it('admits a prepared batch only if the whole batch fits', async () => {
      const runtime = createRuntime({ queuePolicy: { offlineMaxEvents: 3 } });
      window.dispatchEvent(new Event('offline'));
      const batch = prepared(runtime);

      await offlineTracks(runtime, 2);
      // One queued slot left, and the batch is larger than that.
      expect(batch.length).toBeGreaterThan(1);
      await expect(runtime.admit(batch)).resolves.toEqual({ accepted: false });
    });

    it('admits a prepared batch that exactly fills the remaining capacity', async () => {
      const probe = createRuntime();
      const size = prepared(probe).length;
      probe.destroy();
      runtimes.delete(probe);

      const runtime = createRuntime({ queuePolicy: { offlineMaxEvents: size } });
      window.dispatchEvent(new Event('offline'));

      await expect(runtime.admit(prepared(runtime))).resolves.toEqual({ accepted: true });
      await expect(runtime.admit(prepared(runtime))).resolves.toEqual({ accepted: false });
    });
  });

  describe('teardown through the public SDK, as Optimization', () => {
    it('sends a queued offline page on destroy under the current profile, not an older one', async () => {
      const upsert = vi
        .spyOn(ExperienceApiClient.prototype, 'upsertProfile')
        .mockResolvedValueOnce({ profile: { id: 'profile-A' } } as never)
        .mockResolvedValueOnce({ profile: { id: 'profile-B' } } as never)
        .mockResolvedValue({ profile: { id: 'profile-B' } } as never);
      const runtime = createRuntime({ defaults: { profile: undefined } });

      // A completed drain under A.
      window.dispatchEvent(new Event('offline'));
      await runtime.page();
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      // A newer direct identify() response makes B the current profile.
      await runtime.identify({ userId: 'user-1' });
      expect(runtime.states.profile.current?.id).toBe('profile-B');
      // An ordinary offline page, drained during destruction.
      window.dispatchEvent(new Event('offline'));
      await runtime.page();
      runtime.destroy();
      await vi.advanceTimersByTimeAsync(0);

      expect(upsert.mock.calls.at(-1)?.[0].profileId).toBe('profile-B');
    });
  });
});
