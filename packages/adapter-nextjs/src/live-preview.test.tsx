/** @vitest-environment jsdom */
import { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useExperiences } from '@contentful/experiences-react/client';
import { ContentfulExperiences, type PortableRenderPlan } from '@contentful/experiences-web';
import type { RuntimeLivePreviewModule } from '@contentful/experiences-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindNextjsAppRouterClientExperiences } from './app-router-client.js';
import { bindNextjsPagesRouterExperiences } from './pages-router.js';
import { resolveNextjsLivePreview } from './live-preview.js';
import type { NextjsRequestResult } from './request-result.js';

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
function implementation() {
  return {
    fetchPreviewSession: vi.fn(async () => plan('preview')),
    createLivePreviewClient: vi.fn(() => ({
      getResult: () => ({ data: undefined, error: undefined }),
      subscribe: () => () => {},
      subscribeStatus: () => () => {},
    })),
    sendPreviewStatus: vi.fn(),
  } satisfies RuntimeLivePreviewModule;
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
    vi.unstubAllGlobals();
  });

  it.each(
    (['app', 'pages'] as const).flatMap((family) =>
      (['request', 'ordinary', 'request analytics', 'ordinary analytics'] as const).flatMap(
        (surface) => [true, false].map((enabled) => ({ family, surface, enabled }))
      )
    )
  )(
    '$family $surface uses its configured preview target without a result (enabled=$enabled)',
    async ({ family, surface, enabled }) => {
      const module = implementation();
      const loadImplementation = vi.fn(async () => module);
      const options = {
        config: { components: {} },
        spaceId: 'space',
        environmentId: 'master',
        delivery: { accessToken: 'delivery' },
        preview: { accessToken: 'preview' },
        allowedEventTypes: [],
        defaults: { consent: false, persistenceConsent: false },
        livePreview: {
          enabled,
          experienceId: 'primary',
          loadImplementation,
          sessionHost: 'https://preview.example.com',
          resourceResolution: 'resolved',
        },
      };
      const binding =
        family === 'app'
          ? bindNextjsAppRouterClientExperiences(options)
          : bindNextjsPagesRouterExperiences(options);
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
      expect(loadImplementation).toHaveBeenCalledTimes(enabled ? 1 : 0);
      if (enabled) {
        expect(sdk.config.livePreview?.experienceId).toBe('primary');
        expect(module.createLivePreviewClient).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: 'a',
            sessionHost: 'https://preview.example.com',
            resourceResolution: 'resolved',
          })
        );
      }
      const send = vi
        .spyOn(sdk.api.personalization, 'upsertProfile')
        .mockResolvedValue({} as never);
      await act(async () => {
        sdk.consent({ events: true });
        await expect(sdk.track({ event: 'explicit-action' })).resolves.toMatchObject({
          accepted: !enabled,
        });
      });
      const events = send.mock.calls.flatMap(([request]) => request.events ?? []);
      expect(events.filter((event) => event.type === 'track')).toHaveLength(enabled ? 0 : 1);
      if (enabled) expect(send).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
    }
  );

  it.each(['app', 'pages'] as const)(
    '%s preserves initial content, replaces sessions in place and keeps history guards through mode changes',
    async (family) => {
      const module = implementation();
      const loadImplementation = vi.fn(async () => module);
      const options = {
        config: { components: {} },
        spaceId: 'space',
        environmentId: 'master',
        delivery: { accessToken: 'delivery' },
        preview: { accessToken: 'preview' },
        allowedEventTypes: [],
        defaults: { consent: false, persistenceConsent: false },
        livePreview: { enabled: true, experienceId: 'fallback', loadImplementation },
      };
      const bound =
        family === 'app'
          ? bindNextjsAppRouterClientExperiences(options).request
          : bindNextjsPagesRouterExperiences(options).request;
      const pending = deferred<void>();
      let suspended = false;
      function Suspend() {
        if (suspended) throw pending.promise;
        return null;
      }
      const tree = (requestId: string, session?: string) => {
        route.search = session ? '?preview_session_id=' + session : '';
        const routeKey = route.path + route.search;
        window.history.replaceState(null, '', routeKey);
        const result: NextjsRequestResult = {
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
      expect(sdk.config.livePreview?.experienceId).toBe('primary');
      expect(loadImplementation).toHaveBeenCalledOnce();
      expect(module.fetchPreviewSession).not.toHaveBeenCalled();
      expect(container.textContent).toBe('original');
      const replace = vi.spyOn(sdk, 'replaceLivePreview');
      await act(async () => root.render(tree('second', 'b')));
      expect(sdk).toBe(previewSdk);
      expect(replace).toHaveBeenCalledOnce();
      expect(sdk.states.preview.current?.sessionId).toBe('b');
      expect(module.createLivePreviewClient).toHaveBeenLastCalledWith(
        expect.objectContaining({ sessionId: 'b' })
      );
      suspended = true;
      await act(async () => root.render(tree('second', 'b')));
      suspended = false;
      await act(async () => pending.resolve());
      expect(sdk).not.toBe(previewSdk);
      expect(sdk.states.preview.current?.sessionId).toBe('b');
      const destroy = vi.spyOn(sdk, 'destroy');
      await act(async () => root.render(tree('ordinary')));
      expect(destroy).toHaveBeenCalledOnce();
      expect(sdk).not.toBe(previewSdk);
      expect(sdk.isPreview).toBe(false);
      // Returning to the original route must not re-adopt its original SSR plan.
      await act(async () => root.render(tree('original', 'a')));
      expect(container.textContent).toBe('preview');
      expect(module.fetchPreviewSession).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'a' }),
        expect.anything(),
        expect.anything()
      );
      expect(network).not.toHaveBeenCalled();
    }
  );
});

it.each([
  [false, '?preview_session_id=a', undefined],
  [true, '', undefined],
  [true, '?preview_session_id=%20', undefined],
  [true, '?preview_session_id=%20a%20&preview_experience_id=other', 'a'],
] as const)(
  'activates only enabled nonempty URL sessions (%s, %s)',
  async (enabled, search, expected) => {
    const loadImplementation = vi.fn(async () => implementation());
    const previewOptions = resolveNextjsLivePreview(
      { enabled, loadImplementation, experienceId: 'fallback' },
      '/' + search,
      'primary'
    );
    expect(loadImplementation).not.toHaveBeenCalled();
    expect(previewOptions === undefined).toBe(expected === undefined);
    if (previewOptions) {
      expect(previewOptions).toMatchObject({ experienceId: 'primary', sessionId: expected });
      await previewOptions.loadImplementation();
      expect(loadImplementation).toHaveBeenCalledOnce();
    }
  }
);
