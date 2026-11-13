/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebSnapshotRuntime, type ContentfulExperiences } from '@contentful/experiences-web';
import { bindAppRouterClientExperiences } from './app-router-client.js';
import type { RequestResult } from './request-result.js';

const navigation = vi.hoisted(() => ({ pathname: '/products', search: '' }));
vi.mock('next/navigation.js', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new globalThis.URLSearchParams(navigation.search),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const serverPlan = {
  nodes: [],
  debug: false,
  diagnostics: [],
  metadata: { label: 'server' },
  experienceId: 'resolved',
};

function sdkDouble() {
  const fetchByDestinationPath = vi
    .fn()
    .mockResolvedValue({ ...serverPlan, metadata: { label: 'browser' } });
  const trackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
  const hydrateAndTrackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
  const subscribeToPreview = vi.fn(() => ({ unsubscribe() {} }));
  const sdk = {
    ...createWebSnapshotRuntime({ consent: true }),
    spaceId: 'space',
    environmentId: 'master',
    config: {},
    fetchByDestinationPath,
    fetchExperience: vi.fn(),
    trackCurrentPage,
    hydrateAndTrackCurrentPage,
    subscribeToPreview,
    reset: vi.fn(),
  } as unknown as ContentfulExperiences;
  return {
    sdk,
    fetchByDestinationPath,
    trackCurrentPage,
    hydrateAndTrackCurrentPage,
    subscribeToPreview,
  };
}

describe('App Router Destination request presentation', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.history.replaceState(null, '', '/products');
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it('adopts the server Destination plan and binds preview by its resolved id without refetching', async () => {
    const double = sdkDouble();
    const { ExperiencesRoot, Experience } = bindAppRouterClientExperiences({
      config: { components: {} },
    }).request;
    const result: RequestResult = {
      requestId: 'request',
      routeKey: '/products',
      experience: { destinationId: 'dest', path: '/products' },
      plan: serverPlan,
      handoff: {
        spaceId: 'space',
        environmentId: 'master',
        cache: { scope: 'private-request' },
      },
      initialPageOwner: 'server',
    };
    await act(async () =>
      root.render(
        <ExperiencesRoot sdk={double.sdk} result={result}>
          <Experience>
            {(state) => <output>{String(state.data?.metadata.label)}</output>}
          </Experience>
        </ExperiencesRoot>
      )
    );
    expect(container.textContent).toBe('server');
    expect(double.fetchByDestinationPath).not.toHaveBeenCalled();
    expect(double.subscribeToPreview).toHaveBeenCalledWith(
      'resolved',
      expect.anything(),
      expect.any(Function)
    );
    // Server-owned SSR page: no duplicate automatic browser page.
    expect(double.trackCurrentPage).not.toHaveBeenCalled();
  });

  it('forwards redirect results as explicit outcomes, never content or browser pages', async () => {
    const double = sdkDouble();
    const onExperienceRedirect = vi.fn();
    const { ExperiencesRoot, Experience } = bindAppRouterClientExperiences({
      config: { components: {} },
    }).request;
    const result: RequestResult = {
      requestId: 'request',
      routeKey: '/products',
      experience: { destinationId: 'dest', path: '/products' },
      redirect: { path: '/catalog' },
    };
    await act(async () =>
      root.render(
        <ExperiencesRoot sdk={double.sdk} result={result} pageMode="analytics">
          <Experience
            onExperienceRedirect={onExperienceRedirect}
            redirectFallback={(state) => <a href={state.redirect?.path}>moved</a>}
          />
        </ExperiencesRoot>
      )
    );
    expect(container.innerHTML).toBe('<a href="/catalog">moved</a>');
    expect(onExperienceRedirect).toHaveBeenCalledWith({ path: '/catalog' }, expect.anything());
    expect(double.fetchByDestinationPath).not.toHaveBeenCalled();
    expect(double.hydrateAndTrackCurrentPage).not.toHaveBeenCalled();
    expect(double.trackCurrentPage).not.toHaveBeenCalled();
  });

  it('presents a forwarded not-found result through the error state', async () => {
    const double = sdkDouble();
    const { ExperiencesRoot, Experience } = bindAppRouterClientExperiences({
      config: { components: {} },
    }).request;
    const result: RequestResult = {
      requestId: 'request',
      routeKey: '/products',
      experience: { destinationId: 'dest', nodeId: 'missing' },
      contentError: 'Experience content unavailable.',
      notFound: true,
    };
    await act(async () =>
      root.render(
        <ExperiencesRoot sdk={double.sdk} result={result}>
          <Experience errorFallback={(state) => <p>{state.error?.name}</p>} />
        </ExperiencesRoot>
      )
    );
    expect(container.textContent).toBe('NotFoundError');
  });
});
