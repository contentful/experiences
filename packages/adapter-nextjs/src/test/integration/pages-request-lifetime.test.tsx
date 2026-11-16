/** @vitest-environment jsdom */

import { useExperiences } from '@contentful/experiences-react/client';
import { CONSENT_CACHE_KEY, PERSISTENCE_CONSENT_CACHE_KEY } from '@contentful/experiences-runtime';
import { type ContentfulExperiences, type PortableRenderPlan } from '@contentful/experiences-web';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindPagesRouterExperiences } from '../../pages-router/pages-router.js';
import type { RequestResult } from '../../presentation/request-result.js';
import { profileFixture } from '../fixtures/profile.js';

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

describe('request-to-browser lifetime', () => {
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
