/** @vitest-environment jsdom */
import { act } from 'react';
import {
  useExperiences,
  useExperiencesActions,
  type ManagedExperienceResult,
} from '@contentful/experiences-react/client';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CONSENT_CACHE_KEY,
  EventBuilder,
  PERSISTENCE_CONSENT_CACHE_KEY,
} from '@contentful/experiences-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebSnapshotRuntime,
  ContentfulExperiences,
  type States,
} from '@contentful/experiences-web';
import {
  bindAppRouterClientExperiences,
  AppRouterRequestRoot,
  AppRouterRequestAnalyticsRoot,
  useAppAutoPageInputs,
} from './app-router-client.js';
import { profileFixture } from '../../adapter-react/src/test/profile.js';
import { RequestPresentation } from './router-lifetime.js';

const navigation = vi.hoisted(() => ({
  pathname: '/page',
  search: 'q=hello%20world',
  router: { refresh: vi.fn() },
}));
vi.mock('./router-lifetime.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./router-lifetime.js')>();
  return { ...actual, RequestPresentation: vi.fn(actual.RequestPresentation) };
});
vi.mock('next/navigation.js', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new globalThis.URLSearchParams(navigation.search),
  useRouter: () => navigation.router,
}));

const profile = profileFixture('server-profile');

describe('App committed route inputs', () => {
  let container: HTMLDivElement;
  let root: Root;
  let liveSdk: ContentfulExperiences | undefined;
  let inputs: ReturnType<typeof useAppAutoPageInputs>;
  function Probe() {
    inputs = useAppAutoPageInputs();
    return null;
  }
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

  it('normalizes encoded queries/hashes and keeps the last browser-confirmed retained-layout route', async () => {
    navigation.search = 'q=hello%20world&tag=a&tag=b';
    window.history.replaceState(null, '', '/page?q=hello+world&tag=a&tag=b');
    await act(async () => root.render(<Probe />));
    expect(inputs.routeKey).toBe('/page?q=hello+world&tag=a&tag=b');
    expect(inputs.buildPagePayload({ isInitialEmission: true })?.properties).toMatchObject({
      path: '/page',
      search: '?q=hello+world&tag=a&tag=b',
      query: { q: 'hello world', tag: ['a', 'b'] },
    });
    navigation.pathname = '/destination';
    navigation.search = 'q=changed&tag=c&tag=d';
    window.history.replaceState(null, '', '/destination?q=changed&tag=c&tag=d#anchor');
    await act(async () => root.render(<Probe />));
    expect(inputs.routeKey).toBe('/destination?q=changed&tag=c&tag=d');
    // Retained layouts can replay old hooks while browser history stays committed.
    navigation.pathname = '/page';
    navigation.search = 'q=hello+world&tag=a&tag=b';
    await act(async () => root.render(<Probe />));
    expect(inputs.routeKey).toBe('/destination?q=changed&tag=c&tag=d');
    expect(inputs.buildPagePayload({ isInitialEmission: false })?.properties).toMatchObject({
      path: '/destination',
      search: '?q=changed&tag=c&tag=d',
      query: { q: 'changed', tag: ['c', 'd'] },
    });
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

  it('rejects original request bootstrap after Reset and keyed history restoration but accepts a new ID with identical plan bytes', async () => {
    const startupPlan = { nodes: [], debug: false, diagnostics: [], metadata: { label: 'server' } };
    const fetchedPlan = { ...startupPlan, metadata: { label: 'browser' } };
    const hydrateAndTrackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
    const fetchExperience = vi.fn().mockResolvedValue(fetchedPlan);
    const sdk = {
      ...createWebSnapshotRuntime({ consent: true }),
      spaceId: 'space',
      environmentId: 'master',
      config: {},
      hydrateAndTrackCurrentPage,
      fetchExperience,
      reset: vi.fn(),
      subscribeToPreview: () => ({ unsubscribe() {} }),
    } as unknown as ContentfulExperiences;
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

  it.each(['bound', 'standalone'] as const)(
    'keeps an empty %s request root inactive',
    async (kind) => {
      const bound = bindAppRouterClientExperiences({ config: { components: {} } });
      const Owner = kind === 'bound' ? bound.request.ExperiencesRoot : AppRouterRequestRoot;
      await act(async () =>
        root.render(
          <Owner
            spaceId="space"
            environmentId="master"
            browser={{ delivery: { accessToken: 'browser-token' } }}
            sdk={createWebSnapshotRuntime() as ContentfulExperiences}
          >
            <bound.request.Experience>
              {(state) => <output>{state.status}</output>}
            </bound.request.Experience>
          </Owner>
        )
      );
      expect(container.textContent).toBe('idle');
    }
  );

  it.each([false, true])(
    'requires a request result outside request roots (plain preview root=%s)',
    (preview) => {
      const bound = bindAppRouterClientExperiences({
        config: { components: {} },
        spaceId: 'space',
        environmentId: 'master',
        delivery: { accessToken: 'delivery' },
        preview: { accessToken: 'preview', createClient: vi.fn() },
      });
      const content = <bound.request.Experience />;
      expect(() =>
        renderToStaticMarkup(
          preview ? <bound.ExperiencesRoot>{content}</bound.ExperiencesRoot> : content
        )
      ).toThrow('requires a result prop or a request ExperiencesRoot');
    }
  );

  it('passes client configuration and prop overrides to the shared request presentation', async () => {
    const configured = vi.fn(() => ({ properties: { path: '/configured' } }));
    const override = vi.fn(() => ({ properties: { path: '/override' } }));
    const beforeInitialPage = { run: vi.fn() };
    const bound = bindAppRouterClientExperiences({
      config: { components: {} },
      buildPagePayload: configured,
      beforeInitialPage,
    });
    const { ExperiencesAnalyticsRoot } = bound.request;
    await act(async () =>
      root.render(
        <ExperiencesAnalyticsRoot
          sdk={createWebSnapshotRuntime() as ContentfulExperiences}
          buildPagePayload={override}
        />
      )
    );
    const presentation = vi.mocked(RequestPresentation).mock.calls.at(-1)![0];
    expect(presentation.Root({}).props).toMatchObject({ beforeInitialPage });
    expect(presentation).toMatchObject({
      routeKey: '/page?q=hello+world',
      configuredBuilder: configured,
      buildPagePayload: override,
      pageMode: 'analytics',
    });
  });

  it('keeps explicit roots and plans caller-owned', async () => {
    const plan = { nodes: [], debug: false, diagnostics: [], metadata: {} };
    const fetchExperience = vi.fn().mockResolvedValue(plan);
    const hydrateAndTrackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
    const sdk = {
      ...createWebSnapshotRuntime(),
      spaceId: 'space',
      environmentId: 'master',
      config: {},
      fetchExperience,
      hydrateAndTrackCurrentPage,
      subscribeToPreview: () => ({ unsubscribe() {} }),
    } as unknown as ContentfulExperiences;
    const bound = bindAppRouterClientExperiences({ config: { components: {} } });
    const { ExperiencesRoot, Experience } = bound;
    const tree = () => (
      <ExperiencesRoot
        sdk={sdk}
        handoff={{ spaceId: 'space', environmentId: 'master', cache: { scope: 'private-request' } }}
      >
        {['primary', 'secondary'].map((experienceId) => (
          <Experience
            key={navigation.pathname + experienceId}
            experienceId={experienceId}
            initialPlan={{ ...plan, metadata: { label: experienceId } }}
          >
            {(state) => <output>{String(state.data?.metadata.label)}</output>}
          </Experience>
        ))}
      </ExperiencesRoot>
    );
    await act(async () => root.render(tree()));
    expect(container.textContent).toBe('primarysecondary');
    navigation.pathname = '/destination';
    navigation.search = '';
    window.history.replaceState(null, '', '/destination');
    await act(async () => root.render(tree()));
    expect(container.textContent).toBe('primarysecondary');
    expect(fetchExperience).not.toHaveBeenCalled();
    expect(hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(2);
  });

  it('refreshes the current SDK Preview target without a root Experience ID', async () => {
    let current: States['preview']['current'];
    const listeners = new Set<(value: States['preview']['current']) => void>();
    const snapshot = createWebSnapshotRuntime();
    const fetchExperience = vi.fn();
    const trackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
    const hydrateAndTrackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
    const sdk = {
      ...snapshot,
      fetchExperience,
      spaceId: 'space',
      environmentId: 'master',
      trackCurrentPage,
      hydrateAndTrackCurrentPage,
      states: {
        ...snapshot.states,
        preview: {
          get current() {
            return current;
          },
          subscribe(listener: (value: States['preview']['current']) => void) {
            listeners.add(listener);
            listener(current);
            return { unsubscribe: () => listeners.delete(listener) };
          },
        },
      },
    } as unknown as ContentfulExperiences;
    await act(async () =>
      root.render(
        <AppRouterRequestAnalyticsRoot
          browser={{ delivery: { host: 'https://trusted-proxy.example' } }}
          spaceId="space"
          environmentId="master"
          sdk={sdk}
          result={{
            requestId: 'preview',
            routeKey: '/page?q=hello+world',
            experience: { experienceId: 'primary' },
          }}
        >
          <p>Server content</p>
        </AppRouterRequestAnalyticsRoot>
      )
    );
    const publish = async (experienceId: string, revision: number) =>
      act(async () => {
        current = {
          revision,
          data: { sys: { id: experienceId, type: 'Experience' }, nodes: [] },
          error: undefined,
          status: undefined,
        };
        for (const listener of listeners) listener(current);
      });
    await publish('primary', 1);
    expect(navigation.router.refresh).not.toHaveBeenCalled();
    await publish('primary', 2);
    expect(navigation.router.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('Server content');
    expect(fetchExperience).not.toHaveBeenCalled();
  });
  it('preserves a bound static page payload on an explicit managed root', async () => {
    const initialPagePayload = { properties: { title: 'Configured page' } };
    const { ExperiencesRoot } = bindAppRouterClientExperiences({
      config: { components: {} },
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'delivery' },
      initialPagePayload,
      preview: { accessToken: 'preview', createClient: vi.fn() },
    });
    await act(async () => root.render(<ExperiencesRoot />));
    expect(vi.mocked(RequestPresentation).mock.calls.at(-1)![0].initialPagePayload).toBe(
      initialPagePayload
    );
  });
});
