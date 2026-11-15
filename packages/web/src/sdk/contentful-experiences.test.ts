import {
  InsightsApiClient as AnalyticsApiClient,
  ExperienceApiClient as PersonalizationApiClient,
} from '@contentful/optimization-api-client';
import { effect } from '@preact/signals-core';
import { setCookie } from '../browser/cookies.js';
import type { Subscription } from '../signals/Observable.js';
import * as signals from '../signals/signals.js';
import { deferred, setDocumentVisibility } from '../test/dom.js';

import { afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { ContentfulExperiences } from '../sdk/contentful-experiences.js';
import { clearIdentityCookies, seedConsent } from '../test/consent.js';
import { completeProfile } from '../test/fixtures/profile.js';
import { createRuntimeConfig, createRuntimeFactory } from '../test/runtime-config.js';

import {
  ANONYMOUS_ID_COOKIE,
  ANONYMOUS_ID_COOKIE_LEGACY,
  ANONYMOUS_ID_KEY,
  CONSENT_CACHE_KEY,
  EventBuilder,
  PERSISTENCE_CONSENT_CACHE_KEY,
  PROFILE_CACHE_KEY,
  ContentfulExperiences as RuntimeContentfulExperiences,
  type ExperiencesHandoff,
  type OptimizationEventStreamEvent,
  type PreviewClient,
  type EventProfile as RuntimeEventProfile,
} from '@contentful/experiences-runtime';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from '../sdk-info.js';

declare module 'vitest' {
  export interface ProvidedContext {
    webTestEnvironment: 'browser' | 'node';
  }
}

const environment = inject('webTestEnvironment');

describe.runIf(environment === 'browser')('Web SDK in a browser', () => {
  const runtimes = new Set<ContentfulExperiences>();
  const subscriptions: Subscription[] = [];
  const effects: (() => void)[] = [];
  const createRuntime = createRuntimeFactory(runtimes, ContentfulExperiences, () =>
    createRuntimeConfig()
  );
  beforeEach(() => seedConsent({ events: true, persistence: true }));
  afterEach(() => {
    for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
    for (const dispose of effects.splice(0)) dispose();
    for (const runtime of runtimes) runtime.destroy();
    runtimes.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    clearIdentityCookies();
    window.history.replaceState({}, '', '/');
    document.title = '';
  });

  it('wires live browser context and Web attribution into its event builder', () => {
    window.history.replaceState({}, '', '/first?tag=one&tag=two#details');
    document.title = 'First page';
    const runtime = createRuntime({ app: { name: 'storefront', version: '1.2.3' } });
    const first = runtime.eventBuilder.buildTrack({ event: 'first' });
    window.history.replaceState({}, '', '/second#top');
    document.title = 'Second page';
    const second = runtime.eventBuilder.buildPageView();
    expect(runtime.eventBuilder.channel).toBe('web');
    expect(first.context).toMatchObject({
      app: { name: 'storefront', version: '1.2.3' },
      library: DEFAULT_EVENT_CONTEXT_LIBRARY,
      page: { path: '/first', query: { tag: ['one', 'two'] }, hash: '#details' },
    });
    expect(second.context.page).toMatchObject({
      path: '/second',
      title: 'Second page',
      hash: '#top',
    });
    expect(second.properties.title).toBe('Second page');
  });

  it('allows browser context providers to redact page and user-agent data', () => {
    document.title = 'Private inbox';
    const runtime = createRuntime({
      browserContext: {
        getPageProperties: () => ({
          path: '/redacted',
          query: {},
          referrer: '',
          search: '',
          title: 'Redacted',
          url: 'https://example.test/redacted',
        }),
        getUserAgent: () => 'redacted-agent',
      },
    });

    expect(runtime.eventBuilder.buildTrack({ event: 'redaction' }).context).toMatchObject({
      page: { path: '/redacted', title: 'Redacted', url: 'https://example.test/redacted' },
      userAgent: 'redacted-agent',
    });
    expect(runtime.eventBuilder.buildPageView()).toMatchObject({
      context: { page: { title: 'Redacted' } },
      properties: { title: 'Redacted' },
    });
  });

  it('requests attribution only while an automatic interaction is enabled', async () => {
    const runtime = createRuntime({
      autoTrackEntryInteraction: { clicks: false, views: false, hovers: false },
    });
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);
    const resolveOptions = { config: { components: {} } };
    const options = { experienceId: 'controlled' };

    await runtime.fetchExperience(options, resolveOptions);
    runtime.tracking.enable('clicks');
    await runtime.fetchExperience(options, resolveOptions);
    runtime.tracking.disable('clicks');
    await runtime.fetchExperience(options, resolveOptions);

    expect(fetch).toHaveBeenNthCalledWith(1, options, resolveOptions);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      { ...options, extensions: { sourceMap: {} } },
      resolveOptions
    );
    expect(fetch).toHaveBeenNthCalledWith(3, options, resolveOptions);
    expect(options).toEqual({ experienceId: 'controlled' });
  });

  it('restores the persisted profile and passes its id to fetchExperience', async () => {
    const storedProfile = completeProfile('stored-profile', {
      audiences: ['developers'],
      traits: { plan: 'pro' },
    });
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(storedProfile));
    const runtime = createRuntime();
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);

    await runtime.fetchExperience({ experienceId: 'personalized' }, { config: { components: {} } });

    expect(runtime.states.profile.current).toEqual(storedProfile);
    expect(fetch).toHaveBeenCalledWith(
      {
        experienceId: 'personalized',
        extensions: { sourceMap: {} },
        personalization: { profileId: 'stored-profile' },
      },
      { config: { components: {} } }
    );
  });

  it('continues when LocalStorage is unavailable', () => {
    vi.spyOn(window.Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    const runtime = createRuntime({ defaults: { profile: completeProfile('browser-profile') } });

    expect(runtime.states.profile.current).toEqual(completeProfile('browser-profile'));
  });

  it('starts replacement locale state from its own configuration after destroy', () => {
    const english = createRuntime({ locale: 'en-US' });
    english.setLocale('de-DE');
    expect(english.eventBuilder.buildTrack({ event: 'english' }).context.locale).toBe('de-DE');
    english.destroy();

    const french = createRuntime({ locale: 'fr-FR' });
    expect(french.eventBuilder.buildTrack({ event: 'french' }).context.locale).toBe('fr-FR');
  });

  it('rejects a second live SDK and permits replacement after idempotent destroy', () => {
    const first = createRuntime();

    expect(() => createRuntime()).toThrow();
    first.destroy();
    first.destroy();

    expect(() => createRuntime()).not.toThrow();
  });

  it('releases Web ownership when construction fails and does not lock the Runtime base', () => {
    expect(
      () =>
        new ContentfulExperiences({
          spaceId: 'space',
          environmentId: 'environment',
          delivery: {} as never,
        })
    ).toThrow('requires accessToken unless an explicit proxy host is provided');

    const web = createRuntime();
    const base = new RuntimeContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      delivery: { accessToken: 'delivery-token' },
      eventBuilder: { channel: 'server' },
    });
    expect(base.spaceId).toBe(web.spaceId);
    base.destroy();
  });

  it('releases Web ownership when leaf initialization fails', () => {
    const addListener = vi.spyOn(window, 'addEventListener').mockImplementationOnce(() => {
      throw new Error('listener setup failed');
    });
    expect(() => createRuntime()).toThrow('listener setup failed');
    addListener.mockRestore();

    expect(() => createRuntime()).not.toThrow();
  });

  it('uses ordinary fetching when preview has no URL session', async () => {
    const options: Parameters<ContentfulExperiences['fetchExperience']>[0] = {
      experienceId: 'experience',
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

  it('treats a boolean as both axes and an object as independent axes', () => {
    const runtime = createRuntime();

    runtime.consent(true);
    expect({
      events: runtime.states.consent.current,
      persistence: runtime.states.persistenceConsent.current,
    }).toEqual({ events: true, persistence: true });

    runtime.consent({ persistence: false });
    expect({
      events: runtime.states.consent.current,
      persistence: runtime.states.persistenceConsent.current,
    }).toEqual({ events: true, persistence: false });

    runtime.consent(false);
    expect({
      events: runtime.states.consent.current,
      persistence: runtime.states.persistenceConsent.current,
    }).toEqual({ events: false, persistence: false });
  });

  it('applies configured defaults over a stored decision, as the Optimization SDK does', () => {
    seedConsent({ events: false, persistence: false });

    const runtime = createRuntime({ defaults: { consent: true, persistenceConsent: true } });

    expect({
      events: runtime.states.consent.current,
      persistence: runtime.states.persistenceConsent.current,
    }).toEqual({ events: true, persistence: true });
  });

  it('uses defaults.consent as the persistence default', () => {
    const runtime = createRuntime({ defaults: { consent: true } });

    expect({
      events: runtime.states.consent.current,
      persistence: runtime.states.persistenceConsent.current,
    }).toEqual({ events: true, persistence: true });
  });

  it('rejects selected content completing after consent withdrawal instead of returning it to a managed view', async () => {
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
    runtime.consent({ events: false });
    finish({ nodes: [], personalization: { profileId: 'obsolete-profile' } });
    await rejected;
    expect(runtime.states.profile.current).toBeUndefined();
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

  function recordWrites() {
    const cookieWrites: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    const jar = document.cookie;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => jar,
      set: (value: string) => {
        cookieWrites.push(value);
      },
    });
    return {
      cookieWrites,
      restore: () => {
        Reflect.deleteProperty(document, 'cookie');
        Object.defineProperty(Document.prototype, 'cookie', descriptor);
      },
    };
  }

  it('reconciles the cookie before persisting the profile, then restores the captured cookie as Optimization does', () => {
    seedConsent({ events: true, persistence: true });
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(completeProfile('old-visitor')));
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');
    const { cookieWrites, restore } = recordWrites();

    const runtime = createRuntime();
    restore();

    expect(runtime.states.profile.current).toBeUndefined();
    const identityWrites = cookieWrites
      .map((write) => write.split(';')[0] ?? '')
      .filter((write) => write.startsWith('ctfl-opt-aid='));
    // Optimization registers its persistence-consent effect before its profile effect.
    // The conflicting profile is reset before it can be persisted; the profile effect
    // then synchronizes the incoming visitor's identity.
    expect(identityWrites).toEqual([
      'ctfl-opt-aid=',
      'ctfl-opt-aid=server-id',
      'ctfl-opt-aid=server-id',
    ]);
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('server-id');
  });

  it('refreshes the cookie once when it already matches the stored id and the profile, as Optimization does', () => {
    seedConsent({ events: true, persistence: true });
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(completeProfile('server-id')));
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'server-id');
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');
    const { cookieWrites, restore } = recordWrites();

    createRuntime();
    restore();

    // Reconciliation finds nothing to change; the profile synchronization then refreshes expiry.
    expect(cookieWrites.map((write) => write.split(';')[0])).toEqual(['ctfl-opt-aid=server-id']);
  });

  it('migrates a legacy cookie to the current one, then synchronizes the effective identity', () => {
    seedConsent({ events: true, persistence: true });
    setCookie(ANONYMOUS_ID_COOKIE_LEGACY, 'legacy-id');
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'legacy-id');
    const { cookieWrites, restore } = recordWrites();

    createRuntime();
    restore();

    const written = cookieWrites.filter((write) => write.startsWith('ctfl-opt-aid=legacy-id'));
    // Initial consent reconciliation, profile persistence, then the captured legacy cookie.
    expect(written).toHaveLength(3);
  });

  it('retries active flag exposure when repeated public denial invalidates allowlisted work', async () => {
    const sdk = createRuntime({
      defaults: {
        profile: completeProfile('visitor'),
        changes: [
          {
            type: 'Variable',
            key: 'banner',
            value: true,
            meta: { experienceId: 'experiment', variantIndex: 1 },
          },
        ],
        consent: false,
      },
      allowedEventTypes: ['flag'],
    });
    vi.spyOn(sdk.api.analytics, 'sendBatchEvents').mockResolvedValue(true);
    const pending = deferred<void>();
    const interceptor = vi.fn(async (event: OptimizationEventStreamEvent) => {
      await pending.promise;
      return event;
    });
    sdk.interceptors.event.add(interceptor);
    const subscription = sdk.states.flag('banner').subscribe(vi.fn());
    subscriptions.push(subscription);
    expect(interceptor).toHaveBeenCalledTimes(1);
    sdk.consent({ events: false });
    expect(interceptor).toHaveBeenCalledTimes(2);
    pending.resolve();
    await vi.waitFor(() =>
      expect(sdk.states.eventStream.current).toMatchObject({ type: 'component' })
    );
    const attempts = interceptor.mock.calls.length;
    sdk.getFlag('banner');
    await Promise.resolve();
    expect(interceptor).toHaveBeenCalledTimes(attempts);
  });

  describe('public browser transactions', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      setDocumentVisibility('visible');
      vi.spyOn(PersonalizationApiClient.prototype, 'upsertProfile').mockResolvedValue({
        profile: completeProfile('visitor'),
      } as never);
      vi.spyOn(AnalyticsApiClient.prototype, 'sendBatchEvents').mockResolvedValue(true);
    });

    it('completes event withdrawal even if deleting the identity cookie throws', async () => {
      const runtime = createRuntime({ defaults: { profile: completeProfile('visitor') } });
      window.dispatchEvent(new Event('offline'));
      await runtime.track({ event: 'queued' });
      await runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' });
      subscriptions.push(
        runtime.states.consent.subscribe((consent) => {
          if (consent === false) runtime.destroy();
        })
      );
      const error = new globalThis.DOMException('Cookie access denied', 'SecurityError');
      const cookieSetter = vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {
        throw error;
      });

      expect(() => runtime.consent(false)).toThrow('Cookie access denied');
      cookieSetter.mockRestore();
      await vi.advanceTimersByTimeAsync(0);
      expect(runtime.states.consent.current).toBe(false);
      expect(window.localStorage.getItem(CONSENT_CACHE_KEY)).toBe('denied');
      expect(window.localStorage.getItem(PERSISTENCE_CONSENT_CACHE_KEY)).toBe('denied');
      expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
      expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
      expect(AnalyticsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
    });

    describe.each(['events', 'both'] as const)('%s consent', (axes) => {
      it.each([
        ['consent', 'destroy'],
        ['consent', 'throw'],
        ['request state', 'destroy'],
        ['request state', 'throw'],
      ] as const)('purges both queues before a %s subscriber can %s', async (state, action) => {
        const runtime = createRuntime({
          defaults: {
            profile: completeProfile('visitor'),
            consent: true,
            persistenceConsent: axes === 'both',
          },
        });
        window.dispatchEvent(new Event('offline'));
        await expect(runtime.track({ event: 'queued' })).resolves.toEqual({ accepted: true });
        await runtime.trackClick({ entityId: 'hero', entityKind: 'Experience' });

        const error = new Error('withdrawal subscriber failed');
        let withdrawing = false;
        const subscriber = vi.fn(() => {
          if (!withdrawing) return;
          withdrawing = false; // destroy() can also publish request state.
          if (action === 'destroy') runtime.destroy();
          else throw error;
        });
        const observable =
          state === 'consent' ? runtime.states.consent : runtime.states.personalizationRequestState;
        const subscription = observable.subscribe(subscriber);
        subscriptions.push(subscription);

        withdrawing = true;
        if (action === 'throw') {
          expect(() => runtime.consent(axes === 'both' ? false : { events: false })).toThrow(error);
        } else {
          runtime.consent(axes === 'both' ? false : { events: false });
        }
        expect(subscriber.mock.calls.length).toBeGreaterThan(1);
        subscription.unsubscribe();
        expect(runtime.states.consent.current).toBe(false);
        expect(window.localStorage.getItem(CONSENT_CACHE_KEY)).toBe('denied');
        expect(window.localStorage.getItem(PERSISTENCE_CONSENT_CACHE_KEY)).toBe('denied');
        expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
        expect(document.cookie).toBe('');

        await runtime.flush();
        window.dispatchEvent(new Event('online'));
        await vi.advanceTimersByTimeAsync(0);
        runtime.consent({ events: true });
        await runtime.flush();
        await vi.advanceTimersByTimeAsync(30_000);
        runtime.destroy();
        await vi.advanceTimersByTimeAsync(0);

        expect(PersonalizationApiClient.prototype.upsertProfile).not.toHaveBeenCalled();
        expect(AnalyticsApiClient.prototype.sendBatchEvents).not.toHaveBeenCalled();
      });
    });

    it('resets profile, request and streams atomically while retaining locale and consent', async () => {
      const runtime = createRuntime({ defaults: { profile: completeProfile('visitor') } });
      runtime.setLocale('de-DE');
      await runtime.page();
      runtime.consent({ events: false });
      await runtime.track({ event: 'blocked' });
      const snapshots: unknown[] = [];
      effects.push(
        effect(() => {
          snapshots.push({
            profile: signals.profile.value,
            event: signals.event.value,
            blocked: signals.blockedEvent.value,
            request: signals.personalizationRequestState.value,
          });
        })
      );
      runtime.reset();
      expect(snapshots).toHaveLength(2);
      expect(snapshots.at(-1)).toEqual({
        profile: undefined,
        event: undefined,
        blocked: undefined,
        request: { status: 'idle' },
      });
      expect(runtime.states.locale.current).toBe('de-DE');
      expect(runtime.states.consent.current).toBe(false);
      expect(runtime.states.persistenceConsent.current).toBe(true);
      expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    });

    it('disposes old persistence effects and discards late requests when recreated', async () => {
      const response = deferred<{ profile: RuntimeEventProfile }>();
      vi.mocked(PersonalizationApiClient.prototype.upsertProfile).mockReturnValue(
        response.promise as never
      );
      const old = createRuntime({ defaults: { profile: completeProfile('visitor') } });
      const pending = old.page();
      await vi.waitFor(() =>
        expect(PersonalizationApiClient.prototype.upsertProfile).toHaveBeenCalled()
      );
      old.destroy();
      const replacementProfile = completeProfile('visitor', {
        traits: { generation: 'replacement' },
      });
      const replacement = createRuntime({ defaults: { profile: replacementProfile } });
      const stored = vi.spyOn(window.Storage.prototype, 'setItem');
      replacement.consent(false);
      replacement.consent(true);
      expect(stored.mock.calls.filter(([key]) => key === CONSENT_CACHE_KEY)).toHaveLength(2);
      response.resolve({ profile: completeProfile('late-old-response') });
      await pending;
      expect(replacement.states.profile.current).toEqual(replacementProfile);
      expect(replacement.states.personalizationRequestState.current).toEqual({ status: 'idle' });
      expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(
        replacementProfile
      );
    });

    it('leaves external observers caller-owned across destroy and recreation', () => {
      const old = createRuntime({ defaults: { profile: completeProfile('visitor') } });
      const locales = vi.fn();
      const subscription = old.states.locale.subscribe(locales);
      subscriptions.push(subscription);
      old.destroy();
      const replacement = createRuntime({ locale: 'de-DE' });
      expect(locales).toHaveBeenLastCalledWith('de-DE');
      subscription.unsubscribe();
      replacement.setLocale('fr-FR');
      expect(locales).toHaveBeenLastCalledWith('de-DE');
    });

    it('stops the rest of prepared publication when the first event observer replaces its owner', async () => {
      const old = createRuntime({ defaults: { profile: completeProfile('visitor') } });
      window.dispatchEvent(new Event('offline'));
      let replacement: ContentfulExperiences | undefined;
      const emitted: string[] = [];
      const subscription = old.states.eventStream.subscribe((event) => {
        if (event === undefined) return;
        emitted.push(event.type);
        subscription.unsubscribe();
        old.destroy();
        replacement = createRuntime({ defaults: { profile: completeProfile('visitor') } });
      });
      subscriptions.push(subscription);
      await old.hydrateAndTrackCurrentPage(preparedHandoff(), { routeKey: '/prepared' });
      await vi.advanceTimersByTimeAsync(0);
      expect(emitted).toEqual(['track']);
      expect(replacement).toBeDefined();
      expect(replacement!.states.eventStream.current).toBeUndefined();
    });

    it('drops an admitted aggregate on withdrawal and permits fresh page intent for the same route', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: undefined });
      const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);
      const handoff = {
        ...preparedHandoff(),
        replay: {
          routeKey: '/first',
          events: preparedHandoff().replay!.events.filter((event) => event.type === 'page'),
        },
      };

      // Admitted while offline, so the page sits in the queue and is not sent.
      window.dispatchEvent(new Event('offline'));
      await expect(
        runtime.hydrateAndTrackCurrentPage(handoff, { routeKey: '/first' })
      ).resolves.toEqual({ accepted: true });
      expect(upsert).not.toHaveBeenCalled();

      // Withdrawing discards the admitted batch permanently. The route remains
      // eligible for a fresh page after regrant; the old aggregate never replays.
      runtime.consent({ events: false });
      runtime.consent({ events: true });
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      expect(upsert).not.toHaveBeenCalled();

      const retry = await runtime.hydrateAndTrackCurrentPage(handoff, { routeKey: '/first' });

      expect(retry.accepted).toBe(true);
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      expect(upsert.mock.calls[0]?.[0].events.map((event) => event.type)).toEqual(['page']);
      expect(upsert.mock.calls[0]?.[0].events[0]?.messageId).not.toBe(
        handoff.replay?.events[0]?.messageId
      );
    });

    it('keeps an accepted route accepted when consent is only granted or persistence changes', async () => {
      seedConsent({ events: true, persistence: true });
      const runtime = createRuntime({ defaults: undefined });
      const upsert = vi.mocked(PersonalizationApiClient.prototype.upsertProfile);

      await runtime.hydrateAndTrackCurrentPage(
        {
          ...preparedHandoff(),
          replay: {
            routeKey: '/first',
            events: preparedHandoff().replay!.events.filter((event) => event.type === 'page'),
          },
        },
        {
          routeKey: '/first',
        }
      );
      await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      runtime.consent({ persistence: false });
      runtime.consent({ events: true });

      await runtime.trackCurrentPage({ routeKey: '/first', buildPayload: () => ({}) });

      // Already sent for this route; nothing is sent twice.
      expect(upsert).toHaveBeenCalledTimes(1);
    });

    function preparedHandoff(): ExperiencesHandoff {
      const builder = new EventBuilder({
        channel: 'server',
        library: { name: 'test', version: '1' },
        getConsent: () => true,
      });
      return {
        spaceId: 'space',
        environmentId: 'environment',
        profileId: 'visitor',
        cache: { scope: 'private-request' },
        replay: {
          routeKey: '/prepared',
          events: [builder.buildTrack({ event: 'prepared' }), builder.buildPageView()],
        },
      };
    }
  });

  function previewConnection() {
    window.history.replaceState(null, '', '?preview_session_id=session');
    const unsubscribe = vi.fn();
    const client: PreviewClient = {
      getResult: () => ({ data: undefined, error: undefined }),
      subscribe: () => unsubscribe,
      subscribeStatus: () => unsubscribe,
    };
    const createClient = vi.fn(() => client);
    const fetch = vi.fn(
      async () =>
        new globalThis.Response(
          JSON.stringify({ sys: { type: 'Experience', id: 'hero' }, nodes: [] })
        )
    );
    return {
      unsubscribe,
      createClient,
      config: { preview: { accessToken: 'preview', createClient, fetch } },
    };
  }
  it('keeps Preview policy and snapshots when live connection construction fails', async () => {
    const f = previewConnection();
    const createClient = vi.fn(() => {
      throw new Error('client unavailable');
    });
    const sdk = createRuntime({
      environmentId: 'master',
      preview: { ...f.config.preview, createClient },
    });
    expect(sdk.isPreview).toBe(true);
    await expect(sdk.page()).resolves.toMatchObject({ accepted: false, reason: 'preview' });
    await expect(
      sdk.fetchExperience({ experienceId: 'hero' }, { config: { components: {} } })
    ).resolves.toMatchObject({ experienceId: 'hero', nodes: [] });
    await vi.waitFor(() =>
      expect(sdk.states.preview.current?.error?.message).toBe('client unavailable')
    );
    expect(createClient).toHaveBeenCalledOnce();
  });
  it('closes the one Preview connection and releases ownership even when tracking teardown throws', async () => {
    const f = previewConnection();
    const sdk = createRuntime({ environmentId: 'master', ...f.config });
    await vi.waitFor(() => expect(f.createClient).toHaveBeenCalledOnce());
    vi.spyOn(MutationObserver.prototype, 'disconnect').mockImplementationOnce(() => {
      throw new Error('tracking teardown failed');
    });
    expect(() => sdk.destroy()).toThrow('tracking teardown failed');
    expect(f.unsubscribe).toHaveBeenCalledTimes(2);
    expect(sdk.states.preview.current).toBeUndefined();
    expect(() => createRuntime()).not.toThrow();
  });
});

describe.runIf(environment === 'node')('Web SDK in Node', () => {
  let runtime: ContentfulExperiences | undefined;
  afterEach(() => {
    runtime?.destroy();
    runtime = undefined;
    vi.restoreAllMocks();
  });

  it('imports the public entry without browser work', async () => {
    vi.resetModules();
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    const fetch = vi.spyOn(globalThis, 'fetch');
    const web = await import('../index.js');
    expect(typeof web.ContentfulExperiences).toBe('function');
    expect(fetch).not.toHaveBeenCalled();
  });

  describe('live state without browser persistence', () => {
    it('retains live profile state when browser persistence is unavailable', async () => {
      const { ContentfulExperiences } = await import('../index.js');
      runtime = new ContentfulExperiences({
        spaceId: 'space',
        environmentId: 'environment',
        delivery: { accessToken: 'delivery-token' },
        defaults: { profile: completeProfile('server-render-profile') },
      });

      expect(runtime.states.profile.current).toEqual(completeProfile('server-render-profile'));

      runtime.reset();
      expect(runtime.states.profile.current).toBeUndefined();
    });
  });

  describe('Web interaction tracking on the server', () => {
    it('automatically initializes and accepts tracking controls without a DOM', async () => {
      const { ContentfulExperiences } = await import('../index.js');
      runtime = new ContentfulExperiences({
        spaceId: 'space',
        environmentId: 'environment',
        delivery: { accessToken: 'delivery-token' },
      });

      expect(() => {
        runtime!.tracking.disable('views');
        runtime!.tracking.enable('views');
        runtime!.reset();
        runtime!.destroy();
      }).not.toThrow();
    });
  });

  describe('Session preview without browser globals', () => {
    it('keeps ordinary policy when no browser URL session is available', async () => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      const { ContentfulExperiences } = await import('../index.js');
      runtime = new ContentfulExperiences({
        spaceId: 'space',
        environmentId: 'environment',
        delivery: { accessToken: 'delivery-token' },
        preview: { accessToken: 'preview-token' },
        defaults: { consent: true },
      });
      expect(runtime.isPreview).toBe(false);
      expect(runtime.states.preview.current).toBeUndefined();
      runtime.destroy();
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
