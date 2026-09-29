// @vitest-environment jsdom

import {
  ContentfulExperiences as ClientContentfulExperiences,
  EventProfileRequiredError,
} from '@contentful/experiences-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPageProperties, getUserAgent } from './browser-event-context.js';
import { ContentfulExperiences, type ExperiencesWebConfig } from './contentful-experiences.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

class TestContentfulExperiences extends ContentfulExperiences {
  get optimization(): typeof this.optimizationApi {
    return this.optimizationApi;
  }
}

function createRuntime(overrides: Partial<ExperiencesWebConfig> = {}): TestContentfulExperiences {
  return new TestContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    resolverConfig: { components: {} },
    delivery: { accessToken: 'delivery-token' },
    ...overrides,
  });
}

function mockOptimization(runtime: TestContentfulExperiences, profile = { id: 'updated-profile' }) {
  return {
    upsertProfile: vi
      .spyOn(runtime.optimization.experience, 'upsertProfile')
      .mockResolvedValue({ profile } as never),
    sendBatchEvents: vi
      .spyOn(runtime.optimization.insights, 'sendBatchEvents')
      .mockResolvedValue(true),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
  document.title = '';
});

describe('Web ContentfulExperiences', () => {
  it('uses live browser context and Web attribution', () => {
    window.history.replaceState({}, '', '/first?utm_source=search&tag=one&tag=two#details');
    document.title = 'First page';
    const runtime = createRuntime({ app: { name: 'storefront', version: '1.2.3' } });

    const first = runtime.eventBuilder.buildTrack({ event: 'first' });
    window.history.replaceState({}, '', '/second?campaign=spring#top');
    document.title = 'Second page';
    const second = runtime.eventBuilder.buildTrack({ event: 'second' });

    expect(runtime.eventBuilder.channel).toBe('web');
    expect(first.context).toMatchObject({
      app: { name: 'storefront', version: '1.2.3' },
      library: DEFAULT_EVENT_CONTEXT_LIBRARY,
      page: {
        path: '/first',
        query: { utm_source: 'search', tag: 'two' },
        search: '?utm_source=search&tag=one&tag=two',
        hash: '#details',
        title: 'First page',
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

  it('uses mutable defaults while preserving a per-call locale', async () => {
    const runtime = createRuntime();
    const fetch = vi
      .spyOn(ClientContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [], viewports: [] } as never);

    runtime.setLocale('de-DE');
    expect(runtime.locale).toBe('de-DE');
    expect(runtime.eventBuilder.buildTrack({ event: 'locale' }).context.locale).toBe('de-DE');

    await runtime.fetchExperience({ experienceId: 'default' });
    await runtime.fetchExperience({ experienceId: 'per-call', locale: 'fr-FR' });

    expect(fetch).toHaveBeenNthCalledWith(1, { experienceId: 'default' });
    expect(fetch).toHaveBeenNthCalledWith(2, {
      experienceId: 'per-call',
      locale: 'fr-FR',
    });
  });

  it('forwards personalization with Web event context', async () => {
    const runtime = createRuntime();
    const fetch = vi
      .spyOn(ClientContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [], viewports: [] } as never);
    const page = runtime.eventBuilder.buildPageView();
    const personalization = {
      profileId: 'profile-1',
      events: [page],
    };

    await runtime.fetchExperience({ experienceId: 'personalized', personalization });

    expect(page.channel).toBe('web');
    expect(fetch).toHaveBeenCalledWith({ experienceId: 'personalized', personalization });
  });

  it('keeps mutable locale state isolated between instances', () => {
    const english = createRuntime({ locale: 'en-US' });
    const french = createRuntime({ locale: 'fr-FR' });

    english.setLocale('de-DE');

    expect(english.eventBuilder.buildTrack({ event: 'english' }).context.locale).toBe('de-DE');
    expect(french.eventBuilder.buildTrack({ event: 'french' }).context.locale).toBe('fr-FR');
  });

  it('accepts runtime-owned endpoint, preview, and tokenless proxy configuration', async () => {
    const baseConfig = {
      spaceId: 'space',
      environmentId: 'environment',
      resolverConfig: { components: {} },
    };

    const hostConfig = {
      ...baseConfig,
      delivery: { accessToken: 'delivery-token', host: 'https://delivery.example' },
      preview: { accessToken: 'preview-token', host: 'https://preview.example' },
    } satisfies ExperiencesWebConfig;
    const environmentConfig = {
      ...baseConfig,
      delivery: { accessToken: 'delivery-token', environment: 'https://environment.example' },
    } satisfies ExperiencesWebConfig;
    const tokenlessProxyConfig = {
      ...baseConfig,
      delivery: { host: 'https://application.example/experience-proxy' },
    } satisfies ExperiencesWebConfig;
    const options: Parameters<ContentfulExperiences['fetchExperience']>[0] = {
      experienceId: 'experience',
      preview: true,
    };

    expect(() => new ContentfulExperiences(hostConfig)).not.toThrow();
    expect(() => new ContentfulExperiences(environmentConfig)).not.toThrow();
    expect(() => new ContentfulExperiences(tokenlessProxyConfig)).not.toThrow();
    expect(options).toBeDefined();
    const runtime = createRuntime({ preview: { accessToken: 'preview-token' } });
    const fetch = vi
      .spyOn(ClientContentfulExperiences.prototype, 'fetchExperience')
      .mockResolvedValue({ nodes: [], viewports: [] } as never);

    await runtime.fetchExperience(options);

    expect(fetch).toHaveBeenCalledWith(options);
  });

  it('keeps the event profile in memory and updates it from Experience events', async () => {
    const runtime = createRuntime({
      profile: { id: 'initial-profile' },
    });
    const optimization = mockOptimization(runtime);

    await runtime.track({ event: 'started' });

    expect(optimization.upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'initial-profile' }),
      { locale: 'en-US' }
    );
    expect(runtime.profile).toEqual({ id: 'updated-profile' });
  });

  it('requires a volatile profile for Insights events', async () => {
    const runtime = createRuntime();
    mockOptimization(runtime);

    await expect(
      runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' })
    ).rejects.toBeInstanceOf(EventProfileRequiredError);
  });

  it('resets the volatile profile before establishing a new one', async () => {
    const runtime = createRuntime({
      profile: { id: 'first-profile' },
    });
    const optimization = mockOptimization(runtime);

    runtime.reset();
    await expect(
      runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' })
    ).rejects.toBeInstanceOf(EventProfileRequiredError);

    await runtime.page();
    await runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' });

    expect(optimization.sendBatchEvents).toHaveBeenCalledWith([
      expect.objectContaining({ profile: { id: 'updated-profile' } }),
    ]);
  });

  it('does not restore a prior profile from an in-flight Experience response', async () => {
    let resolveResponse!: (value: { profile: { id: string } }) => void;
    const response = new Promise<{ profile: { id: string } }>((resolve) => {
      resolveResponse = resolve;
    });
    const runtime = createRuntime({
      profile: { id: 'first-profile' },
    });
    const optimization = mockOptimization(runtime);
    optimization.upsertProfile.mockReturnValueOnce(response as never);

    const pending = runtime.track({ event: 'started-before-session-change' });
    runtime.reset();
    await runtime.page();
    resolveResponse({ profile: { id: 'first-profile-from-api' } });

    await pending;
    expect(runtime.profile).toEqual({ id: 'updated-profile' });
  });

  it('uses the latest redacted browser context, locale, and consent without gating events', async () => {
    const runtime = createRuntime({
      locale: 'en-US',
      profile: { id: 'visitor' },
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
        getConsent: () => false,
      },
    });
    const optimization = mockOptimization(runtime, { id: 'visitor' });

    window.history.replaceState({}, '', '/latest?secret=omit');
    document.title = 'Latest page';
    runtime.setLocale('de-DE');

    await expect(
      runtime.trackClick({ entityId: 'experience', entityKind: 'Experience' })
    ).resolves.toBe(true);

    expect(optimization.sendBatchEvents).toHaveBeenCalledWith([
      {
        profile: { id: 'visitor' },
        events: [
          expect.objectContaining({
            context: expect.objectContaining({
              locale: 'de-DE',
              gdpr: { isConsentGiven: false },
              page: expect.objectContaining({ path: '/latest', query: {} }),
              userAgent: 'redacted-agent',
            }),
          }),
        ],
      },
    ]);
  });
});

describe('browser event context helpers', () => {
  it('returns dynamic browser values', () => {
    window.history.replaceState({}, '', '/context?one=1#hash');
    document.title = 'Context';
    const page = getPageProperties();

    expect(page).toMatchObject({
      path: '/context',
      query: { one: '1' },
      search: '?one=1',
      hash: '#hash',
      title: 'Context',
      width: window.innerWidth,
      height: window.innerHeight,
    });
    expect(getUserAgent()).toBe(window.navigator.userAgent);
  });
});
