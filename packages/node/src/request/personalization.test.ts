import { createRuntime, spyOnEventApi } from '../test/runtime.js';
import { deferred } from '../test/deferred.js';
import { profileFixture } from '../test/fixtures/profile.js';
import { describe, expect, it, vi } from 'vitest';
import type { ContentfulExperiences, Config } from '../contentful-experiences.js';
import type { OptimizationEventStreamEvent } from '../index.js';

describe('Node request personalization', () => {
  const resolverConfig = { components: {} };

  type Request = ReturnType<ContentfulExperiences['forRequest']>;
  type Personalization = { profileId?: string; events?: unknown[] };

  // All three content locators use the same request preparation owner.
  const cases = [
    {
      label: 'by Experience id',
      method: 'fetchExperience',
      locator: { experienceId: 'experience', locale: undefined },
      fetchIt: (request: Request, personalization?: Personalization) =>
        request.fetchExperience({ experienceId: 'experience', personalization } as never, {
          config: resolverConfig,
        }),
    },
    {
      label: 'by node id',
      method: 'fetchByDestinationNode',
      locator: { destinationId: 'dest', nodeId: 'node' },
      fetchIt: (request: Request, personalization?: Personalization) =>
        request.fetchByDestinationNode(
          { destinationId: 'dest', nodeId: 'node', personalization } as never,
          { config: resolverConfig }
        ),
    },
    {
      label: 'by path',
      method: 'fetchByDestinationPath',
      locator: { destinationId: 'dest', path: '/page' },
      fetchIt: (request: Request, personalization?: Personalization) =>
        request.fetchByDestinationPath(
          { destinationId: 'dest', path: '/page', personalization } as never,
          { config: resolverConfig }
        ),
    },
  ] as const;

  describe.each(cases)(
    'Node personalization preparation $label',
    ({ method, locator, fetchIt }) => {
      const spyOnRuntime = (sdk: ContentfulExperiences, result: object = { nodes: [] }) =>
        vi.spyOn(sdk, method).mockResolvedValue(result as never);

      it('forwards personalization to the runtime', async () => {
        const sdk = createRuntime();
        const fetch = spyOnRuntime(sdk);
        const page = sdk.eventBuilder.buildPageView();
        const track = sdk.eventBuilder.buildTrack({ event: 'purchase' });
        const original = globalThis.structuredClone([page, track]);

        await fetchIt(sdk.forRequest({ consent: { events: true } }), {
          profileId: 'explicit',
          events: [page, track],
        });

        expect(fetch).toHaveBeenCalledExactlyOnceWith(
          {
            ...locator,
            personalization: {
              profileId: 'explicit',
              events: [page, track].map((event) => ({
                ...event,
                context: { ...event.context, gdpr: { isConsentGiven: true } },
              })),
            },
          },
          expect.anything()
        );
        expect([page, track]).toEqual(original);
        expect(track.context.gdpr?.isConsentGiven).toBe(false);
        expect(page.context.gdpr?.isConsentGiven).toBe(false);
      });

      it('carries request identity, adopts the full returned profile and respects explicit overrides', async () => {
        const sdk = createRuntime();
        const fetch = spyOnRuntime(sdk, {
          nodes: [],
          personalization: { profile: profileFixture('returned') },
        });
        const request = sdk.forRequest({ profile: { id: 'initial' } });
        await fetchIt(request);
        expect(fetch).toHaveBeenLastCalledWith(
          { ...locator, personalization: { profileId: 'initial' } },
          expect.anything()
        );
        expect(request.profile).toEqual(profileFixture('returned'));
        await fetchIt(request, { profileId: 'explicit', events: [] });
        expect(fetch).toHaveBeenLastCalledWith(
          { ...locator, personalization: { profileId: 'explicit', events: [] } },
          expect.anything()
        );
        expect(request.profile).toEqual(profileFixture('returned'));
      });

      if (method !== 'fetchExperience') {
        it('returns a redirect unchanged and leaves the profile alone', async () => {
          const sdk = createRuntime();
          spyOnRuntime(sdk, { redirect: { path: '/elsewhere' } });
          const request = sdk.forRequest({ profile: { id: 'initial' } });

          await expect(fetchIt(request)).resolves.toEqual({ redirect: { path: '/elsewhere' } });
          expect(request.profile).toEqual({ id: 'initial' });
        });
      }

      it('drops caller-built events that consent does not admit and reports them', async () => {
        const onEventBlocked = vi.fn();
        const sdk = createRuntime({ onEventBlocked });
        const fetch = spyOnRuntime(sdk);
        const page = sdk.eventBuilder.buildPageView();
        const track = sdk.eventBuilder.buildTrack({ event: 'clicked' });

        await fetchIt(sdk.forRequest({ consent: { events: false } }), { events: [page, track] });

        expect(fetch).toHaveBeenCalledExactlyOnceWith(
          { ...locator, personalization: { events: [page] } },
          expect.anything()
        );
        expect(onEventBlocked).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'consent', method: 'track' })
        );
      });

      it('runs event interceptors on caller-built events before sending', async () => {
        const sdk = createRuntime();
        const fetch = spyOnRuntime(sdk);
        sdk.interceptors.event.add((event) => {
          event.context.userAgent = 'redacted';
          return event;
        });

        await fetchIt(sdk.forRequest({ consent: { events: true } }), {
          events: [sdk.eventBuilder.buildPageView()],
        });

        const sent = fetch.mock.calls[0]?.[0].personalization?.events?.[0];
        expect(sent).toMatchObject({ context: { userAgent: 'redacted' } });
      });
    }
  );

  const resolver = { config: { components: {} } };
  function setup(policy: Pick<Config, 'allowedEventTypes' | 'onEventBlocked'> = {}) {
    const sdk = createRuntime(policy);
    return { sdk, ...spyOnEventApi(sdk, 'response') };
  }

  describe('Node event interceptors', () => {
    it('shares its instance registry across request facades', async () => {
      const { sdk, upsert } = setup();
      const other = setup();
      const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
      sdk.interceptors.event.add(hook);
      await sdk.forRequest({ consent: true }).page();
      await sdk.forRequest({ consent: true }).page();
      await other.sdk.forRequest({ consent: true }).page();
      expect(hook).toHaveBeenCalledTimes(2);
      expect(upsert).toHaveBeenCalledTimes(2);
    });

    it('intercepts direct Personalization and Analytics once on their original transports', async () => {
      const { sdk, upsert, analytics } = setup();
      const hook = vi.fn((event: OptimizationEventStreamEvent) => {
        event.context.userAgent = 'normalized';
        return event;
      });
      sdk.interceptors.event.add(hook);
      const request = sdk.forRequest({ consent: true, profile: profileFixture('visitor') });
      await request.page();
      await request.trackClick({ entityId: 'entity', entityKind: 'Experience' });
      expect(hook).toHaveBeenCalledTimes(2);
      expect(upsert.mock.calls[0]?.[0].events[0]?.context.userAgent).toBe('normalized');
      expect(analytics.mock.calls[0]?.[0][0]?.events[0]?.context.userAgent).toBe('normalized');
    });

    it('isolates concurrent request identities/context despite one shared asynchronous hook', async () => {
      const { sdk, upsert } = setup();
      sdk.interceptors.event.add(async (event) => {
        await Promise.resolve();
        return event;
      });
      const a = sdk.forRequest({
        consent: true,
        profile: { id: 'a' },
        eventContext: { userAgent: 'agent-a' },
      });
      const b = sdk.forRequest({
        consent: true,
        profile: { id: 'b' },
        eventContext: { userAgent: 'agent-b' },
      });
      await Promise.all([a.page(), b.page()]);
      expect(
        upsert.mock.calls.map(([body]) => [body.profileId, body.events[0]?.context.userAgent])
      ).toEqual([
        ['a', 'agent-a'],
        ['b', 'agent-b'],
      ]);
    });

    it('captures XDA identity and revision before asynchronous interception', async () => {
      const { sdk, upsert } = setup();
      const hold = deferred();
      sdk.interceptors.event.add(async (event) => {
        if (event.type === 'page') await hold.promise;
        return event;
      });
      const fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue({
        nodes: [],
        personalization: { profile: profileFixture('stale') },
      } as never);
      const request = sdk.forRequest({ consent: true, profile: { id: 'initial' } });
      const pending = request.fetchExperience(
        {
          experienceId: 'exp',
          personalization: { events: [sdk.eventBuilder.buildPageView()] },
        },
        resolver
      );
      await request.identify({ userId: 'new' });
      upsert.mockResolvedValueOnce({ profile: profileFixture('stale') } as never);
      hold.resolve();
      await pending;
      expect(fetch.mock.calls[0]?.[0].personalization?.profileId).toBe('initial');
      expect(request.profile?.id).toBe('response');
    });

    it('passes concurrent XDA hook results to its fetch path', async () => {
      const { sdk, upsert, analytics } = setup();
      const fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue({ nodes: [] } as never);
      const hold = deferred();
      const started: [string, string | undefined][] = [];
      sdk.interceptors.event.add(async (event) => {
        started.push([event.type, event.context.userAgent]);
        expect(event.context).toMatchObject({ gdpr: { isConsentGiven: true } });
        if (event.type === 'identify') await hold.promise;
        event.context.userAgent = 'hook';
        Object.assign(event.context, { gdpr: { isConsentGiven: false } });
        return event;
      });
      const request = sdk.forRequest({
        consent: true,
        eventContext: { userAgent: 'request-agent' },
      });
      const events = [
        sdk.eventBuilder.buildIdentify({ userId: 'user', userAgent: 'request-agent' }),
        sdk.eventBuilder.buildPageView({ userAgent: 'request-agent' }),
      ];
      Object.assign(events[0]!.context.gdpr!, { isConsentGiven: 'yes' });
      const original = globalThis.structuredClone(events);
      expect(started).toEqual([]);
      expect(upsert).not.toHaveBeenCalled();
      expect(analytics).not.toHaveBeenCalled();
      const pending = request.fetchExperience(
        { experienceId: 'exp', personalization: { events } },
        resolver
      );
      expect(started).toEqual([
        ['identify', 'request-agent'],
        ['page', 'request-agent'],
      ]);
      expect(fetch).not.toHaveBeenCalled();
      hold.resolve();
      await pending;
      const sent = fetch.mock.calls[0]?.[0].personalization?.events;
      expect(sent?.map((event) => event.type)).toEqual(['identify', 'page']);
      expect(sent?.[0]).toMatchObject({
        context: { userAgent: 'hook', gdpr: { isConsentGiven: false } },
      });
      expect(events).toEqual(original);
    });

    it('keeps XDA profile/content fetch while dropping original and transformed blocked events', async () => {
      const onEventBlocked = vi.fn();
      const { sdk } = setup({ onEventBlocked });
      const fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue({ nodes: [] } as never);
      const hook = vi.fn(() => sdk.eventBuilder.buildTrack({ event: 'restricted' }));
      sdk.interceptors.event.add(hook);
      await sdk.forRequest({ consent: false, profile: { id: 'visitor' } }).fetchExperience(
        {
          experienceId: 'exp',
          personalization: {
            events: [
              sdk.eventBuilder.buildPageView(),
              sdk.eventBuilder.buildTrack({ event: 'blocked' }),
            ],
          },
        },
        resolver
      );
      expect(hook).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[0].personalization).toEqual({
        profileId: 'visitor',
        events: [],
      });
      expect(onEventBlocked).toHaveBeenCalledTimes(2);
    });

    it('rejects invalid final XDA hook output before final consent and transport', async () => {
      const onEventBlocked = vi.fn();
      const { sdk } = setup({ onEventBlocked });
      const fetch = vi.spyOn(sdk, 'fetchExperience').mockResolvedValue({ nodes: [] } as never);
      const hook = vi.fn(() => ({ type: 'track' }) as never);
      sdk.interceptors.event.add(hook);
      await expect(
        sdk.forRequest().fetchExperience(
          {
            experienceId: 'exp',
            personalization: { events: [sdk.eventBuilder.buildPageView()] },
          },
          resolver
        )
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
      expect(onEventBlocked).not.toHaveBeenCalled();
      expect(hook).toHaveBeenCalledOnce();
    });
  });
});
