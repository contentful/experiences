// @vitest-environment jsdom

import {
  PROFILE_CACHE_KEY,
  ContentfulExperiences as RuntimeContentfulExperiences,
  ContentfulExperiences as RuntimeExperiences,
  type BuiltRuntimeFetchExperienceOptions,
  type RuntimeFetchExperienceOptions,
  type RuntimeFetchResolveOptions,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { ExperienceApiClient, InsightsApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateOptimizationData } from '../bridge-support.js';
import { ContentfulExperiences } from '../contentful-experiences.js';
import { deferred } from '../test/dom.js';
import { clearIdentityCookies, seedConsent } from '../test/fixtures/consent.js';
import { completeProfile, completeProfile as profileFixture } from '../test/fixtures/profile.js';
import { createWebHarness } from '../test/web-harness.js';

describe('destination', () => {
  const { create: createRuntime, destroy: destroyRuntimes } = createWebHarness(
    { defaults: { profile: profileFixture('visitor'), consent: false } },
    ContentfulExperiences
  );

  const resolveOptions = { config: { components: {} } };

  type Runtime = ReturnType<typeof createRuntime>;

  type DestinationFetch = (
    runtime: Runtime,
    personalization?: { profileId?: string; events?: unknown[] }
  ) => ReturnType<Runtime['fetchByDestinationPath']>;

  // Both Destination fetches share one code path with by-id, so each case runs for both.
  const byNode: [string, 'fetchByDestinationNode', DestinationFetch, object] = [
    'by node id',
    'fetchByDestinationNode',
    (runtime, personalization) =>
      runtime.fetchByDestinationNode(
        { destinationId: 'dest', nodeId: 'node', personalization } as never,
        resolveOptions
      ),
    { destinationId: 'dest', nodeId: 'node' },
  ];

  const byPath: [string, 'fetchByDestinationPath', DestinationFetch, object] = [
    'by path',
    'fetchByDestinationPath',
    (runtime, personalization) =>
      runtime.fetchByDestinationPath(
        { destinationId: 'dest', path: '/page', personalization } as never,
        resolveOptions
      ),
    { destinationId: 'dest', path: '/page' },
  ];

  beforeEach(() => {
    seedConsent({ events: false, persistence: false });
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue({
      profile: profileFixture('visitor'),
    } as never);
    vi.spyOn(InsightsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
  });

  afterEach(() => {
    destroyRuntimes();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearIdentityCookies();
  });

  describe.each([byNode, byPath])(
    'Web Destination fetch %s',
    (_label, method, fetchIt, locator) => {
      const spyOnBase = () =>
        vi.spyOn(RuntimeContentfulExperiences.prototype, method).mockResolvedValue({
          nodes: [],
        } as never);

      it('stores the complete profile XDA returns', async () => {
        const runtime = createRuntime();
        vi.spyOn(RuntimeContentfulExperiences.prototype, method).mockResolvedValue({
          nodes: [],
          personalization: { profile: profileFixture('returned') },
        } as never);

        await fetchIt(runtime);

        expect(runtime.states.profile.current).toEqual(profileFixture('returned'));
      });

      it('returns a redirect unchanged and leaves the profile alone', async () => {
        const runtime = createRuntime();
        vi.spyOn(RuntimeContentfulExperiences.prototype, method).mockResolvedValue({
          redirect: { path: '/elsewhere' },
        } as never);

        await expect(fetchIt(runtime)).resolves.toEqual({ redirect: { path: '/elsewhere' } });
        expect(runtime.states.profile.current).toEqual(profileFixture('visitor'));
      });

      it('drops caller-built events that consent does not admit and reports them', async () => {
        const onEventBlocked = vi.fn();
        const runtime = createRuntime({ onEventBlocked });
        const fetch = spyOnBase();
        const track = runtime.eventBuilder.buildTrack({ event: 'clicked' });

        await fetchIt(runtime, { events: [track] });

        expect(fetch).toHaveBeenCalledExactlyOnceWith(
          { ...locator, personalization: { profileId: 'visitor', events: [] } },
          resolveOptions
        );
        expect(onEventBlocked).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'consent', method: 'track' })
        );
      });

      it('rejects an in-flight result after reset() without storing its profile', async () => {
        const runtime = createRuntime();
        const pending = deferred<object>();
        const fetch = vi
          .spyOn(RuntimeContentfulExperiences.prototype, method)
          .mockReturnValue(pending.promise as never);

        const request = fetchIt(runtime);
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        runtime.reset();
        pending.resolve({ nodes: [], personalization: { profile: profileFixture('stale') } });
        await expect(request).rejects.toThrow('Experiences fetch was superseded');

        expect(runtime.states.profile.current).toBeUndefined();
      });

      it('rejects once the SDK has been destroyed', async () => {
        const runtime = createRuntime();
        const fetch = spyOnBase();
        runtime.destroy();

        await expect(fetchIt(runtime)).rejects.toThrow('Experiences SDK has been destroyed');
        expect(fetch).not.toHaveBeenCalled();
      });
    }
  );
});

describe('fetch-intent', () => {
  const payloadRuntime = RuntimeExperiences.prototype as unknown as {
    fetchExperiencePayload(
      options: BuiltRuntimeFetchExperienceOptions,
      resolve: RuntimeFetchResolveOptions
    ): Promise<ExperiencePayload>;
  };

  const resolve = { config: { components: {} } };

  let sdk: ContentfulExperiences;

  beforeEach(() => {
    seedConsent({ events: true, persistence: true });
    vi.spyOn(payloadRuntime, 'fetchExperiencePayload').mockResolvedValue({
      nodes: [],
      extensions: { personalization: { profile: completeProfile('evaluated-profile') } },
    });
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue({
      profile: completeProfile('evaluated-profile'),
    } as never);
    sdk = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      locale: 'de-DE',
      delivery: { accessToken: 'token' },
    });
  });

  afterEach(() => {
    sdk.destroy();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearIdentityCookies();
  });

  describe('ordinary Web fetch intent without a handoff', () => {
    it.each(['identify', 'track', 'page'] as const)(
      'builds %s arguments once and evaluates through XDA without extra commitment',
      async (type) => {
        const method =
          type === 'identify' ? 'buildIdentify' : type === 'track' ? 'buildTrack' : 'buildPageView';
        const build = vi.spyOn(sdk.eventBuilder, method);
        const event =
          type === 'identify'
            ? { type, userId: 'visitor' }
            : type === 'track'
              ? { type, event: 'action' }
              : { type, properties: { title: 'Current' } };
        const options: RuntimeFetchExperienceOptions = {
          experienceId: 'experience',
          personalization: { events: [event] },
        };
        const original = JSON.parse(JSON.stringify(options));
        const hook = vi.fn((event) => ({
          ...event,
          context: { ...event.context, userAgent: 'enriched' },
        }));
        sdk.interceptors.event.add(hook);
        const published = vi.fn();
        const subscription = sdk.states.eventStream.subscribe((event) => {
          if (event) published(event);
        });

        const plan = await sdk.fetchExperience(options, resolve);
        const evaluated = vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[0]![0]
          .personalization!.events!;
        expect(evaluated).toMatchObject([
          { type, messageId: expect.any(String), context: { userAgent: 'enriched' } },
        ]);
        expect(evaluated).toHaveLength(1);
        expect(plan.personalization?.profile?.id).toBe('evaluated-profile');
        expect(build).toHaveBeenCalledOnce();
        expect(hook).toHaveBeenCalledOnce();
        expect(published).toHaveBeenCalledExactlyOnceWith(evaluated[0]);
        expect(options).toEqual(original);

        await sdk.fetchExperience({ experienceId: options.experienceId }, resolve);
        expect(
          vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[1]?.[0].personalization
            ?.events
        ).toBeUndefined();
        expect(build).toHaveBeenCalledOnce();
        expect(hook).toHaveBeenCalledOnce();
        expect(published).toHaveBeenCalledOnce();
        await sdk.flush();
        expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
        subscription.unsubscribe();
      }
    );

    it('keeps ordinary XDA metadata that is wider than prepared replay without rebuilding raw events', async () => {
      const event = sdk.eventBuilder.buildPageView();
      const raw = {
        ...event,
        context: {
          ...event.context,
          page: { ...event.context.page, query: { filter: ['first', 'second'] } },
        },
      };
      const original = JSON.parse(JSON.stringify(raw));
      const build = vi.spyOn(sdk.eventBuilder, 'buildPageView');
      await sdk.fetchExperience(
        { experienceId: 'experience', personalization: { events: [raw] } },
        resolve
      );
      expect(
        vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[0]?.[0].personalization
          ?.events?.[0]
      ).toEqual(raw);
      expect(raw).toEqual(original);
      expect(build).not.toHaveBeenCalled();
      expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
    });

    it('gates arguments before construction without adding a page when all intent is blocked', async () => {
      sdk.consent({ events: false });
      const build = vi.spyOn(sdk.eventBuilder, 'buildTrack');
      await sdk.fetchExperience(
        {
          experienceId: 'experience',
          personalization: { events: [{ type: 'track', event: 'blocked' }] },
        },
        resolve
      );
      expect(
        vi.mocked(payloadRuntime.fetchExperiencePayload).mock.calls[0]?.[0].personalization?.events
      ).toEqual([]);
      expect(build).not.toHaveBeenCalled();
      expect(ExperienceApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
    });
  });
});

describe('browser owner wiring', () => {
  const { create: createRuntime, destroy: destroyRuntimes } = createWebHarness(
    { locale: 'en-US' },
    ContentfulExperiences
  );

  // A returning visitor who has already opted in to events and persistence.
  beforeEach(() => {
    seedConsent({ events: true, persistence: true });
  });

  afterEach(() => {
    destroyRuntimes();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearIdentityCookies();
    window.history.replaceState({}, '', '/');
    document.title = '';
  });

  describe('personalized content and freshness', () => {
    it('rejects content superseded by independent profile hydration while permitting its own intercepted adoption', async () => {
      let finish!: (plan: unknown) => void;
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finish = resolve;
          }) as never
        );
      const runtime = createRuntime({ defaults: { profile: completeProfile('first') } });
      const pending = runtime.fetchExperience(
        { experienceId: 'old' },
        { config: { components: {} } }
      );
      const rejected = expect(pending).rejects.toThrow('identity was superseded');
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      await hydrateOptimizationData(runtime, { profile: completeProfile('replacement') });
      finish({ nodes: [], personalization: { profile: completeProfile('first') } });
      await rejected;
      expect(runtime.states.profile.current?.id).toBe('replacement');

      runtime.interceptors.state.add(() => ({ profile: completeProfile('intercepted') }));
      fetch.mockResolvedValueOnce({
        nodes: [],
        personalization: { profile: completeProfile('selected') },
      } as never);
      await expect(
        runtime.fetchExperience({ experienceId: 'current' }, { config: { components: {} } })
      ).resolves.toMatchObject({ personalization: { profile: completeProfile('selected') } });
      expect(runtime.states.profile.current?.id).toBe('intercepted');
    });

    it.each(['reset', 'withdraw', 'destroy'] as const)(
      'rejects selected content completing after %s instead of returning it to a managed view',
      async (transition) => {
        let finish!: (plan: unknown) => void;
        const transport = vi
          .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
          .mockReturnValue(
            new Promise((resolve) => {
              finish = resolve;
            }) as never
          );
        const runtime = createRuntime();
        const pending = runtime.fetchExperience(
          { experienceId: 'old-visitor' },
          {
            config: { components: {} },
          }
        );
        const rejected = expect(pending).rejects.toThrow(/superseded|destroyed/);
        await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
        if (transition === 'withdraw') runtime.consent({ events: false });
        else runtime[transition]();
        finish({ nodes: [], personalization: { profileId: 'obsolete-profile' } });
        await rejected;
        expect(runtime.states.profile.current).toBeUndefined();
      }
    );

    it('forwards changed parameters and preview flags without retaining fetch values', async () => {
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const runtime = createRuntime({ defaults: { consent: false } });
      const parameters = { featuredPosts: { limit: 6, order: '-fields.title' } };
      await runtime.fetchExperience(
        { experienceId: 'exp', parameters },
        { config: { components: {} } }
      );
      await runtime.fetchExperience(
        { experienceId: 'exp', parameters: { featuredPosts: { limit: 12 } }, preview: true },
        { config: { components: {} } }
      );
      await runtime.fetchExperience({ experienceId: 'exp' }, { config: { components: {} } });
      expect(fetch.mock.calls.map(([options]) => options.parameters)).toEqual([
        parameters,
        { featuredPosts: { limit: 12 } },
        undefined,
      ]);
      expect(fetch.mock.calls[1]?.[0].preview).toBe(true);
    });

    it('uses mutable defaults while forwarding each per-call locale and resolver config', async () => {
      const runtime = createRuntime();
      const defaultResolveOptions = { config: { components: {} } };
      const frenchResolveOptions = { config: { components: {}, experienceTemplates: {} } };
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const setApiLocale = vi.spyOn(runtime.api.experience, 'setLocale');

      runtime.setLocale('de-DE');
      expect(setApiLocale).toHaveBeenCalledExactlyOnceWith('de-DE');
      expect(runtime.locale).toBe('de-DE');
      expect(runtime.eventBuilder.buildTrack({ event: 'locale' }).context.locale).toBe('de-DE');

      await runtime.fetchExperience({ experienceId: 'default' }, defaultResolveOptions);
      await runtime.fetchExperience(
        { experienceId: 'per-call', locale: 'fr-FR' },
        frenchResolveOptions
      );

      expect(fetch).toHaveBeenNthCalledWith(
        1,
        { experienceId: 'default', extensions: { sourceMap: {} } },
        defaultResolveOptions
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        {
          experienceId: 'per-call',
          locale: 'fr-FR',
          extensions: { sourceMap: {} },
        },
        frenchResolveOptions
      );
    });

    it('forwards personalization with Web event context', async () => {
      const runtime = createRuntime();
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const page = runtime.eventBuilder.buildPageView();
      const personalization = {
        profileId: 'profile-1',
        events: [page],
      };

      await runtime.fetchExperience(
        { experienceId: 'personalized', personalization },
        { config: { components: {} } }
      );

      expect(page.channel).toBe('web');
      expect(fetch).toHaveBeenCalledWith(
        {
          experienceId: 'personalized',
          extensions: { sourceMap: {} },
          personalization,
        },
        { config: { components: {} } }
      );
    });

    it('forwards per-call preview to the runtime', async () => {
      const options: Parameters<ContentfulExperiences['fetchExperience']>[0] = {
        experienceId: 'experience',
        preview: true,
      };

      const runtime = createRuntime({ preview: { accessToken: 'preview-token' } });
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);

      await runtime.fetchExperience(options, { config: { components: {} } });

      expect(fetch).toHaveBeenCalledWith(
        { ...options, extensions: { sourceMap: {} } },
        { config: { components: {} } }
      );
    });

    it('drops caller-built fetchExperience events that consent does not admit', async () => {
      const onEventBlocked = vi.fn();
      const runtime = createRuntime({ onEventBlocked });
      runtime.consent({ events: true });
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const page = runtime.eventBuilder.buildPageView();
      const track = runtime.eventBuilder.buildTrack({ event: 'purchase' });
      const original = globalThis.structuredClone([page, track]);
      runtime.consent({ events: false });

      await runtime.fetchExperience(
        {
          experienceId: 'personalized',
          personalization: { profileId: 'profile-1', events: [page, track] },
        },
        { config: { components: {} } }
      );

      expect(fetch).toHaveBeenCalledWith(
        {
          experienceId: 'personalized',
          extensions: { sourceMap: {} },
          personalization: {
            profileId: 'profile-1',
            events: [{ ...page, context: { ...page.context, gdpr: { isConsentGiven: false } } }],
          },
        },
        { config: { components: {} } }
      );
      expect(onEventBlocked).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'consent', method: 'track' })
      );
      expect(runtime.states.eventStream.current).toMatchObject({
        context: { gdpr: { isConsentGiven: false } },
      });
      expect([page, track]).toEqual(original);
      expect(page.context.gdpr?.isConsentGiven).toBe(true);
    });

    it('forwards every caller-built event once event consent is granted', async () => {
      window.localStorage.clear();
      const runtime = createRuntime();
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue({ nodes: [] } as never);
      const track = runtime.eventBuilder.buildTrack({ event: 'purchase' });
      const original = globalThis.structuredClone(track);
      runtime.consent({ events: true });

      await runtime.fetchExperience(
        {
          experienceId: 'personalized',
          personalization: { events: [track] },
        },
        { config: { components: {} } }
      );
      expect(track).toEqual(original);
      expect(track.context.gdpr?.isConsentGiven).toBe(false);

      expect(fetch).toHaveBeenCalledWith(
        {
          experienceId: 'personalized',
          extensions: { sourceMap: {} },
          personalization: {
            events: [{ ...track, context: { ...track.context, gdpr: { isConsentGiven: true } } }],
          },
        },
        { config: { components: {} } }
      );
    });
  });
});

/** These paths share identity forwarding, while by-ID alone requests source maps and restores persistence. */
describe.each([
  ['fetchExperience', { experienceId: 'personalized' }],
  ['fetchByDestinationNode', { destinationId: 'dest', nodeId: 'node' }],
  ['fetchByDestinationPath', { destinationId: 'dest', path: '/page' }],
] as const)('%s profile forwarding', (method, locator) => {
  const { create, destroy } = createWebHarness({}, ContentfulExperiences);
  afterEach(() => {
    destroy();
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearIdentityCookies();
  });
  it.each(['held', 'explicit'] as const)(
    'forwards the %s profile without replacing browser continuity',
    async (source) => {
      const byId = method === 'fetchExperience';
      seedConsent({ events: byId, persistence: byId });
      const profile = byId
        ? completeProfile(source === 'held' ? 'stored-profile' : 'browser-profile', {
            traits: { plan: 'pro' },
            ...(source === 'held' ? { audiences: ['developers'] } : {}),
          })
        : profileFixture('visitor');
      const restore = byId && source === 'held';
      if (restore) window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
      const runtime = create({
        ...(byId ? { locale: 'en-US' } : {}),
        ...(restore ? {} : { defaults: { profile, ...(byId ? {} : { consent: false }) } }),
      });
      const fetch = vi
        .spyOn(RuntimeContentfulExperiences.prototype, method)
        .mockResolvedValue({ nodes: [] } as never);
      const profileId = source === 'held' ? profile.id : byId ? 'explicit-profile' : 'explicit';
      const resolve = { config: { components: {} } };
      const options = {
        ...locator,
        ...(source === 'explicit' ? { personalization: { profileId } } : {}),
      };
      await runtime[method](options as never, resolve);
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        {
          ...locator,
          ...(byId ? { extensions: { sourceMap: {} } } : {}),
          personalization: { profileId },
        },
        resolve
      );
      expect(runtime.states.profile.current).toEqual(profile);
      if (byId && source === 'explicit')
        expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(profile);
    }
  );
});
