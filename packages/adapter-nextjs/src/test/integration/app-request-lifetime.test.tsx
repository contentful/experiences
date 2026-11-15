/** @vitest-environment jsdom */
import {
  useExperiences,
  useExperiencesActions,
  type ManagedExperienceResult,
} from '@contentful/experiences-react/client';
import {
  CONSENT_CACHE_KEY,
  EventBuilder,
  PERSISTENCE_CONSENT_CACHE_KEY,
} from '@contentful/experiences-runtime';
import { ContentfulExperiences, createWebSnapshotRuntime } from '@contentful/experiences-web';
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppRouterRequestRoot,
  bindAppRouterClientExperiences,
} from '../../app-router/app-router-client.js';
import { profileFixture } from '../fixtures/profile.js';

const navigation = vi.hoisted(() => ({
  pathname: '/page',
  search: 'q=hello%20world',
  router: { refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock('next/navigation.js', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new globalThis.URLSearchParams(navigation.search),
  useRouter: () => navigation.router,
}));

const profile = profileFixture('server-profile');

import { appRequestSdkFixture as sdkFixture } from '../request-sdk.js';

describe('request-to-browser lifetime', () => {
  let container: HTMLDivElement;
  let root: Root;
  let liveSdk: ContentfulExperiences | undefined;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    navigation.pathname = '/page';
    navigation.search = 'q=hello%20world';
    window.history.replaceState(null, '', '/page?q=hello+world');
    vi.clearAllMocks();
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    liveSdk?.destroy();
    liveSdk = undefined;
    vi.restoreAllMocks();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it.each([
    {
      label: 'bound defaults',
      defaults: false,
      clientDefaults: undefined,
      override: undefined,
      expected: false,
    },
    {
      label: 'bound client consent defaults',
      defaults: true,
      clientDefaults: false,
      override: undefined,
      expected: false,
    },
    {
      label: 'explicit root acceptance',
      defaults: false,
      clientDefaults: false,
      override: true,
      expected: true,
    },
    {
      label: 'explicit root denial',
      defaults: true,
      clientDefaults: true,
      override: false,
      expected: false,
    },
    {
      label: 'persisted acceptance without configured defaults',
      defaults: undefined,
      clientDefaults: undefined,
      override: undefined,
      expected: true,
    },
  ])(
    'uses $label when constructing the browser owner',
    async ({ defaults, clientDefaults, override, expected }) => {
      window.localStorage.setItem(CONSENT_CACHE_KEY, 'accepted');
      window.localStorage.setItem(PERSISTENCE_CONSENT_CACHE_KEY, 'accepted');
      const consentDefaults = (value: boolean | undefined) =>
        value === undefined ? undefined : { consent: value, persistenceConsent: value };
      const bound = bindAppRouterClientExperiences({
        config: { components: {} },
        spaceId: 'space',
        environmentId: 'master',
        delivery: { host: 'https://trusted-proxy.example' },
        defaults: consentDefaults(defaults),
        consent: { clientDefaults: consentDefaults(clientDefaults) },
      });
      let current: ReturnType<typeof useExperiences>;
      function ConsentProbe() {
        current = useExperiences();
        return null;
      }
      await act(async () =>
        root.render(
          <bound.ExperiencesRoot defaults={consentDefaults(override)}>
            <ConsentProbe />
          </bound.ExperiencesRoot>
        )
      );
      expect(current!.states.consent.current).toBe(expected);
      expect(current!.states.persistenceConsent.current).toBe(expected);
      expect(window.localStorage.getItem(CONSENT_CACHE_KEY)).toBe(expected ? 'accepted' : 'denied');
      expect(window.localStorage.getItem(PERSISTENCE_CONSENT_CACHE_KEY)).toBe(
        expected ? 'accepted' : 'denied'
      );
    }
  );

  it('redirects once in StrictMode and refetches after restoring an old redirect result', async () => {
    const binding = bindAppRouterClientExperiences({ config: { components: {} } });
    const freshPlan = {
      nodes: [],
      diagnostics: [],
      metadata: { label: 'fresh content' },
      debug: false,
    };
    const { sdk, fetchExperience, hydrateAndTrackCurrentPage } = sdkFixture();
    fetchExperience.mockResolvedValue(freshPlan);
    const startup = {
      requestId: 'redirect-history',
      routeKey: '/page?q=hello+world',
      experience: { destinationId: 'site', path: '/page' },
      redirect: { path: '/target' },
    };
    const render = async (path: string, result = startup) => {
      navigation.pathname = path;
      navigation.search = 'q=hello+world';
      window.history.replaceState(null, '', `${path}?q=hello+world`);
      await act(async () =>
        root.render(
          <StrictMode>
            <binding.request.ExperiencesRoot sdk={sdk} result={{ ...result }}>
              <binding.request.Experience>
                {(state) => <output>{String(state.data?.metadata.label ?? state.status)}</output>}
              </binding.request.Experience>
            </binding.request.ExperiencesRoot>
          </StrictMode>
        )
      );
    };
    await render('/page');
    await render('/page');
    expect(navigation.router.replace).toHaveBeenCalledExactlyOnceWith('/target');
    expect(fetchExperience).not.toHaveBeenCalled();
    await render('/other');
    await render('/page');
    expect(navigation.router.replace).toHaveBeenCalledTimes(1);
    expect(fetchExperience).toHaveBeenCalledOnce();
    expect(fetchExperience.mock.calls[0]?.[0]).toMatchObject({
      destinationId: 'site',
      path: '/page',
    });
    expect(container.textContent).toBe('fresh content');
    expect(hydrateAndTrackCurrentPage).not.toHaveBeenCalled();
    await render('/page', {
      ...startup,
      requestId: 'fresh-result',
      redirect: { path: '/fresh-target' },
    });
    expect(navigation.router.replace).toHaveBeenCalledTimes(2);
    expect(navigation.router.replace).toHaveBeenLastCalledWith('/fresh-target');
  });

  it('rejects original request bootstrap after Reset and keyed history restoration but accepts a new ID with identical plan bytes', async () => {
    const startupPlan = { nodes: [], debug: false, diagnostics: [], metadata: { label: 'server' } };
    const fetchedPlan = { ...startupPlan, metadata: { label: 'browser' } };
    const { sdk, fetchExperience, hydrateAndTrackCurrentPage } = sdkFixture();
    fetchExperience.mockResolvedValue(fetchedPlan);
    let reset!: () => void;
    function Actions() {
      reset = useExperiencesActions().resetUser;
      return null;
    }
    const bound = bindAppRouterClientExperiences({ config: { components: {} } });
    const handoff = {
      spaceId: 'space',
      environmentId: 'master',
      cache: { scope: 'private-request' as const },
      state: { profile },
    };
    const { ExperiencesRoot, Experience } = bound.request;
    const tree = (routeKey: string, requestId: string, seed = true) => {
      const result = {
        routeKey,
        requestId,
        experience: { experienceId: 'primary' },
        handoff: seed ? JSON.parse(JSON.stringify(handoff)) : undefined,
        plan: seed ? JSON.parse(JSON.stringify(startupPlan)) : undefined,
      };
      return (
        <ExperiencesRoot sdk={sdk} result={result}>
          <Actions />
          <Experience key={routeKey}>
            {(state) => <output>{String(state.data?.metadata.label)}</output>}
          </Experience>
        </ExperiencesRoot>
      );
    };
    await act(async () => root.render(tree('/page?q=hello+world', 'original')));
    expect(fetchExperience).not.toHaveBeenCalled();
    expect(hydrateAndTrackCurrentPage).toHaveBeenCalledOnce();
    await act(async () => reset());
    navigation.pathname = '/destination';
    navigation.search = '';
    window.history.replaceState(null, '', '/destination');
    await act(async () => root.render(tree('/destination', 'destination', false)));
    navigation.pathname = '/page';
    navigation.search = 'q=hello+world';
    window.history.replaceState(null, '', '/page?q=hello+world');
    await act(async () => root.render(tree('/page?q=hello+world', 'original')));
    expect(container.textContent).toBe('browser');
    expect(fetchExperience).toHaveBeenCalledTimes(3); // reset, destination and restored history
    expect(hydrateAndTrackCurrentPage).toHaveBeenCalledOnce();
    const count = fetchExperience.mock.calls.length;
    await act(async () => root.render(tree('/page?q=hello+world', 'fresh')));
    expect(container.textContent).toBe('server');
    expect(fetchExperience).toHaveBeenCalledTimes(count);
    expect(hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(2);
  });

  it('constructs the default owner without a browser registry and preserves the supplied primary plan', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    let current: ReturnType<typeof useExperiences>;
    function Probe() {
      current = useExperiences();
      return null;
    }
    const bound = bindAppRouterClientExperiences({ config: { components: {} } });
    const { Experience } = bound.request;
    const result = {
      requestId: 'default',
      routeKey: '/page?q=hello+world',
      experience: { experienceId: 'primary' },
      plan: { nodes: [], debug: false, diagnostics: [], metadata: { label: 'server' } },
    };
    await act(async () =>
      root.render(
        <AppRouterRequestRoot
          spaceId="space"
          environmentId="master"
          locale="en-US"
          browser={{ delivery: { host: 'https://trusted-proxy.example' } }}
          defaults={{ consent: false, persistenceConsent: false }}
          cookie={{ expires: 7, path: '/page' }}
          result={result}
        >
          <Probe />
          <Experience>
            {(state) => <output>{String(state.data?.metadata.label)}</output>}
          </Experience>
        </AppRouterRequestRoot>
      )
    );
    const sdk = current! as ContentfulExperiences;
    expect(sdk.config).toMatchObject({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { host: 'https://trusted-proxy.example' },
      cookie: { expires: 7, path: '/page' },
    });
    expect(sdk.locale).toBe('en-US');
    expect(sdk.states.consent.current).toBe(false);
    expect(sdk.states.persistenceConsent.current).toBe(false);
    expect(container.textContent).toBe('server');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('adopts each server preparation once without redundant Web content fetches', async () => {
    const sdk = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'browser' },
      defaults: { consent: true, persistenceConsent: false },
    });
    liveSdk = sdk;
    const send = vi.spyOn(sdk.api.personalization, 'upsertProfile').mockResolvedValue({
      profile: { ...profile, id: 'browser-profile', stableId: 'browser-profile' },
    } as never);
    const fetchExperience = vi
      .spyOn(sdk, 'fetchExperience')
      .mockRejectedValue(new Error('Unexpected Web content fetch'));
    const bound = bindAppRouterClientExperiences({ config: { components: {} } });
    const builder = new EventBuilder({
      channel: 'web',
      library: { name: 'test', version: '1.0.0' },
    });
    const result = (routeKey: string, requestId: string, label?: string) => ({
      requestId,
      routeKey,
      experience: { experienceId: 'primary' },
      plan:
        label === undefined
          ? undefined
          : {
              nodes: [],
              debug: false,
              diagnostics: [],
              metadata: { label },
            },
      contentError: label === undefined ? 'Content unavailable.' : undefined,
      handoff: {
        spaceId: 'space',
        environmentId: 'master',
        cache: { scope: 'private-request' as const },
        replay: {
          routeKey,
          events: [
            builder.buildPageView({
              properties: { title: label ?? 'Unavailable', path: routeKey },
            }),
          ],
        },
      },
    });
    const render = async (value: ReturnType<typeof result>) => {
      await act(async () =>
        root.render(
          <bound.request.ExperiencesRoot sdk={sdk} result={value} pageMode="analytics">
            <bound.request.Experience result={value}>
              {(state) => (
                <output>
                  {state.error ? 'Unavailable' : String(state.data?.metadata.label ?? 'Waiting')}
                </output>
              )}
            </bound.request.Experience>
          </bound.request.ExperiencesRoot>
        )
      );
      await act(async () => sdk.flush());
    };
    const initial = result('/page?q=hello+world', 'initial', 'Initial server plan');
    await render(initial);
    expect(container.textContent).toBe('Initial server plan');
    expect(send).toHaveBeenCalledTimes(1);
    await render(JSON.parse(JSON.stringify(initial)));
    expect(send).toHaveBeenCalledTimes(1);
    navigation.pathname = '/destination';
    navigation.search = '';
    window.history.replaceState(null, '', '/destination');
    await render(initial);
    expect(container.textContent).toBe('Waiting');
    expect(send).toHaveBeenCalledTimes(1);
    expect(fetchExperience).not.toHaveBeenCalled();
    await render(result('/destination', 'navigation', 'Next server plan'));
    expect(container.textContent).toBe('Next server plan');
    expect(send).toHaveBeenCalledTimes(2);
    await render(result('/destination', 'refresh', 'Refreshed server plan'));
    expect(container.textContent).toBe('Refreshed server plan');
    expect(send).toHaveBeenCalledTimes(3);
    await render(result('/destination', 'failed'));
    expect(container.textContent).toBe('Unavailable');
    expect(send).toHaveBeenCalledTimes(4);
    expect(fetchExperience).not.toHaveBeenCalled();
  });

  it('continues Web-owned navigation after the initial server result in a retained root', async () => {
    const plan = { nodes: [], debug: false, diagnostics: [], metadata: { label: 'Web plan' } };
    const fetchExperience = vi.fn().mockResolvedValue(plan);
    const sdk = {
      ...createWebSnapshotRuntime(),
      spaceId: 'space',
      environmentId: 'master',
      config: {},
      fetchExperience,
      subscribeToPreview: () => ({ unsubscribe() {} }),
    } as unknown as ContentfulExperiences;
    const bound = bindAppRouterClientExperiences({ config: { components: {} } });
    const initial = {
      requestId: 'initial',
      routeKey: '/page?q=hello+world',
      experience: { experienceId: 'primary' },
      plan,
    };
    const show = (state: ManagedExperienceResult) => (
      <output>{String(state.data?.metadata.label ?? 'Waiting')}</output>
    );
    const render = async () => {
      const currentResult =
        initial.routeKey === window.location.pathname + window.location.search
          ? initial
          : undefined;
      await act(async () =>
        root.render(
          <bound.request.ExperiencesRoot sdk={sdk} result={currentResult}>
            {currentResult ? (
              <bound.request.Experience result={currentResult}>{show}</bound.request.Experience>
            ) : (
              <bound.Experience experienceId="primary">{show}</bound.Experience>
            )}
          </bound.request.ExperiencesRoot>
        )
      );
    };
    await render();
    expect(container.textContent).toBe('Web plan');
    expect(fetchExperience).not.toHaveBeenCalled();
    navigation.pathname = '/destination';
    navigation.search = '';
    window.history.replaceState(null, '', '/destination');
    await render();
    expect(container.textContent).toBe('Web plan');
    expect(fetchExperience).toHaveBeenCalledTimes(1);
    expect(fetchExperience.mock.calls[0]![0]).toMatchObject({
      personalization: { events: [{ type: 'page', properties: { path: '/destination' } }] },
    });
    navigation.pathname = '/page';
    navigation.search = 'q=hello%20world';
    window.history.replaceState(null, '', initial.routeKey);
    await render();
    expect(fetchExperience).toHaveBeenCalledTimes(2);
    expect(fetchExperience.mock.calls[1]![0]).toMatchObject({
      personalization: { events: [{ type: 'page', properties: { path: '/page' } }] },
    });
  });
});
