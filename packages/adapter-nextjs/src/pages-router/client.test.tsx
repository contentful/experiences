/** @vitest-environment jsdom */
import { plan as createPlan } from '../test/fixtures/plan.js';
import { browserSdk } from '../test/browser-sdk.js';
import { profile } from '../test/fixtures/profile.js';

import { act } from 'react';
import { testRoot } from '../test/react-root.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ContentfulExperiences } from '@contentful/experiences-web';
import { useExperiences } from '@contentful/experiences-react/client';
import { bindNextjsPagesRouterExperiences } from './client.js';
import type { NextjsRequestResult } from '../presentation/request-result.js';

const router = vi.hoisted(() => ({
  isReady: true,
  asPath: '/pages',
  events: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('next/router.js', () => ({ useRouter: () => router }));

const firstId = '3fLAdFb3BYAuImRhcW8k4t';
const destinationId = '7u2eP09B4BIBToH8UwSHck';
const destination = '/pages/page-two';
const plan = createPlan();
const startup: NextjsRequestResult = {
  requestId: 'startup-request',
  routeKey: '/pages',
  experience: { experienceId: firstId },
  plan,
  handoff: {
    spaceId: 'space',
    environmentId: 'master',
    cache: { scope: 'private-request' },
    state: {
      profile: profile(),
    },
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

describe('Pages managed request sequence', () => {
  const view = testRoot();

  beforeEach(() => {
    vi.clearAllMocks();
    router.isReady = true;
    router.asPath = '/pages';
    window.history.replaceState(null, '', router.asPath);
  });

  it('adopts the destination descriptor and page intent before completion without fetching twice', async () => {
    const { sdk, fetchExperience } = browserSdk({ consent: true, plan });
    const { ExperiencesRoot, Experience } = bindNextjsPagesRouterExperiences({
      config: { components: {} },
    });
    const tree = (experiences: NextjsRequestResult) => (
      <ExperiencesRoot
        delivery={{ accessToken: 'browser-token' }}
        spaceId="space"
        environmentId="master"
        sdk={sdk}
        result={experiences}
      >
        <Experience key={experiences.routeKey} result={experiences}>
          {(result) => <output>{result.status}</output>}
        </Experience>
      </ExperiencesRoot>
    );

    await act(async () => view.root.render(tree(startup)));
    expect(view.container.textContent).toBe('success');
    expect(fetchExperience).not.toHaveBeenCalled();

    const start = router.events.on.mock.calls.find(([event]) => event === 'routeChangeStart')![1];
    const complete = router.events.on.mock.calls.find(
      ([event]) => event === 'routeChangeComplete'
    )![1];
    await act(async () => {
      start(destination, { shallow: false });
      view.root.render(tree(navigation));
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
      view.root.render(tree(navigation));
    });
    expect(fetchExperience).toHaveBeenCalledTimes(1);
  });

  it('ignores hash, shallow and canceled transitions while committing a changed query', async () => {
    const { sdk, fetchExperience } = browserSdk({ consent: true, plan });
    const { ExperiencesRoot, Experience } = bindNextjsPagesRouterExperiences({
      config: { components: {} },
    });
    await act(async () =>
      view.root.render(
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
    await commit('/pages?q=changed&tag=first&tag=last');
    expect(fetchExperience).toHaveBeenCalledTimes(1);
    expect(fetchExperience.mock.calls[0]![0]).toMatchObject({
      personalization: {
        events: [
          {
            type: 'page',
            properties: {
              path: '/pages',
              search: '?q=changed&tag=first&tag=last',
              query: { q: 'changed', tag: ['first', 'last'] },
              url: window.location.href,
            },
          },
        ],
      },
    });
  });
  it('runs the bound analytics root without browser content loading', async () => {
    const { sdk, fetchExperience } = browserSdk({ consent: true, plan });
    const { ExperiencesAnalyticsRoot } = bindNextjsPagesRouterExperiences({
      config: { components: {} },
    });
    await act(async () =>
      view.root.render(
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
    expect(view.container.textContent).toBe('Server HTML');
  });
  it('updates preview on committed shallow queries without changing page intent', async () => {
    let current!: ContentfulExperiences;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    function Probe() {
      current = useExperiences() as ContentfulExperiences;
      return null;
    }
    const { ExperiencesRoot } = bindNextjsPagesRouterExperiences({
      config: { components: {} },
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'delivery' },
      preview: { accessToken: 'preview' },
      allowedEventTypes: [],
      livePreview: {
        enabled: true,
        loadImplementation: async () => ({
          fetchPreviewSession: vi.fn(),
          sendPreviewStatus() {},
          createLivePreviewClient() {
            throw new Error('No socket in this test');
          },
        }),
      },
    });
    await act(async () =>
      view.root.render(
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
    await shallow('a');
    expect(current.isPreview).toBe(true);
    const owner = current;
    await shallow('b');
    expect(current).toBe(owner);
    expect(current.states.preview.current?.sessionId).toBe('b');
    await shallow('');
    expect(current.isPreview).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
