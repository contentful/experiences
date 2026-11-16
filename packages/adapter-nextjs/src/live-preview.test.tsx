/** @vitest-environment jsdom */
import { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useExperiences } from '@contentful/experiences-react/client';
import { ContentfulExperiences, type PortableRenderPlan } from '@contentful/experiences-web';
import type { PreviewClientFactory } from '@contentful/experiences-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindAppRouterClientExperiences } from './app-router-client.js';
import { bindPagesRouterExperiences } from './pages-router.js';
import { resolvePreview } from './preview.js';
import type { RequestResult } from './request-result.js';

const route = vi.hoisted(() => ({
  path: '/home',
  search: '',
  events: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('next/navigation.js', () => ({
  usePathname: () => route.path,
  useSearchParams: () => new globalThis.URLSearchParams(route.search),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('next/router.js', () => ({
  useRouter: () => ({ isReady: true, asPath: route.path + route.search, events: route.events }),
}));
const plan = (label: string): PortableRenderPlan => ({
  nodes: [],
  debug: false,
  diagnostics: [],
  metadata: { label },
});
function clientFactory() {
  return vi.fn<PreviewClientFactory>(() => ({
    getResult: () => ({ data: undefined, error: undefined }),
    subscribe: () => () => {},
    subscribeStatus: () => () => {},
  }));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('managed Next Live Preview', () => {
  let root: Root;
  let container: HTMLDivElement;
  let sdk: ContentfulExperiences;
  let network: ReturnType<typeof vi.fn>;
  function Probe() {
    sdk = useExperiences() as ContentfulExperiences;
    return null;
  }
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    network = vi.fn(() => {
      throw new Error('Unexpected network');
    });
    vi.stubGlobal('fetch', network);
    window.localStorage.clear();
    route.path = '/home';
    route.search = '';
    window.history.replaceState(null, '', '/home');
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(
    (['app', 'pages'] as const).flatMap((family) =>
      (['request', 'ordinary', 'request analytics', 'ordinary analytics'] as const).flatMap(
        (surface) => [true, false].map((enabled) => ({ family, surface, enabled }))
      )
    )
  )(
    '$family $surface sets URL owner mode without guessing a source (enabled=$enabled)',
    async ({ family, surface, enabled }) => {
      const createClient = clientFactory();
      const options = {
        config: { components: {} },
        spaceId: 'space',
        environmentId: 'master',
        delivery: { accessToken: 'delivery' },
        allowedEventTypes: [],
        defaults: { consent: false, persistenceConsent: false },
        preview: {
          accessToken: 'preview',
          enabled,
          createClient,
          sessionHost: 'https://preview.example.com',
          resourceResolution: 'resolved',
        },
      };
      const binding =
        family === 'app'
          ? bindAppRouterClientExperiences(options)
          : bindPagesRouterExperiences(options);
      const owner = surface.startsWith('request') ? binding.request : binding;
      const BoundRoot = surface.endsWith('analytics')
        ? owner.ExperiencesAnalyticsRoot
        : owner.ExperiencesRoot;
      route.search = '?preview_session_id=a';
      window.history.replaceState(null, '', route.path + route.search);
      await act(async () =>
        root.render(
          <BoundRoot>
            <Probe />
          </BoundRoot>
        )
      );
      expect(sdk.isPreview).toBe(enabled);
      expect(sdk.config.preview?.sessionId).toBe(enabled ? 'a' : '');
      expect(network).not.toHaveBeenCalled();
    }
  );

  it.each(['app', 'pages'] as const)(
    '%s configures one explicit context while renderer IDs stay ordinary',
    async (family) => {
      const createClient = clientFactory();
      const options = {
        config: { components: {} },
        spaceId: 'space',
        environmentId: 'master',
        delivery: { accessToken: 'delivery' },
        preview: { accessToken: 'preview', sessionId: 'session', createClient },
      };
      const binding =
        family === 'app'
          ? bindAppRouterClientExperiences(options)
          : bindPagesRouterExperiences(options);
      const subscribe = vi
        .spyOn(ContentfulExperiences.prototype, 'subscribeToPreview')
        .mockImplementation(() => ({ unsubscribe: vi.fn() }));
      const result: RequestResult = {
        requestId: 'primary',
        routeKey: '/home',
        experience: { experienceId: 'hero' },
        plan: plan('hero'),
      };
      await act(async () =>
        root.render(
          <binding.request.ExperiencesRoot result={result}>
            <Probe />
            <binding.request.Experience />
            <binding.Experience experienceId="footer" initialPlan={plan('footer')} />
          </binding.request.ExperiencesRoot>
        )
      );
      expect(sdk.config.preview?.sessionId).toBe('session');
      expect(sdk.isPreview).toBe(true);
      expect(subscribe.mock.calls.map(([id]) => id)).toEqual(['hero', 'footer']);
    }
  );

  it.each(['app', 'pages'] as const)(
    '%s preserves initial content and history guards while reconnecting session selections',
    async (family) => {
      const createClient = clientFactory();
      const options = {
        config: { components: {} },
        spaceId: 'space',
        environmentId: 'master',
        delivery: { accessToken: 'delivery' },
        allowedEventTypes: [],
        defaults: { consent: false, persistenceConsent: false },
        preview: { accessToken: 'preview', enabled: true, createClient },
      };
      const bound =
        family === 'app'
          ? bindAppRouterClientExperiences(options).request
          : bindPagesRouterExperiences(options).request;
      const pending = deferred<void>();
      let suspended = false;
      function Suspend() {
        if (suspended) throw pending.promise;
        return null;
      }
      const fetch = vi
        .spyOn(ContentfulExperiences.prototype, 'fetchExperience')
        .mockResolvedValue(plan('preview'));
      const tree = (requestId: string, session?: string) => {
        route.search = session ? '?preview_session_id=' + session : '';
        const routeKey = route.path + route.search;
        window.history.replaceState(null, '', routeKey);
        const result: RequestResult = {
          requestId,
          routeKey,
          experience: { experienceId: 'primary', personalization: { events: [] } },
          plan: plan(requestId),
        };
        return (
          <Suspense fallback="Waiting">
            <bound.ExperiencesRoot result={result}>
              <Suspend />
              <Probe />
              <bound.Experience>
                {(state) => <output>{String(state.data?.metadata.label)}</output>}
              </bound.Experience>
            </bound.ExperiencesRoot>
          </Suspense>
        );
      };
      await act(async () => root.render(tree('original', 'a')));
      const previewSdk = sdk;
      expect(sdk.isPreview).toBe(true);
      expect(createClient).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
      expect(container.textContent).toBe('original');
      const subscribe = vi.spyOn(ContentfulExperiences.prototype, 'subscribeToPreview');
      await act(async () => root.render(tree('second', 'b')));
      expect(sdk).not.toBe(previewSdk);
      expect(subscribe).toHaveBeenCalledWith('primary', expect.anything(), expect.any(Function));
      expect(createClient).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'b' }));
      suspended = true;
      await act(async () => root.render(tree('second', 'b')));
      suspended = false;
      await act(async () => pending.resolve());
      expect(sdk).not.toBe(previewSdk);
      const destroy = vi.spyOn(sdk, 'destroy');
      await act(async () => root.render(tree('ordinary')));
      expect(destroy).toHaveBeenCalledOnce();
      expect(sdk).not.toBe(previewSdk);
      expect(sdk.isPreview).toBe(false);
      // Returning to the original route must not re-adopt its original SSR plan.
      await act(async () => root.render(tree('original', 'a')));
      expect(container.textContent).toBe('preview');
      expect(fetch).toHaveBeenCalledWith(
        expect.objectContaining({ experienceId: 'primary' }),
        expect.anything(),
        expect.objectContaining({ isCurrent: expect.any(Function) })
      );
      expect(network).not.toHaveBeenCalled();
    }
  );
});

it.each([
  [false, '?preview_session_id=a', ''],
  [true, '', undefined],
  [true, '?preview_session_id=%20', undefined],
  [true, '?preview_session_id=%20a%20&preview_experience_id=other', 'a'],
] as const)(
  'activates only enabled nonempty URL sessions (%s, %s)',
  async (enabled, search, expected) => {
    const createClient = clientFactory();
    const previewOptions = resolvePreview(
      { accessToken: 'preview', enabled, createClient },
      '/' + search
    );
    expect(createClient).not.toHaveBeenCalled();
    expect(previewOptions?.sessionId).toBe(expected);
    expect(previewOptions?.createClient).toBe(createClient);
  }
);
