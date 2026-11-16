/** @vitest-environment jsdom */
import {
  ContentfulExperiences,
  createWebSnapshotRuntime,
  type States,
} from '@contentful/experiences-web';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestPresentation } from '../presentation/router-lifetime.js';
import {
  AppRouterRequestAnalyticsRoot,
  AppRouterRequestRoot,
  bindAppRouterClientExperiences,
  useAppAutoPageInputs,
} from './app-router-client.js';

const navigation = vi.hoisted(() => ({
  pathname: '/page',
  search: 'q=hello%20world',
  router: { refresh: vi.fn(), replace: vi.fn() },
}));
vi.mock('../presentation/router-lifetime.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../presentation/router-lifetime.js')>();
  return { ...actual, RequestPresentation: vi.fn(actual.RequestPresentation) };
});
vi.mock('next/navigation.js', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new globalThis.URLSearchParams(navigation.search),
  useRouter: () => navigation.router,
}));

import { appRequestSdkFixture as sdkFixture } from '../test/request-sdk.js';

describe('native adapter owner', () => {
  let container: HTMLDivElement;
  let root: Root;
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

  it.each(['/selected', 'https://example.com/outside'])(
    'validates default destination navigation: %s',
    async (path) => {
      const binding = bindAppRouterClientExperiences({ config: { components: {} } });
      const { sdk, fetchExperience } = sdkFixture();
      fetchExperience.mockResolvedValue({ redirect: { path } });
      function Destination() {
        binding.useManagedExperience({ destinationId: 'site', path: '/page' });
        return null;
      }
      const rendering = Promise.resolve(
        act(async () =>
          root.render(
            <binding.ExperiencesRoot sdk={sdk}>
              <Destination />
            </binding.ExperiencesRoot>
          )
        )
      );
      if (path === '/selected') {
        await rendering;
        expect(navigation.router.replace).toHaveBeenCalledExactlyOnceWith(path);
      } else {
        await expect(rendering).rejects.toThrow(TypeError);
        expect(navigation.router.replace).not.toHaveBeenCalled();
      }
      expect(fetchExperience).toHaveBeenCalledOnce();
    }
  );

  it('navigates a terminal destination result without resolving or replaying it', async () => {
    const binding = bindAppRouterClientExperiences({ config: { components: {} } });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await act(async () =>
      root.render(
        <binding.request.Experience
          result={{
            requestId: 'redirect',
            routeKey: '/page?q=hello+world',
            experience: { destinationId: 'site', path: '/page' },
            redirect: { path: '/target' },
          }}
        />
      )
    );
    expect(navigation.router.replace).toHaveBeenCalledExactlyOnceWith('/target');
    expect(fetch).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

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
});
