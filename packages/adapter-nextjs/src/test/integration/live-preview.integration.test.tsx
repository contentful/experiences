/** @vitest-environment jsdom */
import { act, Suspense } from 'react';
import { testRoot } from '../dom-root.js';
import { useExperiences } from '@contentful/experiences-react/client';
import type { ContentfulExperiences } from '@contentful/experiences-web';
import type { LivePreviewModule } from '@contentful/experiences-runtime';
import { beforeEach, expect, it, vi } from 'vitest';
import { useInitialData } from '../../presentation/router-lifetime.js';
import { bindAppRouterClientExperiences } from '../../app-router/client.js';

const route = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation.js', () => ({
  usePathname: () => '/home',
  useSearchParams: () => new globalThis.URLSearchParams(route.search),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const view = testRoot();
beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network');
    })
  );
});

it('forwards current preview bindings while preserving Next request history across owner replacement', async () => {
  const module = {
    fetchPreviewSession: vi.fn(),
    createLivePreviewClient: vi.fn(() => ({
      getResult: () => ({ data: undefined, error: undefined }),
      subscribe: () => () => {},
      subscribeStatus: () => () => {},
    })),
    sendPreviewStatus: vi.fn(),
  } satisfies LivePreviewModule;
  const livePreview = { enabled: true, loadImplementation: async () => module };
  const { ExperiencesRoot } = bindAppRouterClientExperiences({
    config: { components: {} },
    spaceId: 'space',
    environmentId: 'master',
    delivery: { accessToken: 'delivery' },
    preview: { accessToken: 'preview' },
    allowedEventTypes: [],
    defaults: { consent: false, persistenceConsent: false },
    livePreview,
  }).request;
  let sdk!: ContentfulExperiences;
  let canAdoptOriginal!: boolean;
  function Probe() {
    sdk = useExperiences() as ContentfulExperiences;
    canAdoptOriginal = useInitialData('original');
    return null;
  }
  let resume!: () => void;
  const pending = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let suspended = false;
  function Suspend() {
    if (suspended) throw pending;
    return null;
  }
  const tree = (session?: string) => {
    route.search = session ? '?preview_session_id=' + session : '';
    const routeKey = '/home' + route.search;
    window.history.replaceState(null, '', routeKey);
    return (
      <Suspense fallback="Waiting">
        <ExperiencesRoot
          result={{
            requestId: 'original',
            routeKey,
            experience: { experienceId: 'primary', personalization: { events: [] } },
          }}
        >
          <Suspend />
          <Probe />
        </ExperiencesRoot>
      </Suspense>
    );
  };
  await act(async () => view.root.render(tree('a')));
  expect(canAdoptOriginal).toBe(true);
  const initial = sdk;
  const replace = vi.spyOn(sdk, 'replaceLivePreview');
  await act(async () => view.root.render(tree('b')));
  expect(sdk).toBe(initial);
  expect(replace).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      experienceId: 'primary',
      sessionId: 'b',
    })
  );
  suspended = true;
  await act(async () => view.root.render(tree('b')));
  suspended = false;
  await act(async () => resume());
  // React owns reactivation; Next must supply the latest binding to its captured factory.
  expect(module.createLivePreviewClient).toHaveBeenLastCalledWith(
    expect.objectContaining({ sessionId: 'b' })
  );
  const previewOwner = sdk;
  await act(async () => view.root.render(tree()));
  expect(sdk).not.toBe(previewOwner);
  expect(sdk.isPreview).toBe(false);
  await act(async () => view.root.render(tree('a')));
  expect(canAdoptOriginal).toBe(false);
});
