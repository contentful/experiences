/** @vitest-environment jsdom */

import { act, type HTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceSdk } from '../test/managed-experience.js';
import { createDomTestRoot, type DomTestRoot } from '../test/dom-root.js';
import {
  bindTanStackRouterExperiences,
  type AutoPageEmissionContext,
  type TanStackRouterAutoPageContext,
  type TanStackRouterExperiencesProviderProps,
} from './tanstack-router.js';

const { useRouter, useRouterState } = vi.hoisted(() => ({
  useRouter: vi.fn(),
  useRouterState: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({ useRouter, useRouterState }));
const config = {
  components: {
    hero: ({ title, ...props }: HTMLAttributes<HTMLElement> & { title: string }) => (
      <h1 {...props}>{title}</h1>
    ),
  },
};

const { ExperiencesProvider, Experience } = bindTanStackRouterExperiences({
  config,
});

interface TestLocation {
  pathname: string;
  searchStr: string;
  hash: string;
  href: string;
  state: { key: string };
}
interface TestRouterState {
  location: TestLocation;
  resolvedLocation?: TestLocation;
  matches: object[];
}

describe('TanStack Router mapping', () => {
  let view: DomTestRoot;
  let source: ReturnType<typeof sourceSdk>;
  let location: TestLocation;
  let matches: object[];
  let router: object;
  let routerState: TestRouterState;
  let trackCurrentPage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.history.replaceState(null, '', '/window-only?source=browser#wrong');
    view = createDomTestRoot();
    source = sourceSdk();
    trackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
    Object.assign(source.sdk, { trackCurrentPage });
    location = {
      pathname: '/products',
      searchStr: '?tab=featured',
      hash: 'details',
      href: '/products?tab=featured#details',
      state: { key: 'first' },
    };
    matches = [{ id: 'products', pathname: '/products', params: {} }];
    router = { name: 'test-router' };
    routerState = { location, resolvedLocation: location, matches };
    useRouter.mockImplementation(() => router);
    useRouterState.mockImplementation(
      ({ select }: { select: (state: TestRouterState) => unknown }) => select(routerState)
    );
  });

  afterEach(async () => {
    await act(async () => view.cleanup());
    vi.unstubAllGlobals();
  });

  async function render(props: Omit<TanStackRouterExperiencesProviderProps, 'sdk'> = {}) {
    routerState = { ...routerState, location, matches };
    await act(async () =>
      view.render(
        <ExperiencesProvider sdk={source.sdk} {...props}>
          <Experience experienceId="home" />
        </ExperiencesProvider>
      )
    );
  }

  it('maps location/context through the provider and fetches the same ID once per route', async () => {
    location = {
      ...location,
      searchStr: '?tab=featured&tag=first&tag=last',
      href: '/products?tab=featured&tag=first&tag=last#details',
    };
    routerState.resolvedLocation = location;
    const getPagePayload = vi.fn(
      (_context: AutoPageEmissionContext<TanStackRouterAutoPageContext>) => undefined
    );
    const props = { getPagePayload };
    await render(props);
    expect(source.fetchExperience).toHaveBeenCalledOnce();
    const [request, resolve] = source.fetchExperience.mock.calls[0]!;
    expect(resolve).toEqual({ config });
    expect(request.experienceId).toBe('home');
    expect(request.personalization?.events?.[0]).toMatchObject({
      type: 'page',
      properties: { hash: '#details', path: '/products', search: location.searchStr },
    });
    expect(getPagePayload).toHaveBeenCalledExactlyOnceWith({
      isInitialEmission: true,
      routeKey: '/products?tab=featured&tag=first&tag=last',
      context: {
        hash: 'details',
        router,
        location,
        matches,
        pathname: '/products',
        routeKey: '/products?tab=featured&tag=first&tag=last',
        search: '?tab=featured&tag=first&tag=last',
        url: '/products?tab=featured&tag=first&tag=last#details',
      },
    });
    expect(getPagePayload.mock.calls[0]![0].context.router).toBe(router);
    expect(getPagePayload.mock.calls[0]![0].context.location).toBe(location);
    expect(getPagePayload.mock.calls[0]![0].context.matches).toBe(matches);
    expect(view.container.querySelector('h1')?.textContent).toBe('content');

    location = { ...location, state: { key: 'same-url' } };
    routerState.resolvedLocation = location;
    matches = [...matches];
    await render(props);
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    expect(getPagePayload).toHaveBeenCalledTimes(1);

    location = {
      ...location,
      hash: 'other-section',
      href: '/products?tab=featured&tag=first&tag=last#other-section',
    };
    routerState.resolvedLocation = location;
    await render(props);
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);

    location = {
      ...location,
      pathname: '/offers',
      searchStr: '?tab=sale',
      hash: 'offer',
      href: '/offers?tab=sale#offer',
    };
    routerState.resolvedLocation = location;
    await render(props);
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    expect(source.fetchExperience.mock.calls.at(-1)![0].personalization?.events?.[0]).toMatchObject(
      {
        properties: { path: '/offers', search: '?tab=sale' },
      }
    );
    expect(getPagePayload).toHaveBeenCalledTimes(2);
    expect(getPagePayload).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isInitialEmission: false,
        routeKey: '/offers?tab=sale',
        context: expect.objectContaining({
          router,
          location,
          matches,
          pathname: '/offers',
          search: '?tab=sale',
          hash: 'offer',
        }),
      })
    );
    await render(props);
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    expect(trackCurrentPage).not.toHaveBeenCalled();
  });

  it('uses initial location and adopts settled matches before the resolved URL catches up', async () => {
    const committed = location;
    routerState.resolvedLocation = undefined;
    const getPagePayload = vi.fn(
      (_context: AutoPageEmissionContext<TanStackRouterAutoPageContext>) => undefined
    );
    await render({ getPagePayload });
    expect(getPagePayload).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        routeKey: '/products?tab=featured',
        context: expect.objectContaining({ location: committed, router, matches }),
      })
    );
    routerState.resolvedLocation = committed;
    await render({ getPagePayload });
    location = {
      ...location,
      pathname: '/pending',
      searchStr: '?step=2',
      hash: 'pending',
      href: '/pending?step=2#pending',
    };
    await render({ getPagePayload });
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    expect(getPagePayload).toHaveBeenCalledTimes(1);
    expect(getPagePayload.mock.calls[0]![0].context.location).toBe(committed);

    // A loader can republish outgoing matches without committing the new route.
    matches = matches.map((match) => ({ ...match, isFetching: 'loader' }));
    await render({ getPagePayload });
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    expect(getPagePayload).toHaveBeenCalledTimes(1);

    location = { ...committed, state: { key: 'canceled' } };
    await render({ getPagePayload });
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    location = {
      ...location,
      pathname: '/resolved',
      searchStr: '?step=3',
      hash: 'done',
      href: '/resolved?step=3#done',
    };
    matches = [{ id: 'resolved', pathname: '/resolved', params: {} }];
    await render({ getPagePayload });
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    expect(getPagePayload).toHaveBeenCalledTimes(2);
    expect(getPagePayload).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isInitialEmission: false,
        routeKey: '/resolved?step=3',
        context: expect.objectContaining({
          location,
          router,
          pathname: '/resolved',
          search: '?step=3',
          hash: 'done',
          url: '/resolved?step=3#done',
        }),
      })
    );
    expect(trackCurrentPage).not.toHaveBeenCalled();
    routerState.resolvedLocation = location;
    await render({ getPagePayload });
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
  });
});
