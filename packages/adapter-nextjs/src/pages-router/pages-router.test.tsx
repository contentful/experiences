/** @vitest-environment jsdom */
import { renderToStaticMarkup } from 'react-dom/server';

import {
  createWebSnapshotRuntime,
  type ContentfulExperiences,
  type PortableRenderPlan,
} from '@contentful/experiences-web';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestResult } from '../presentation/request-result.js';
import { profileFixture } from '../test/fixtures/profile.js';
import { bindPagesRouterExperiences, PagesRouterRequestRoot } from './pages-router.js';

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

describe('native adapter owner', () => {
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
});
