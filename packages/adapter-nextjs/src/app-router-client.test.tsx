/** @vitest-environment jsdom */
import { act } from 'react';
import { useExperiences, useExperiencesActions } from '@contentful/experiences-react/client';
import { createRoot, type Root } from 'react-dom/client';
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

describe('App committed route inputs', () => {
  let container: HTMLDivElement;
  let root: Root;
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
    vi.unstubAllGlobals();
  });

  it('normalizes encoded queries/hashes and keeps the last browser-confirmed retained-layout route', async () => {
    await act(async () => root.render(<Probe />));
    expect(inputs.routeKey).toBe('/page?q=hello+world');
    expect(inputs.buildPagePayload({ isInitialEmission: true })?.properties).toMatchObject({
      path: '/page',
      query: { q: 'hello world' },
    });
    navigation.pathname = '/destination';
    navigation.search = 'q=changed';
    window.history.replaceState(null, '', '/destination?q=changed#anchor');
    await act(async () => root.render(<Probe />));
    expect(inputs.routeKey).toBe('/destination?q=changed');
    // Retained layouts can replay old hooks while browser history stays committed.
    navigation.pathname = '/page';
    navigation.search = 'q=hello+world';
    await act(async () => root.render(<Probe />));
    expect(inputs.routeKey).toBe('/destination?q=changed');
    expect(inputs.buildPagePayload({ isInitialEmission: false })?.properties).toMatchObject({
      path: '/destination',
      query: { q: 'changed' },
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
      state: {
        profile: {
          id: 'server-profile',
          stableId: 'server-profile',
          random: 0.5,
          audiences: [],
          traits: {},
          location: {},
          session: {
            isReturningVisitor: false,
            landingPage: {
              path: '/',
              query: {},
              referrer: '',
              search: '',
              url: 'https://example.com/',
            },
            count: 1,
            activeSessionLength: 0,
            averageSessionLength: 0,
          },
        },
      },
    };
    const tree = (routeKey: string, requestId: string, seed = true) => {
      const result = {
        routeKey,
        requestId,
        experience: { experienceId: 'primary' },
        handoff: seed ? JSON.parse(JSON.stringify(handoff)) : undefined,
        plan: seed ? JSON.parse(JSON.stringify(startupPlan)) : undefined,
      };
      return (
        <bound.request.ExperiencesRoot sdk={sdk} result={result}>
          <Actions />
          <bound.request.Experience key={routeKey} result={result}>
            {(state) => <output>{String(state.data?.metadata.label)}</output>}
          </bound.request.Experience>
        </bound.request.ExperiencesRoot>
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
          <bound.request.Experience result={result}>
            {(state) => <output>{String(state.data?.metadata.label)}</output>}
          </bound.request.Experience>
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

  it('passes client configuration and prop overrides to the shared request presentation', async () => {
    const configured = vi.fn(() => ({ properties: { path: '/configured' } }));
    const override = vi.fn(() => ({ properties: { path: '/override' } }));
    const beforeInitialPage = { run: vi.fn() };
    const bound = bindNextjsAppRouterClientExperiences({
      config: { components: {} },
      buildPagePayload: configured,
      beforeInitialPage,
    });
    await act(async () =>
      root.render(
        <bound.request.ExperiencesAnalyticsRoot
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
    const tree = () => (
      <bound.ExperiencesRoot
        sdk={sdk}
        handoff={{ spaceId: 'space', environmentId: 'master', cache: { scope: 'private-request' } }}
      >
        <bound.Experience key={navigation.pathname} experienceId="primary" initialPlan={plan} />
      </bound.ExperiencesRoot>
    );
    await act(async () => root.render(tree()));
    navigation.pathname = '/destination';
    navigation.search = '';
    window.history.replaceState(null, '', '/destination');
    await act(async () => root.render(tree()));
    expect(fetchExperience).not.toHaveBeenCalled();
    expect(hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(2);
  });

  it('refreshes the current server presentation when the retained request result names an older Experience', async () => {
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
          experienceId="primary"
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
    await publish('initial', 10);
    await publish('initial', 11);
    expect(navigation.router.refresh).not.toHaveBeenCalled();
    await publish('primary', 1);
    expect(navigation.router.refresh).not.toHaveBeenCalled();
    await publish('primary', 2);
    expect(navigation.router.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('Server content');
    expect(fetchExperience).not.toHaveBeenCalled();
  });
});
