// @vitest-environment jsdom

import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  PROFILE_CACHE_KEY,
  type EventProfile,
} from '@contentful/experiences-runtime';
import { serializePersonalization } from '@contentful/experiences-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences, type ExperiencesWebConfig } from './contentful-experiences.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';
import { seedConsent, clearIdentityCookies } from './test-fixtures/consent.js';

const runtimes = new Set<ContentfulExperiences>();

function createRuntime(overrides: Partial<ExperiencesWebConfig> = {}): ContentfulExperiences {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    ...overrides,
  } as ExperiencesWebConfig);
  runtimes.add(runtime);
  return runtime;
}

function mockOptimization(
  runtime: ContentfulExperiences,
  profile: EventProfile = { id: 'updated-profile' }
) {
  return {
    upsertProfile: vi
      .spyOn(runtime.api.experience, 'upsertProfile')
      .mockResolvedValue({ profile } as never),
    sendBatchEvents: vi.spyOn(runtime.api.insights, 'sendBatchEvents').mockResolvedValue(true),
  };
}

// A returning visitor who has already opted in to events and persistence.
beforeEach(() => {
  seedConsent({ events: true, persistence: true });
});

afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearIdentityCookies();
  window.history.replaceState({}, '', '/');
  document.title = '';
});

describe('Web ContentfulExperiences', () => {
  it('uses live browser context and Web attribution', () => {
    window.history.replaceState({}, '', '/first?utm_source=search&tag=one&tag=two#details');
    document.title = 'First page';
    const runtime = createRuntime({ app: { name: 'storefront', version: '1.2.3' } });
    expect(runtime.config.app).toEqual({ name: 'storefront', version: '1.2.3' });
    expect(runtime.config.locale).toBe('en-US');

    const first = runtime.eventBuilder.buildTrack({ event: 'first' });
    window.history.replaceState({}, '', '/second?campaign=spring#top');
    document.title = 'Second page';
    const second = runtime.eventBuilder.buildTrack({ event: 'second' });

    expect(runtime.eventBuilder.channel).toBe('web');
    expect(first.context).toMatchObject({
      app: { name: 'storefront', version: '1.2.3' },
      library: DEFAULT_EVENT_CONTEXT_LIBRARY,
      userAgent: window.navigator.userAgent,
      page: {
        path: '/first',
        query: { utm_source: 'search', tag: 'two' },
        search: '?utm_source=search&tag=one&tag=two',
        hash: '#details',
        title: 'First page',
        width: window.innerWidth,
        height: window.innerHeight,
      },
    });
    expect(second.context.page).toMatchObject({
      path: '/second',
      query: { campaign: 'spring' },
      hash: '#top',
      title: 'Second page',
    });
    expect(second.context.campaign).toEqual({});
  });

  it('allows browser context providers to redact page and user-agent data', () => {
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
      page: { path: '/redacted', url: 'https://example.test/redacted' },
      userAgent: 'redacted-agent',
    });
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

    expect(fetch).toHaveBeenNthCalledWith(1, { experienceId: 'default' }, defaultResolveOptions);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      {
        experienceId: 'per-call',
        locale: 'fr-FR',
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
      { experienceId: 'personalized', personalization: serializePersonalization(personalization) },
      { config: { components: {} } }
    );

    expect(page.channel).toBe('web');
    expect(fetch).toHaveBeenCalledWith(
      { experienceId: 'personalized', personalization: serializePersonalization(personalization) },
      { config: { components: {} } }
    );
  });

  it('restores the persisted profile and passes its id to fetchExperience', async () => {
    const storedProfile = {
      id: 'stored-profile',
      audiences: ['developers'],
      traits: { plan: 'pro' },
    };
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
        personalization: { profileId: 'stored-profile' },
      },
      { config: { components: {} } }
    );
  });

  it('persists the profile and preserves an explicit fetchExperience profile id', async () => {
    const profile = { id: 'browser-profile', traits: { plan: 'pro' } };
    const runtime = createRuntime({ defaults: { profile } });
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);

    await runtime.fetchExperience(
      {
        experienceId: 'personalized',
        personalization: { profileId: 'explicit-profile' },
      },
      { config: { components: {} } }
    );

    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(profile);
    expect(fetch).toHaveBeenCalledWith(
      {
        experienceId: 'personalized',
        personalization: { profileId: 'explicit-profile' },
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

    const runtime = createRuntime({ defaults: { profile: { id: 'browser-profile' } } });

    expect(runtime.states.profile.current).toEqual({ id: 'browser-profile' });
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

    expect(fetch).toHaveBeenCalledWith(options, { config: { components: {} } });
  });

  it('updates and persists the complete profile from Personalization events', async () => {
    const runtime = createRuntime({
      defaults: { profile: { id: 'initial-profile' } },
    });
    const updatedProfile = { id: 'updated-profile', traits: { plan: 'pro' } };
    const optimization = mockOptimization(runtime, updatedProfile);

    const track = runtime.track({ event: 'started' });
    await track;
    expect(optimization.upsertProfile).toHaveBeenCalledOnce();

    expect(optimization.upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'initial-profile' }),
      { locale: 'en-US' }
    );
    expect(runtime.states.profile.current).toEqual(updatedProfile);
    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(updatedProfile);
  });

  it('warns and drops an Analytics event without a profile, as Optimization does', async () => {
    const runtime = createRuntime();
    const optimization = mockOptimization(runtime);

    await expect(
      runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' })
    ).resolves.toBeUndefined();
    await runtime.flush();

    expect(optimization.sendBatchEvents).not.toHaveBeenCalled();
  });

  it('drops an Analytics call made while the initial profile request is still pending', async () => {
    const runtime = createRuntime();
    let respond!: (value: { profile: EventProfile }) => void;
    const optimization = mockOptimization(runtime);
    optimization.upsertProfile.mockReturnValueOnce(
      new Promise((resolve) => {
        respond = resolve;
      }) as never
    );

    const pending = runtime.page();
    // A new visitor has no identity yet: the call resolves instead of rejecting, and sends nothing.
    await expect(
      runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' })
    ).resolves.toBeUndefined();

    respond({ profile: { id: 'issued-profile' } });
    await pending;
    await runtime.flush();
    expect(optimization.sendBatchEvents).not.toHaveBeenCalled();

    // Once the profile exists, tracking queues and sends as usual.
    await runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' });
    await runtime.flush();
    expect(optimization.sendBatchEvents).toHaveBeenCalledWith([
      expect.objectContaining({ profile: { id: 'issued-profile' } }),
    ]);
  });

  it('resets the profile before establishing a new one', async () => {
    const runtime = createRuntime({
      defaults: { profile: { id: 'first-profile' } },
    });
    const optimization = mockOptimization(runtime);

    runtime.reset();
    await expect(
      runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' })
    ).resolves.toBeUndefined();
    await runtime.flush();
    expect(optimization.sendBatchEvents).not.toHaveBeenCalled();

    await runtime.page();
    await runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' });
    await runtime.flush();

    expect(optimization.sendBatchEvents).toHaveBeenCalledWith([
      expect.objectContaining({ profile: { id: 'updated-profile' } }),
    ]);
  });

  it('does not restore a prior profile from an in-flight Personalization response', async () => {
    let resolveResponse!: (value: { profile: { id: string } }) => void;
    const response = new Promise<{ profile: { id: string } }>((resolve) => {
      resolveResponse = resolve;
    });
    const runtime = createRuntime({
      defaults: { profile: { id: 'first-profile' } },
    });
    const optimization = mockOptimization(runtime);
    optimization.upsertProfile.mockReturnValueOnce(response as never);

    const pending = runtime.track({ event: 'started-before-session-change' });
    await vi.waitFor(() => expect(optimization.upsertProfile).toHaveBeenCalledOnce());
    runtime.reset();
    await runtime.page();
    resolveResponse({ profile: { id: 'first-profile-from-api' } });

    await pending;
    expect(runtime.states.profile.current).toEqual({ id: 'updated-profile' });
  });

  it('uses the SDK locale for ordinary Personalization independently of event overrides', async () => {
    const runtime = createRuntime({ locale: 'en-US' });
    const { upsertProfile } = mockOptimization(runtime);
    await runtime.identify({ userId: 'visitor', locale: 'fr-FR' });
    expect(upsertProfile.mock.calls[0]?.[0].events[0]?.context.locale).toBe('fr-FR');
    expect(upsertProfile.mock.calls[0]?.[1]).toEqual({ locale: 'en-US' });

    window.dispatchEvent(new Event('offline'));
    await runtime.track({ event: 'queued', locale: 'it-IT' });
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    runtime.setLocale('de-DE');
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(upsertProfile).toHaveBeenCalledTimes(2));
    expect(upsertProfile.mock.calls[1]?.[0].events[0]?.context.locale).toBe('it-IT');
    expect(upsertProfile.mock.calls[1]?.[1]).toEqual({ locale: 'de-DE' });

    await runtime.page({ locale: 'es-ES' });
    expect(upsertProfile.mock.calls[2]?.[0].events[0]?.context.locale).toBe('es-ES');
    expect(upsertProfile.mock.calls[2]?.[1]).toEqual({ locale: 'de-DE' });
  });

  it('uses the latest redacted browser context and locale, with consent from the runtime', async () => {
    const runtime = createRuntime({
      locale: 'en-US',
      defaults: { profile: { id: 'visitor' } },
      browserContext: {
        getPageProperties: () => ({
          path: window.location.pathname,
          query: {},
          referrer: '',
          search: '',
          title: document.title,
          url: `${window.location.origin}${window.location.pathname}`,
        }),
        getUserAgent: () => 'redacted-agent',
      },
    });
    runtime.consent({ events: false, persistence: false });
    const optimization = mockOptimization(runtime, { id: 'visitor' });

    window.history.replaceState({}, '', '/latest?secret=omit');
    document.title = 'Latest page';
    runtime.setLocale('de-DE');

    await expect(
      runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' })
    ).resolves.toBeUndefined();
    await runtime.flush();
    expect(optimization.sendBatchEvents).not.toHaveBeenCalled();

    runtime.consent({ events: true });
    await expect(
      runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' })
    ).resolves.toBeUndefined();
    await runtime.flush();

    expect(optimization.sendBatchEvents).toHaveBeenCalledWith([
      {
        profile: { id: 'visitor' },
        events: [
          expect.objectContaining({
            context: expect.objectContaining({
              locale: 'de-DE',
              gdpr: { isConsentGiven: true },
              page: expect.objectContaining({ path: '/latest', query: {} }),
              userAgent: 'redacted-agent',
            }),
          }),
        ],
      },
    ]);
  });
});

describe('Web ContentfulExperiences consent', () => {
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

  it('reports blocked events to onEventBlocked and drops them', async () => {
    window.localStorage.clear();
    const onEventBlocked = vi.fn();
    const runtime = createRuntime({ onEventBlocked, defaults: { profile: { id: 'visitor' } } });
    const optimization = mockOptimization(runtime, { id: 'visitor' });

    await expect(runtime.track({ event: 'purchase' })).resolves.toEqual({ accepted: false });

    expect(optimization.upsertProfile).not.toHaveBeenCalled();
    expect(onEventBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'consent', method: 'track' })
    );
    runtime.consent(true);
    expect(optimization.upsertProfile).not.toHaveBeenCalled();
  });
});

describe('Web ContentfulExperiences consent on pre-built events', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('drops caller-built fetchExperience events that consent does not admit', async () => {
    const onEventBlocked = vi.fn();
    const runtime = createRuntime({ onEventBlocked });
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);
    const page = runtime.eventBuilder.buildPageView();
    const track = runtime.eventBuilder.buildTrack({ event: 'purchase' });

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
        personalization: serializePersonalization({ profileId: 'profile-1', events: [page] }),
      },
      { config: { components: {} } }
    );
    expect(onEventBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'consent', method: 'track' })
    );
  });

  it('forwards every caller-built event once event consent is granted', async () => {
    const runtime = createRuntime();
    runtime.consent({ events: true });
    const fetch = vi
      .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [] } as never);
    const track = runtime.eventBuilder.buildTrack({ event: 'purchase' });

    await runtime.fetchExperience(
      {
        experienceId: 'personalized',
        personalization: { events: [track] },
      },
      { config: { components: {} } }
    );

    expect(fetch).toHaveBeenCalledWith(
      {
        experienceId: 'personalized',
        personalization: serializePersonalization({ events: [track] }),
      },
      { config: { components: {} } }
    );
  });
});
