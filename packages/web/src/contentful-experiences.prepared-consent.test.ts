// @vitest-environment jsdom

import { EventBuilder, type ExperiencesHandoff } from '@contentful/experiences-runtime';
import { ExperienceApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';
import { seedConsent, clearIdentityCookies } from './test-fixtures/consent.js';
import { deferred } from './test-fixtures/dom.js';

type ExperienceEvents = NonNullable<ExperiencesHandoff['replay']>['events'];

const runtimes = new Set<ContentfulExperiences>();

function createRuntime(
  config: Partial<ConstructorParameters<typeof ContentfulExperiences>[0]> = {}
): ContentfulExperiences {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    ...config,
  });
  runtimes.add(runtime);
  return runtime;
}

/** A batch built the way a Node server builds it, stamped with the server's consent. */
function serverBatch(serverConsent: boolean, withTrack = true): ExperienceEvents {
  const builder = new EventBuilder({
    channel: 'server',
    library: { name: 'test', version: '1' },
    getConsent: () => serverConsent,
  });
  return [
    ...(withTrack ? [builder.buildTrack({ event: 'prepared' })] : []),
    builder.buildPageView(),
  ];
}

function handoffWith(events: ExperienceEvents, routeKey = '/first'): ExperiencesHandoff {
  return {
    spaceId: 'space',
    environmentId: 'environment',
    cache: { scope: 'private-request' },
    profileId: 'server-profile',
    replay: { routeKey, events },
  };
}

const flags = (events: readonly { context: { gdpr?: { isConsentGiven?: boolean } } }[]) =>
  events.map((event) => event.context.gdpr?.isConsentGiven);

beforeEach(() => {
  vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue({
    profile: { id: 'delivered' },
  } as never);
});

afterEach(async () => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearIdentityCookies();
});

describe('Web prepared handoff and consent', () => {
  describe('the gate', () => {
    it('admits a page-only batch by default, since page is allow-listed', async () => {
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);
      const [page] = serverBatch(true, false);

      const result = await runtime.hydrateAndTrackCurrentPage(handoffWith([page!]), {
        routeKey: '/first',
      });

      expect(result.accepted).toBe(true);
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      expect(upsert.mock.calls[0]![0].events).toEqual([
        { ...page, context: { ...page!.context, gdpr: { isConsentGiven: false } } },
      ]);
    });

    it('refuses the whole batch when one event is not admitted, and reports each', async () => {
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({ onEventBlocked });
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);
      const events = serverBatch(true);

      const result = await runtime.hydrateAndTrackCurrentPage(handoffWith(events), {
        routeKey: '/first',
      });

      // `track` is not allow-listed, so the prepared batch is refused...
      expect(onEventBlocked).toHaveBeenCalledTimes(1);
      expect(onEventBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'consent', method: 'track' })
      );
      // ...and the browser falls back to its own gated page event.
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      const sent = upsert.mock.calls[0]![0].events;
      expect(sent.map(({ type }) => type)).toEqual(['page']);
      expect(sent[0]!.messageId).not.toBe(events.at(-1)!.messageId);
      expect(result.accepted).toBe(true);
    });

    it('reports every blocked event, not only the first', async () => {
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({ onEventBlocked, allowedEventTypes: [] });
      const events = serverBatch(true);

      await expect(
        runtime.hydrateAndTrackCurrentPage(handoffWith(events), { routeKey: '/first' })
      ).resolves.toEqual({ accepted: false });

      // Both prepared events are reported, then the browser's own fallback page, which
      // the same gate also blocks.
      expect(onEventBlocked.mock.calls.map(([event]) => event.method)).toEqual([
        'track',
        'page',
        'page',
      ]);
      expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
    });
  });

  describe('the stamp', () => {
    it('stamps the browser consent when the server stamped consent but the browser denied it', async () => {
      seedConsent({ events: false });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);

      await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(true, false)), {
        routeKey: '/first',
      });

      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      // The server said true. The browser decision that admitted `page` was false.
      expect(flags(upsert.mock.calls[0]![0].events)).toEqual([false]);
    });

    it('stamps the browser consent when the server did not stamp consent but the browser granted it', async () => {
      seedConsent({ events: true });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);

      await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(false)), {
        routeKey: '/first',
      });

      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      expect(flags(upsert.mock.calls[0]![0].events)).toEqual([true, true]);
    });
  });

  describe('queued events when consent changes', () => {
    /** Accept events while offline so they sit in the queue, as for a visitor on a bad connection. */
    async function queueOffline(runtime: ContentfulExperiences) {
      window.dispatchEvent(new Event('offline'));
      await runtime.track({ event: 'queued-1' });
      await runtime.track({ event: 'queued-2' });
      expect(runtime.states.experienceRequestState.current.status).toBe('idle');
    }

    it('drops queued events when event consent is withdrawn, so they are never sent', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);
      await queueOffline(runtime);

      runtime.consent({ events: false });
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();

      expect(upsert).not.toHaveBeenCalled();
      runtime.destroy();
      await Promise.resolve();
      expect(upsert).not.toHaveBeenCalled();
    });

    it('still sends queued events when consent is granted or only persistence changes', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);
      await queueOffline(runtime);

      runtime.consent({ persistence: false });
      runtime.consent({ events: true });
      window.dispatchEvent(new Event('online'));

      await vi.waitFor(() => expect(upsert).toHaveBeenCalled());
      expect(upsert.mock.calls[0]![0].events.map((event) => event.type)).toEqual([
        'track',
        'track',
      ]);
    });

    it('blocks new events after withdrawal, so nothing is queued again', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);
      window.dispatchEvent(new Event('offline'));
      runtime.consent({ events: false });

      await expect(runtime.track({ event: 'after' })).resolves.toEqual({ accepted: false });
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();

      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe('responses that complete after consent is withdrawn', () => {
    it('does not publish or persist a profile from an online event that was in flight', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: { profile: { id: 'live-profile' } } });
      const response = deferred<{ profile: { id: string } }>();
      vi.mocked(ExperienceApiClient.prototype.upsertProfile).mockReturnValue(
        response.promise as never
      );

      const pending = runtime.track({ event: 'in-flight' });
      await vi.waitFor(() =>
        expect(ExperienceApiClient.prototype.upsertProfile).toHaveBeenCalled()
      );
      runtime.consent({ events: false });
      response.resolve({ profile: { id: 'late-profile' } });
      await pending;

      // The request was already sent, but its response must not replace the live profile
      // or reach storage while persistence is still granted.
      expect(runtime.states.profile.current).toEqual({ id: 'live-profile' });
      expect(window.localStorage.getItem('__ctfl_opt_profile__')).toBe(
        JSON.stringify({ id: 'live-profile' })
      );
      expect({
        events: runtime.states.consent.current,
        persistence: runtime.states.persistenceConsent.current,
      }).toEqual({ events: false, persistence: true });
    });

    it('does not publish delivery state or profile from a queued flush that was in flight', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: { profile: { id: 'live-profile' } } });
      window.dispatchEvent(new Event('offline'));
      await runtime.track({ event: 'queued' });
      const response = deferred<{ profile: { id: string } }>();
      vi.mocked(ExperienceApiClient.prototype.upsertProfile).mockReturnValue(
        response.promise as never
      );
      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() =>
        expect(runtime.states.experienceRequestState.current.status).toBe('pending')
      );

      runtime.consent({ events: false });
      response.resolve({ profile: { id: 'late-profile' } });
      await Promise.resolve();
      await Promise.resolve();

      expect(runtime.states.profile.current).toEqual({ id: 'live-profile' });
      expect(runtime.states.experienceRequestState.current.status).not.toBe('success');
    });

    it('still publishes responses for events sent after consent is granted again', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: { profile: { id: 'live-profile' } } });
      runtime.consent({ events: false });
      runtime.consent({ events: true });
      vi.mocked(ExperienceApiClient.prototype.upsertProfile).mockResolvedValue({
        profile: { id: 'fresh-profile' },
      } as never);

      await runtime.track({ event: 'after-regrant' });

      expect(runtime.states.profile.current).toEqual({ id: 'fresh-profile' });
    });
  });

  describe('handoff acceptance across a withdrawal', () => {
    it('lets the same route be admitted again after its queued page was discarded', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);
      const handoff = handoffWith(serverBatch(true, false));

      // Admitted while offline, so the page sits in the queue and is not sent.
      window.dispatchEvent(new Event('offline'));
      await expect(
        runtime.hydrateAndTrackCurrentPage(handoff, { routeKey: '/first' })
      ).resolves.toEqual({ accepted: true });
      expect(upsert).not.toHaveBeenCalled();

      // Withdrawing discards the queued page; granting again and reconnecting must not
      // leave the route looking admitted.
      runtime.consent({ events: false });
      runtime.consent({ events: true });
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      expect(upsert).not.toHaveBeenCalled();

      const retry = await runtime.hydrateAndTrackCurrentPage(handoff, { routeKey: '/first' });

      expect(retry.accepted).toBe(true);
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    });

    it('lets trackCurrentPage send the route again after withdrawal discarded its page', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);

      window.dispatchEvent(new Event('offline'));
      await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(true, false)), {
        routeKey: '/first',
      });
      runtime.consent({ events: false });
      runtime.consent({ events: true });
      window.dispatchEvent(new Event('online'));

      const result = await runtime.trackCurrentPage({
        routeKey: '/first',
        buildPayload: () => ({}),
      });

      expect(result.accepted).toBe(true);
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    });

    it('forgets a route that was already sent, so it can be sent again after withdrawal and a new grant', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);

      await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(true, false)), {
        routeKey: '/first',
      });
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      runtime.consent({ events: false });
      runtime.consent({ events: true });

      await runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) });

      // A new consent decision starts a new page view for the route.
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
    });

    it('keeps an accepted route accepted when consent is only granted or persistence changes', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);

      await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(true, false)), {
        routeKey: '/first',
      });
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      runtime.consent({ persistence: false });
      runtime.consent({ events: true });

      await runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) });

      // Already sent for this route; nothing is sent twice.
      expect(upsert).toHaveBeenCalledTimes(1);
    });
  });
});
