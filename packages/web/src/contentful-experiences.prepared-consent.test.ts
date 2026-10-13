// @vitest-environment jsdom

import { EventBuilder, type ExperiencesHandoff } from '@contentful/experiences-runtime';
import { ExperienceApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';
import { seedConsent } from './test-fixtures/consent.js';

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
});

describe('Web prepared handoff and consent', () => {
  describe('the gate', () => {
    it('admits a page-only batch by default, since page is allow-listed', async () => {
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);

      const result = await runtime.hydrateAndTrackCurrentPage(
        handoffWith(serverBatch(true, false)),
        { routeKey: '/first' }
      );

      expect(result.accepted).toBe(true);
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      expect(upsert.mock.calls[0]![0].events.map(({ type }) => type)).toEqual(['page']);
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

      await runtime.hydrateAndTrackCurrentPage(handoffWith(events), { routeKey: '/first' });

      // Both prepared events are reported, then the browser's own fallback page, which
      // the same gate also blocks.
      expect(onEventBlocked.mock.calls.map(([event]) => event.method)).toEqual([
        'track',
        'page',
        'page',
      ]);
    });

    it('sends nothing under strict opt-in, not even the fallback page', async () => {
      const runtime = createRuntime({ allowedEventTypes: [] });
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);

      const result = await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(true)), {
        routeKey: '/first',
      });

      expect(result.accepted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('admits the whole batch once event consent is granted', async () => {
      seedConsent({ events: true });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);

      await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(true)), {
        routeKey: '/first',
      });

      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      expect(upsert.mock.calls[0]![0].events.map(({ type }) => type)).toEqual(['track', 'page']);
    });

    it('does not treat a malformed batch as admitted', async () => {
      const runtime = createRuntime();
      const events = serverBatch(true, false);
      const malformed = { ...handoffWith(events), replay: { routeKey: '/first', events: [{}] } };

      const result = await runtime.hydrateAndTrackCurrentPage(
        malformed as unknown as ExperiencesHandoff,
        { routeKey: '/first' }
      );

      // Invalid prepared input is refused; the browser's own page is sent instead.
      expect(result.accepted).toBe(true);
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

    it('stamps false for undecided browser consent', async () => {
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);

      await runtime.hydrateAndTrackCurrentPage(handoffWith(serverBatch(true, false)), {
        routeKey: '/first',
      });

      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      expect(flags(upsert.mock.calls[0]![0].events)).toEqual([false]);
    });

    it('changes only the consent flag on an admitted event', async () => {
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);
      const [page] = serverBatch(true, false);

      await runtime.hydrateAndTrackCurrentPage(handoffWith([page!]), { routeKey: '/first' });

      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      expect(upsert.mock.calls[0]![0].events[0]).toEqual({
        ...page,
        context: { ...page!.context, gdpr: { isConsentGiven: false } },
      });
    });
  });

  describe('queued events when consent changes', () => {
    /** Accept events while offline so they sit in the queue, as for a visitor on a bad connection. */
    async function queueOffline(runtime: ContentfulExperiences) {
      window.dispatchEvent(new Event('offline'));
      await runtime.track({ event: 'queued-1' });
      await runtime.track({ event: 'queued-2' });
      expect(runtime.personalizationDeliveryState.status).toBe('idle');
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
    });

    it('treats consent(false) as withdrawal for both axes', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);
      await queueOffline(runtime);

      runtime.consent(false);
      window.dispatchEvent(new Event('online'));
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

    it('does not send queued events from destroy() after consent was withdrawn', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime();
      const upsert = vi.mocked(ExperienceApiClient.prototype.upsertProfile);
      await queueOffline(runtime);

      runtime.consent({ events: false });
      runtime.destroy();
      await Promise.resolve();

      expect(upsert).not.toHaveBeenCalled();
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
});
