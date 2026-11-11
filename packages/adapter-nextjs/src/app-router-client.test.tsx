/** @vitest-environment jsdom */
import { act } from 'react';
import { useExperiences, useExperiencesActions } from '@contentful/experiences-react/client';
import { createRoot, type Root } from 'react-dom/client';
import { EventBuilder } from '@contentful/experiences-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebSnapshotRuntime,
  ContentfulExperiences,
  type PreviewState,
} from '@contentful/experiences-web';
import {
  bindNextjsAppRouterClientExperiences,
  NextjsAppRouterRequestRoot,
  NextjsAppRouterRequestAnalyticsRoot,
  useNextAppAutoPageInputs,
} from './app-router-client.js';
import { NextjsRequestPresentation } from './router-lifetime.js';

const navigation = vi.hoisted(() => ({
  pathname: '/page',
  search: 'q=hello%20world',
  router: { refresh: vi.fn() },
}));
vi.mock('./router-lifetime.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./router-lifetime.js')>();
  return { ...actual, NextjsRequestPresentation: vi.fn(actual.NextjsRequestPresentation) };
});
vi.mock('next/navigation.js', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new globalThis.URLSearchParams(navigation.search),
  useRouter: () => navigation.router,
}));

const profile = {
  id: 'server-profile',
  stableId: 'server-profile',
  random: 0.5,
  audiences: [],
  traits: {},
  location: {},
  session: {
    isReturningVisitor: false,
    landingPage: { path: '/', query: {}, referrer: '', search: '', url: 'https://example.com/' },
    count: 1,
    activeSessionLength: 0,
    averageSessionLength: 0,
  },
};

describe('App committed route inputs', () => {
  let container: HTMLDivElement;
  let root: Root;
  let liveSdk: ContentfulExperiences | undefined;
  let inputs: ReturnType<typeof useNextAppAutoPageInputs>;
  function Probe() {
    inputs = useNextAppAutoPageInputs();
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
    const bound = bindNextjsAppRouterClientExperiences({ config: { components: {} } });
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
          <Experience key={routeKey} result={result}>
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
    const bound = bindNextjsAppRouterClientExperiences({ config: { components: {} } });
    const { Experience } = bound.request;
    const result = {
      requestId: 'default',
      routeKey: '/page?q=hello+world',
      experience: { experienceId: 'primary' },
      plan: { nodes: [], debug: false, diagnostics: [], metadata: { label: 'server' } },
    };
    await act(async () =>
      root.render(
        <NextjsAppRouterRequestRoot
          spaceId="space"
          environmentId="master"
          locale="en-US"
          browser={{ delivery: { host: 'https://trusted-proxy.example' }, isPreview: true }}
          defaults={{ consent: false, persistenceConsent: false }}
          cookie={{ expires: 7, path: '/page' }}
          result={result}
        >
          <Probe />
          <Experience result={result}>
            {(state) => <output>{String(state.data?.metadata.label)}</output>}
          </Experience>
        </NextjsAppRouterRequestRoot>
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
    const bound = bindNextjsAppRouterClientExperiences({ config: { components: {} } });
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
          <bound.request.ExperiencesRoot sdk={sdk} result={value}>
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

  it('loads Web-owned content on committed routes without server request results', async () => {
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
    const bound = bindNextjsAppRouterClientExperiences({ config: { components: {} } });
    const render = async () =>
      act(async () =>
        root.render(
          <bound.request.ExperiencesRoot sdk={sdk}>
            <bound.Experience experienceId="primary">
              {(state) => <output>{String(state.data?.metadata.label ?? 'Waiting')}</output>}
            </bound.Experience>
          </bound.request.ExperiencesRoot>
        )
      );
    await render();
    expect(container.textContent).toBe('Web plan');
    expect(fetchExperience).toHaveBeenCalledTimes(1);
    navigation.pathname = '/destination';
    navigation.search = '';
    window.history.replaceState(null, '', '/destination');
    await render();
    expect(container.textContent).toBe('Web plan');
    expect(fetchExperience).toHaveBeenCalledTimes(2);
  });

  it('passes client configuration and prop overrides to the shared request presentation', async () => {
    const configured = vi.fn(() => ({ properties: { path: '/configured' } }));
    const override = vi.fn(() => ({ properties: { path: '/override' } }));
    const beforeInitialPage = { run: vi.fn() };
    const bound = bindNextjsAppRouterClientExperiences({
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
    const presentation = vi.mocked(NextjsRequestPresentation).mock.calls.at(-1)![0];
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
    const bound = bindNextjsAppRouterClientExperiences({ config: { components: {} } });
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
    let current: PreviewState | undefined;
    const listeners = new Set<(value: PreviewState | undefined) => void>();
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
          subscribe(listener: (value: PreviewState | undefined) => void) {
            listeners.add(listener);
            listener(current);
            return { unsubscribe: () => listeners.delete(listener) };
          },
        },
      },
    } as unknown as ContentfulExperiences;
    await act(async () =>
      root.render(
        <NextjsAppRouterRequestAnalyticsRoot
          browser={{ delivery: { host: 'https://trusted-proxy.example' } }}
          spaceId="space"
          environmentId="master"
          sdk={sdk}
          result={{
            requestId: 'preview',
            routeKey: '/page?q=hello+world',
            experience: { experienceId: 'initial' },
          }}
        >
          <p>Server content</p>
        </NextjsAppRouterRequestAnalyticsRoot>
      )
    );
    const publish = async (experienceId: string, revision: number) =>
      act(async () => {
        current = { experienceId, revision, data: undefined, error: undefined, status: undefined };
        for (const listener of listeners) listener(current);
      });
    await publish('primary', 1);
    expect(navigation.router.refresh).not.toHaveBeenCalled();
    await publish('primary', 2);
    expect(navigation.router.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('Server content');
    expect(fetchExperience).not.toHaveBeenCalled();
  });
});
