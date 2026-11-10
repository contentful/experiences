import {
  InterceptorManager,
  ContentfulExperiences as RuntimeContentfulExperiences,
} from '@contentful/experiences-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateOptimizationData } from '../bridge-support.js';
import { ContentfulExperiences } from '../contentful-experiences.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from '../sdk-info.js';
import type { LifecycleInterceptors } from '../state/interceptors.js';
import type { CoreStates } from '../state/states.js';
import { clearIdentityCookies, seedConsent } from '../test/fixtures/consent.js';
import { completeProfile } from '../test/fixtures/profile.js';
import { createWebHarness } from '../test/web-harness.js';

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

  describe('SDK construction and wiring', () => {
    it('uses subclass interceptor registries for XDA and incoming state', async () => {
      class Specialized extends ContentfulExperiences {
        override readonly interceptors: LifecycleInterceptors = {
          event: new InterceptorManager(),
          state: new InterceptorManager(),
        };
      }
      const local = createWebHarness({ locale: 'en-US' }, Specialized);
      try {
        const sdk = local.create();
        const event = vi.fn((event) => event);
        const state = vi.fn(() => ({ profile: completeProfile('intercepted') }));
        sdk.interceptors.event.add(event);
        sdk.interceptors.state.add(state);
        vi.spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience').mockResolvedValue({
          nodes: [],
        } as never);
        await sdk.fetchExperience(
          {
            experienceId: 'registries',
            personalization: { events: [sdk.eventBuilder.buildPageView()] },
          },
          { config: { components: {} } }
        );
        await hydrateOptimizationData(sdk, { profile: completeProfile('original') });
        expect(event).toHaveBeenCalledOnce();
        expect(state).toHaveBeenCalledOnce();
        expect(sdk.states.profile.current?.id).toBe('intercepted');
      } finally {
        local.destroy();
      }
    });

    it('subscribes through the subclass preview observable', () => {
      const subscribe = vi.fn(() => ({ unsubscribe() {} }));
      class SpecializedStates extends ContentfulExperiences {
        override readonly states: CoreStates = {
          ...this.baseStates(),
          preview: { current: undefined, subscribe, subscribeOnce: () => ({ unsubscribe() {} }) },
        };
        private baseStates(): CoreStates {
          return this.states;
        }
      }
      const local = createWebHarness({ locale: 'en-US' }, SpecializedStates);
      try {
        const sdk = local.create();
        const subscription = sdk.subscribeToPreview(
          'preview',
          { config: { components: {} } },
          () => {}
        );
        expect(subscribe).toHaveBeenCalledOnce();
        subscription.unsubscribe();
      } finally {
        local.destroy();
      }
    });

    it.each([undefined, 'de-DE'])('preserves omitted or explicit harness locale %s', (locale) => {
      const local = createWebHarness({}, ContentfulExperiences);
      try {
        const sdk = local.create(locale === undefined ? {} : { locale });
        expect(sdk.locale).toBe(locale);
        expect(sdk.config.locale).toBe(locale);
      } finally {
        local.destroy();
      }
    });

    it('retains callback receivers and virtual preview policy across browser owners', async () => {
      let preview = false;
      class CustomPolicy extends ContentfulExperiences {
        override get isPreview() {
          return preview;
        }
      }
      const local = createWebHarness({}, CustomPolicy);
      const receivers: unknown[] = [];
      try {
        const sdk = local.create({
          getAnonymousId() {
            receivers.push(this);
            return 'provider';
          },
        });
        const fetch = vi
          .spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience')
          .mockResolvedValue({ nodes: [] } as never);
        const options = {
          experienceId: 'policy',
          personalization: { events: [sdk.eventBuilder.buildPageView()] },
        };
        const resolve = { config: { components: {} } };
        await sdk.fetchExperience(options, resolve);
        expect(receivers.length).toBeGreaterThan(0);
        expect(receivers.every((receiver) => receiver === sdk)).toBe(true);
        expect(fetch.mock.calls[0]?.[0].personalization).toMatchObject({
          profileId: 'provider',
          events: options.personalization.events,
        });
        preview = true;
        await sdk.fetchExperience(options, resolve);
        expect(fetch.mock.calls[1]?.[0].personalization).toBeUndefined();
      } finally {
        local.destroy();
      }
    });

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
          query: { utm_source: 'search', tag: ['one', 'two'] },
          search: '?utm_source=search&tag=one&tag=two',
        },
      });
      expect(second.context.page).toMatchObject({
        path: '/second',
        query: { campaign: 'spring' },
      });
      expect(second.context.campaign).toEqual({});
      const page = runtime.eventBuilder.buildPageView();
      expect(page.context.page!.title).toBe('Second page');
      expect(page.properties.title).toBe('Second page');
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
  });
});
