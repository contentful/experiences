/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { CONSENT_CACHE_KEY, PERSISTENCE_CONSENT_CACHE_KEY } from '@contentful/experiences-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebSnapshotRuntime,
  type ContentfulExperiences,
  type PortableRenderPlan,
} from '@contentful/experiences-web';
import { useExperiences } from '@contentful/experiences-react/client';
import { bindPagesRouterExperiences, PagesRouterRequestRoot } from './pages-router.js';
import { profileFixture } from '../../adapter-react/src/test/profile.js';
import type { RequestResult } from './request-result.js';

const router = vi.hoisted(() => ({
  isReady: true,
  replace: vi.fn(),
  asPath: '/pages',
  events: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('next/router.js', () => ({ useRouter: () => router }));

const firstId = '3fLAdFb3BYAuImRhcW8k4t';
const destinationId = '7u2eP09B4BIBToH8UwSHck';
const destination = '/pages/page-two';
const plan: PortableRenderPlan = { nodes: [], debug: false, diagnostics: [], metadata: {} };
const startup: RequestResult = {
  requestId: 'startup-request',
  routeKey: '/pages',
  experience: { experienceId: firstId },
  plan,
  handoff: {
    spaceId: 'space',
    environmentId: 'master',
    cache: { scope: 'private-request' },
    state: {
      profile: profileFixture('server-profile'),
    },
  },
};
const navigation: RequestResult = {
  requestId: 'destination-request',
  routeKey: destination,
  plan,
  handoff: startup.handoff,
  experience: {
    experienceId: destinationId,
    parameters: { variant: 'page-two' },
  },
};

function sdkFixture() {
  const fetchExperience = vi.fn<ContentfulExperiences['fetchExperience']>().mockResolvedValue(plan);
  const hydrateAndTrackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
  const sdk = {
    ...createWebSnapshotRuntime({ consent: true }),
    spaceId: 'space',
    environmentId: 'master',
    config: {},
    fetchExperience,
    hydrateAndTrackCurrentPage,
    trackCurrentPage: vi.fn().mockResolvedValue({ accepted: true }),
    reset: vi.fn(),
    subscribeToPreview: () => ({ unsubscribe() {} }),
  } as unknown as ContentfulExperiences;
  return { sdk, fetchExperience, hydrateAndTrackCurrentPage };
}

describe('Pages managed request sequence', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    router.isReady = true;
    router.asPath = '/pages';
    window.history.replaceState(null, '', router.asPath);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    try {
      await act(async () => root.unmount());
    } finally {
      container.remove();
      window.localStorage.clear();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('uses native navigation for browser-managed destination redirects', async () => {
    const binding = bindPagesRouterExperiences({ config: { components: {} } });
    const { sdk, fetchExperience } = sdkFixture();
    fetchExperience.mockResolvedValueOnce({ redirect: { path: '/selected' } });
    await act(async () =>
      root.render(
        <binding.ExperiencesRoot sdk={sdk}>
          <binding.Experience destinationId="site" path="/pages" />
        </binding.ExperiencesRoot>
      )
    );
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/selected');
    expect(fetchExperience).toHaveBeenCalledOnce();
  });

  it('navigates a terminal destination result without resolving or replaying it', async () => {
    const binding = bindPagesRouterExperiences({ config: { components: {} } });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await act(async () =>
      root.render(
        <binding.request.Experience
          result={{
            requestId: 'redirect',
            routeKey: '/pages',
            experience: { destinationId: 'site', nodeId: 'node' },
            redirect: { path: '/target' },
          }}
        />
      )
    );
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/target');
    expect(fetch).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('retains bound consent denial when the root defaults prop is undefined', async () => {
    const keys = [CONSENT_CACHE_KEY, PERSISTENCE_CONSENT_CACHE_KEY];
    for (const key of keys) window.localStorage.setItem(key, 'accepted');
    const { ExperiencesRoot } = bindPagesRouterExperiences({
      config: { components: {} },
      spaceId: 'space',
      environmentId: 'master',
      delivery: { host: 'https://trusted-proxy.example' },
      consent: { clientDefaults: { consent: false, persistenceConsent: false } },
    });
    await act(async () => root.render(<ExperiencesRoot defaults={undefined} />));
    for (const key of keys) expect(window.localStorage.getItem(key)).toBe('denied');
  });

  it('adopts SSR startup and destination results, then restores browser page ownership after departure', async () => {
    let current!: ContentfulExperiences;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    function Probe() {
      current = useExperiences() as ContentfulExperiences;
      return null;
    }
    const {
      request: { ExperiencesRoot, Experience },
    } = bindPagesRouterExperiences({
      config: { components: {} },
      spaceId: 'space',
      environmentId: 'master',
      delivery: { host: 'https://trusted-proxy.example' },
      allowedEventTypes: [],
      consent: { clientDefaults: { consent: false, persistenceConsent: false } },
    });
    const initial = { ...startup, initialPageOwner: 'server' as const };
    const tree = (result: RequestResult) => (
      <ExperiencesRoot result={result}>
        <Probe />
        <Experience key={result.routeKey}>{(state) => <output>{state.status}</output>}</Experience>
      </ExperiencesRoot>
    );
    await act(async () => root.render(tree(initial)));
    expect(current.states.profile.current?.id).toBe('server-profile');
    expect(container.textContent).toBe('success');
    expect(fetch).not.toHaveBeenCalled();
    const fetchExperience = vi.spyOn(current, 'fetchExperience').mockResolvedValue(plan);
    vi.spyOn(current.api.personalization, 'upsertProfile').mockResolvedValue({
      profile: profileFixture('server-profile'),
      changes: [],
      selectedOptimizations: [],
    });
    const page = vi.spyOn(current, 'trackCurrentPage');
    await act(async () => {
      current.consent({ events: true });
    });
    expect(page).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    const start = router.events.on.mock.calls.find(([event]) => event === 'routeChangeStart')![1];
    const complete = router.events.on.mock.calls.find(
      ([event]) => event === 'routeChangeComplete'
    )![1];
    await act(async () => {
      start(destination, { shallow: false });
      root.render(tree(navigation));
    });
    // Destination props commit before the Pages router/browser URL catches up.
    expect(router.asPath).toBe('/pages');
    expect(window.location.pathname).toBe('/pages');
    expect(container.textContent).toBe('success');
    expect(fetchExperience).not.toHaveBeenCalled();
    await act(async () => {
      router.asPath = destination;
      window.history.replaceState(null, '', destination);
      complete(destination, { shallow: false });
      root.render(tree(navigation));
    });
    // Completion does not repeat the page emitted when destination props committed.
    expect(page).toHaveBeenCalledOnce();
    expect(fetchExperience).not.toHaveBeenCalled();
    await act(async () => {
      router.asPath = '/pages';
      window.history.replaceState(null, '', router.asPath);
      complete(router.asPath, { shallow: false });
      root.render(tree(initial));
    });
    // Restored history uses ordinary managed fetch with fresh browser page intent.
    expect(fetchExperience).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        personalization: {
          events: [{ type: 'page', properties: expect.objectContaining({ path: '/pages' }) }],
        },
      }),
      expect.anything(),
      expect.objectContaining({ isCurrent: expect.any(Function) })
    );
  });

  it('ignores hash, shallow and canceled transitions and waits for matching query props', async () => {
    const { sdk, fetchExperience } = sdkFixture();
    const {
      request: { ExperiencesRoot, Experience },
    } = bindPagesRouterExperiences({
      config: { components: {} },
    });
    await act(async () =>
      root.render(
        <ExperiencesRoot sdk={sdk} result={startup}>
          <Experience result={startup} />
        </ExperiencesRoot>
      )
    );
    const listener = (name: string) =>
      router.events.on.mock.calls.find(([event]) => event === name)![1];
    const commit = async (url: string, shallow = false) =>
      act(async () => {
        listener('routeChangeStart')(url, { shallow });
        router.asPath = url;
        window.history.replaceState(null, '', url);
        listener('routeChangeComplete')(url, { shallow });
      });
    await commit('/pages#section');
    await commit('/pages?q=shallow', true);
    await act(async () => {
      listener('routeChangeStart')('/canceled', { shallow: false });
      listener('routeChangeError')();
    });
    expect(fetchExperience).not.toHaveBeenCalled();
    const routeKey = '/pages?q=changed&tag=first&tag=last';
    await commit(routeKey);
    expect(fetchExperience).not.toHaveBeenCalled();
    const result = { ...startup, requestId: 'query-request', routeKey };
    await act(async () =>
      root.render(
        <ExperiencesRoot sdk={sdk} result={result}>
          <Experience result={result}>{(value) => <output>{value.status}</output>}</Experience>
        </ExperiencesRoot>
      )
    );
    expect(container.textContent).toBe('success');
    expect(fetchExperience).not.toHaveBeenCalled();
  });

  it('keeps ordinary managed Web content and repeated query values available', async () => {
    const { sdk, fetchExperience } = sdkFixture();
    const bound = bindPagesRouterExperiences({ config: { components: {} } });
    await act(async () =>
      root.render(
        <bound.ExperiencesRoot
          sdk={sdk}
          routeKey="/pages?q=changed&tag=first&tag=last"
          buildPagePayload={() => ({
            properties: { path: '/pages', query: { q: 'changed', tag: ['first', 'last'] } },
          })}
        >
          <bound.Experience experienceId={firstId} />
        </bound.ExperiencesRoot>
      )
    );
    expect(fetchExperience).toHaveBeenCalledTimes(1);
    expect(fetchExperience.mock.calls[0]![0]).toMatchObject({
      experienceId: firstId,
      personalization: {
        events: [{ type: 'page', properties: { query: { tag: ['first', 'last'] } } }],
      },
    });
  });

  it.each(['bound', 'standalone'] as const)(
    'waits for readiness before adopting request content (%s)',
    async (kind) => {
      const { sdk, fetchExperience } = sdkFixture();
      const bound = bindPagesRouterExperiences({ config: { components: {} } });
      const Owner = kind === 'bound' ? bound.request.ExperiencesRoot : PagesRouterRequestRoot;
      router.isReady = false;
      let result: RequestResult | undefined;
      const tree = () => (
        <Owner
          spaceId="space"
          environmentId="master"
          browser={{ delivery: { accessToken: 'browser-token' } }}
          sdk={sdk}
          result={result}
        >
          <bound.request.Experience>
            {(value) => <output>{value.status}</output>}
          </bound.request.Experience>
        </Owner>
      );
      await act(async () => root.render(tree()));
      expect(container.textContent).not.toBe('success');
      expect(fetchExperience).not.toHaveBeenCalled();
      result = startup;
      await act(async () => root.render(tree()));
      expect(container.textContent).not.toBe('success');
      expect(fetchExperience).not.toHaveBeenCalled();
      router.isReady = true;
      await act(async () => root.render(tree()));
      expect(container.textContent).toBe('success');
      expect(fetchExperience).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])(
    'requires a request result outside request roots (plain preview root=%s)',
    (preview) => {
      const bound = bindPagesRouterExperiences({
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

  it('waits for matching analytics props before emitting a direct page', async () => {
    const { sdk, fetchExperience, hydrateAndTrackCurrentPage } = sdkFixture();
    const beforeInitialPage = { run: vi.fn() };
    const bound = bindPagesRouterExperiences({
      config: { components: {} },
      beforeInitialPage,
    });
    const tree = (result: RequestResult) => (
      <bound.request.ExperiencesAnalyticsRoot sdk={sdk} result={result}>
        <p>Server HTML</p>
      </bound.request.ExperiencesAnalyticsRoot>
    );
    await act(async () => root.render(tree(startup)));
    const complete = router.events.on.mock.calls.find(
      ([event]) => event === 'routeChangeComplete'
    )![1];
    vi.clearAllMocks();
    await act(async () => {
      router.asPath = destination;
      window.history.replaceState(null, '', destination);
      complete(destination, { shallow: false });
      root.render(tree(startup));
    });
    expect(sdk.trackCurrentPage).not.toHaveBeenCalled();
    expect(beforeInitialPage.run).not.toHaveBeenCalled();
    await act(async () => root.render(tree(navigation)));
    expect(hydrateAndTrackCurrentPage).toHaveBeenCalledOnce();
    expect(sdk.trackCurrentPage).not.toHaveBeenCalled();
    expect(fetchExperience).not.toHaveBeenCalled();
  });

  it('runs the bound analytics root without browser content loading', async () => {
    const { sdk, fetchExperience } = sdkFixture();
    const {
      request: { ExperiencesAnalyticsRoot },
    } = bindPagesRouterExperiences({
      config: { components: {} },
    });
    await act(async () =>
      root.render(
        <ExperiencesAnalyticsRoot
          spaceId="space"
          environmentId="master"
          delivery={{ accessToken: 'browser-token' }}
          sdk={sdk}
          result={{
            requestId: 'server-only',
            routeKey: '/pages',
            experience: { experienceId: firstId },
          }}
        >
          <p>Server HTML</p>
        </ExperiencesAnalyticsRoot>
      )
    );
    expect(sdk.trackCurrentPage).toHaveBeenCalledOnce();
    expect(fetchExperience).not.toHaveBeenCalled();
    expect(container.textContent).toBe('Server HTML');
  });
  it('updates preview on committed shallow queries without changing page intent', async () => {
    let current!: ContentfulExperiences;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    function Probe() {
      current = useExperiences() as ContentfulExperiences;
      return null;
    }
    const {
      request: { ExperiencesRoot },
    } = bindPagesRouterExperiences({
      config: { components: {} },
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'delivery' },
      allowedEventTypes: [],
      preview: {
        accessToken: 'preview',
        createClient() {
          throw new Error('No socket in this test');
        },
      },
    });
    await act(async () =>
      root.render(
        <ExperiencesRoot result={{ ...startup, requestId: 'shallow' }}>
          <Probe />
        </ExperiencesRoot>
      )
    );
    const complete = router.events.on.mock.calls.find(
      ([name]) => name === 'routeChangeComplete'
    )![1];
    const shallow = async (session: string) =>
      act(async () => {
        router.asPath = '/pages?preview_session_id=' + session;
        window.history.replaceState(null, '', router.asPath);
        complete(router.asPath, { shallow: true });
      });
    expect(current.isPreview).toBe(false);
    expect(current.states.profile.current?.id).toBe('server-profile');
    await shallow('a');
    expect(current.isPreview).toBe(true);
    const owner = current;
    await shallow('b');
    expect(current).not.toBe(owner);
    expect(current.isPreview).toBe(true);
    await shallow('');
    expect(current.isPreview).toBe(false);
    expect(current.states.profile.current).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
