/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebSnapshotRuntime,
  type ContentfulExperiences,
  type PortableRenderPlan,
} from '@contentful/experiences-web';
import {
  bindNextjsPagesRouterExperiences,
  NextjsPagesRouterRequestRoot,
  NextjsPagesRouterRequestAnalyticsRoot,
} from './pages-router.js';
import type { NextjsRequestResult } from './request-result.js';

const router = vi.hoisted(() => ({
  isReady: true,
  asPath: '/pages',
  events: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('next/router.js', () => ({ useRouter: () => router }));

const firstId = '3fLAdFb3BYAuImRhcW8k4t';
const destinationId = '7u2eP09B4BIBToH8UwSHck';
const destination = '/pages/page-two';
const plan: PortableRenderPlan = { nodes: [], debug: false, diagnostics: [], metadata: {} };
const startup: NextjsRequestResult = {
  requestId: 'startup-request',
  routeKey: '/pages',
  experience: { experienceId: firstId },
  plan,
  handoff: {
    spaceId: 'space',
    environmentId: 'master',
    cache: { scope: 'private-request' },
    state: { profile: { id: 'server-profile' } },
  },
};
const navigation: NextjsRequestResult = {
  requestId: 'destination-request',
  routeKey: destination,
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
      vi.unstubAllGlobals();
    }
  });

  it('adopts the destination descriptor and page intent before completion without fetching twice', async () => {
    const { sdk, fetchExperience } = sdkFixture();
    const bound = bindNextjsPagesRouterExperiences({ config: { components: {} } });
    const tree = (experiences: NextjsRequestResult) => (
      <NextjsPagesRouterRequestRoot
        browser={{ delivery: { accessToken: 'browser-token' } }}
        spaceId="space"
        environmentId="master"
        sdk={sdk}
        result={experiences}
      >
        <bound.request.Experience key={experiences.routeKey} result={experiences}>
          {(result) => <output>{result.status}</output>}
        </bound.request.Experience>
      </NextjsPagesRouterRequestRoot>
    );

    await act(async () => root.render(tree(startup)));
    expect(container.textContent).toBe('success');
    expect(fetchExperience).not.toHaveBeenCalled();

    const start = router.events.on.mock.calls.find(([event]) => event === 'routeChangeStart')![1];
    const complete = router.events.on.mock.calls.find(
      ([event]) => event === 'routeChangeComplete'
    )![1];
    await act(async () => {
      start(destination, { shallow: false });
      root.render(tree(navigation));
    });

    // New page props have committed while the router and browser still name Home.
    expect(router.asPath).toBe('/pages');
    expect(window.location.pathname).toBe('/pages');
    expect(fetchExperience).toHaveBeenCalledTimes(1);
    expect(fetchExperience.mock.calls[0]![0]).toMatchObject({
      experienceId: destinationId,
      parameters: { variant: 'page-two' },
      personalization: {
        events: [{ type: 'page', properties: { path: destination } }],
      },
    });

    // Completion must preserve the already-settled request context, not merely
    // join an in-flight request that happens to mask a second initial intent.
    await act(async () => {
      router.asPath = destination;
      window.history.replaceState(null, '', destination);
      complete(destination, { shallow: false });
      root.render(tree(navigation));
    });
    expect(fetchExperience).toHaveBeenCalledTimes(1);
  });

  it('ignores hash, shallow and canceled transitions while committing a changed query', async () => {
    const { sdk, fetchExperience } = sdkFixture();
    const bound = bindNextjsPagesRouterExperiences({ config: { components: {} } });
    await act(async () =>
      root.render(
        <bound.request.ExperiencesRoot sdk={sdk} result={startup}>
          <bound.request.Experience result={startup} />
        </bound.request.ExperiencesRoot>
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
    await commit('/pages?q=changed');
    expect(fetchExperience).toHaveBeenCalledTimes(1);
    expect(fetchExperience.mock.calls[0]![0]).toMatchObject({
      personalization: {
        events: [{ type: 'page', properties: { path: '/pages', query: { q: 'changed' } } }],
      },
    });
  });
  it('runs the registry-free analytics path without browser content loading', async () => {
    const { sdk, fetchExperience } = sdkFixture();
    await act(async () =>
      root.render(
        <NextjsPagesRouterRequestAnalyticsRoot
          spaceId="space"
          environmentId="master"
          browser={{ delivery: { accessToken: 'browser-token' } }}
          sdk={sdk}
          result={{
            requestId: 'server-only',
            routeKey: '/pages',
            experience: { experienceId: firstId },
          }}
        >
          <p>Server HTML</p>
        </NextjsPagesRouterRequestAnalyticsRoot>
      )
    );
    expect(sdk.trackCurrentPage).toHaveBeenCalledOnce();
    expect(fetchExperience).not.toHaveBeenCalled();
    expect(container.textContent).toBe('Server HTML');
  });
});
