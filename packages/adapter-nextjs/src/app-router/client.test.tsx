import { plan as createPlan } from '../test/fixtures/plan.js';
/** @vitest-environment jsdom */
import { browserSdk } from '../test/browser-sdk.js';
import { act } from 'react';
import { useExperiences } from '@contentful/experiences-react/client';
import { testRoot } from '../test/react-root.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
} from './client.js';
import {
  NextjsRequestPresentation,
  NextjsBrowserRoot,
  useNextjsRequestOptions,
} from '../presentation/router-lifetime.js';
import type { NextjsRequestResult } from '../presentation/request-result.js';

const navigation = vi.hoisted(() => ({
  pathname: '/page',
  search: 'q=hello%20world',
  router: { refresh: vi.fn() },
}));
vi.mock('../presentation/router-lifetime.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../presentation/router-lifetime.js')>();
  return {
    ...actual,
    NextjsRequestPresentation: vi.fn(actual.NextjsRequestPresentation),
    NextjsBrowserRoot: vi.fn(actual.NextjsBrowserRoot),
  };
});
vi.mock('next/navigation.js', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new globalThis.URLSearchParams(navigation.search),
  useRouter: () => navigation.router,
}));

describe('App committed route inputs', () => {
  const view = testRoot();
  let inputs: ReturnType<typeof useNextAppAutoPageInputs>;
  function Probe() {
    inputs = useNextAppAutoPageInputs();
    return null;
  }
  beforeEach(() => {
    navigation.pathname = '/page';
    navigation.search = 'q=hello%20world';
    window.history.replaceState(null, '', '/page?q=hello+world');
    vi.clearAllMocks();
  });

  it('normalizes encoded queries/hashes and keeps the last browser-confirmed retained-layout route', async () => {
    navigation.search = 'q=hello%20world&tag=a&tag=b';
    window.history.replaceState(null, '', '/page?q=hello+world&tag=a&tag=b');
    await act(async () => view.root.render(<Probe />));
    expect(inputs.routeKey).toBe('/page?q=hello+world&tag=a&tag=b');
    expect(inputs.buildPagePayload({ isInitialEmission: true })?.properties).toMatchObject({
      path: '/page',
      search: '?q=hello+world&tag=a&tag=b',
      query: { q: 'hello world', tag: ['a', 'b'] },
    });
    navigation.pathname = '/destination';
    navigation.search = 'q=changed&tag=c&tag=d';
    window.history.replaceState(null, '', '/destination?q=changed&tag=c&tag=d#anchor');
    await act(async () => view.root.render(<Probe />));
    expect(inputs.routeKey).toBe('/destination?q=changed&tag=c&tag=d');
    // Retained layouts can replay old hooks while browser history stays committed.
    navigation.pathname = '/page';
    navigation.search = 'q=hello+world&tag=a&tag=b';
    await act(async () => view.root.render(<Probe />));
    expect(inputs.routeKey).toBe('/destination?q=changed&tag=c&tag=d');
    expect(inputs.buildPagePayload({ isInitialEmission: false })?.properties).toMatchObject({
      path: '/destination',
      search: '?q=changed&tag=c&tag=d',
      query: { q: 'changed', tag: ['c', 'd'] },
    });
  });

  it('rejects restored original request inputs while accepting a fresh ID with identical plan bytes', async () => {
    const plan = createPlan({ label: 'server' });
    const { sdk, hydrateAndTrackCurrentPage } = browserSdk({ consent: true, plan });
    const { ExperiencesRoot } = bindNextjsAppRouterClientExperiences({
      config: { components: {} },
    }).request;
    let options!: ReturnType<typeof useNextjsRequestOptions>;
    function RequestProbe({ result }: { result: NextjsRequestResult }) {
      options = useNextjsRequestOptions(result);
      return null;
    }
    const render = async (pathname: string, requestId: string) => {
      navigation.pathname = pathname;
      navigation.search = '';
      window.history.replaceState(null, '', pathname);
      const result: NextjsRequestResult = {
        routeKey: pathname,
        requestId,
        experience: { experienceId: 'primary', parameters: { variant: 'retained' } },
        plan: JSON.parse(JSON.stringify(plan)),
        contentError: 'content failed',
        handoff: { spaceId: 'space', environmentId: 'master', cache: { scope: 'private-request' } },
      };
      await act(async () =>
        view.root.render(
          <ExperiencesRoot sdk={sdk} result={result}>
            <RequestProbe key={pathname} result={result} />
          </ExperiencesRoot>
        )
      );
    };
    await render('/page', 'original');
    expect(options.initialPlan).toEqual(plan);
    expect(options.initialError?.message).toBe('content failed');
    expect(hydrateAndTrackCurrentPage).toHaveBeenCalledOnce();
    await render('/destination', 'destination');
    const admitted = hydrateAndTrackCurrentPage.mock.calls.length;
    await render('/page', 'original');
    expect(options).toMatchObject({ experienceId: 'primary', parameters: { variant: 'retained' } });
    expect(options.initialPlan).toBeUndefined();
    expect(options.initialError).toBeUndefined();
    expect(hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(admitted);
    await render('/page', 'fresh');
    expect(hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(admitted + 1);
    expect(options.initialPlan).toEqual(plan);
    expect(options.initialError?.message).toBe('content failed');
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
      plan: createPlan({ label: 'server' }),
    };
    await act(async () =>
      view.root.render(
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
      locale: 'en-US',
      defaults: { consent: false, persistenceConsent: false },
    });
    expect(view.container.textContent).toBe('server');
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
    const { ExperiencesAnalyticsRoot } = bound.request;
    await act(async () =>
      view.root.render(
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
      view.root.render(
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
    expect(view.container.textContent).toBe('Server content');
    expect(fetchExperience).not.toHaveBeenCalled();
  });
  it('forwards ordinary explicit root configuration without creating a request presentation', async () => {
    const sdk = createWebSnapshotRuntime() as ContentfulExperiences;
    const defaults = { consent: false, persistenceConsent: false };
    const { ExperiencesRoot } = bindNextjsAppRouterClientExperiences({
      config: { components: {} },
      delivery: { host: 'https://trusted-proxy.example' },
      locale: 'en-US',
      defaults: { consent: true },
      consent: { clientDefaults: defaults },
    });
    await act(async () =>
      view.root.render(
        <ExperiencesRoot sdk={sdk} locale="fr-FR">
          <p>Explicit content</p>
        </ExperiencesRoot>
      )
    );
    expect(NextjsRequestPresentation).not.toHaveBeenCalled();
    expect(vi.mocked(NextjsBrowserRoot).mock.calls.at(-1)![0]).toMatchObject({
      sdk,
      locale: 'fr-FR',
      defaults,
      delivery: { host: 'https://trusted-proxy.example' },
    });
    expect(view.container.textContent).toBe('Explicit content');
  });

  it('preserves a bound static page payload on an explicit managed root', async () => {
    const initialPagePayload = { properties: { title: 'Configured page' } };
    const { ExperiencesRoot } = bindNextjsAppRouterClientExperiences({
      config: { components: {} },
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'delivery' },
      initialPagePayload,
      livePreview: { enabled: false, loadImplementation: vi.fn() },
    });
    await act(async () => view.root.render(<ExperiencesRoot />));
    expect(vi.mocked(NextjsRequestPresentation).mock.calls.at(-1)![0].initialPagePayload).toBe(
      initialPagePayload
    );
  });
});
