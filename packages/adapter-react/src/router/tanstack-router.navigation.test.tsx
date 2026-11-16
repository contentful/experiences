/** @vitest-environment jsdom */

import { setImmediate, setTimeout } from 'node:timers/promises';
import { act, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type AnyRoute,
} from '@tanstack/react-router';
import { sourceSdk, deferred } from '../test/managed-experience.js';
import { createReactTestRoot } from '../test/react-root.js';
import { bindTanStackRouterExperiences } from './tanstack-router.js';

async function flush() {
  for (let i = 0; i < 4; i++)
    await act(async () => {
      await setImmediate();
    });
}

const cleanups: (() => void)[] = [];
afterEach(async () => {
  await act(async () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function navigationView() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const view = createReactTestRoot();
  cleanups.push(view.cleanup);
  const source = sourceSdk();
  const payloads = vi.fn();
  const { ExperiencesProvider, useManagedExperience } = bindTanStackRouterExperiences({
    config: { components: {} },
  });
  function Page({ id, children }: { id: string; children?: ReactNode }) {
    const result = useManagedExperience({ experienceId: id });
    return (
      <div>
        {`${id}:${result.status}`}
        {children}
      </div>
    );
  }
  const rootRoute = createRootRoute({
    component: () => (
      <ExperiencesProvider sdk={source.sdk} getPagePayload={payloads}>
        <Outlet />
      </ExperiencesProvider>
    ),
  });
  async function mount(routes: AnyRoute[], initial = '/a', hydrate = false) {
    const router = createRouter({
      routeTree: rootRoute.addChildren(routes),
      history: createMemoryHistory({ initialEntries: [initial] }),
      defaultPendingMs: 1,
      defaultPendingMinMs: 1,
    });
    const recoverable = vi.fn();
    if (hydrate) {
      await router.load();
      view.container.innerHTML = renderToString(<RouterProvider router={router} />);
      expect(source.fetchExperience).not.toHaveBeenCalled();
    }
    await act(async () => {
      if (hydrate)
        view.hydrate(<RouterProvider router={router} />, { onRecoverableError: recoverable });
      else view.render(<RouterProvider router={router} />);
      await setImmediate();
    });
    await flush();
    expect(recoverable).not.toHaveBeenCalled();
    return router;
  }
  return { view, source, rootRoute, Page, mount, payloads };
}

it.each([false, true])(
  'pairs destination content and page identity (cancelled: %s)',
  async (cancelled) => {
    const { view, source, rootRoute, Page, mount } = navigationView();
    const loader = deferred<void>();
    cleanups.push(() => loader.resolve());
    const first = createRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      component: () => <Page id="a" />,
    });
    const second = createRoute({
      getParentRoute: () => rootRoute,
      path: '/b',
      loader: () => loader.promise,
      pendingComponent: () => <span>Pending destination</span>,
      component: () => <Page id="b" />,
    });
    const router = await mount([first, second]);
    let navigation!: Promise<void>;
    await act(async () => {
      navigation = router.navigate({ to: '/b' });
      await setTimeout(20);
    });
    expect(view.container.textContent).toBe('Pending destination');
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    if (cancelled)
      await act(async () => {
        await router.navigate({ to: '/a' });
      });
    await act(async () => {
      loader.resolve();
      await navigation;
    });
    await flush();
    const id = cancelled ? 'a' : 'b';
    expect(view.container.textContent).toBe(`${id}:success`);
    expect(source.fetchExperience.mock.calls.map(([request]) => request.experienceId)).toEqual([
      'a',
      id,
    ]);
    expect(source.fetchExperience.mock.calls[1]![0]).toMatchObject({
      personalization: { events: [{ type: 'page', properties: { path: `/${id}` } }] },
    });
  }
);

it('hydrates an initially loaded router without changing its page identity or refetching twice', async () => {
  const { source, rootRoute, Page, mount } = navigationView();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/a',
    component: () => <Page id="a" />,
  });
  await mount([route], '/a', true);
  expect(source.fetchExperience).toHaveBeenCalledTimes(1);
  expect(source.fetchExperience.mock.calls[0]![0]).toMatchObject({
    experienceId: 'a',
    personalization: { events: [{ type: 'page', properties: { path: '/a' } }] },
  });
});

it('adopts a successful destination parent while its child stays pending without refetching on settlement', async () => {
  const { view, source, rootRoute, Page, mount, payloads } = navigationView();
  const loader = deferred<void>();
  cleanups.push(() => loader.resolve());
  const first = createRoute({
    getParentRoute: () => rootRoute,
    path: '/a',
    component: () => <Page id="a" />,
  });
  const parent = createRoute({
    getParentRoute: () => rootRoute,
    path: '/b',
    component: () => (
      <Page id="b">
        <Outlet />
      </Page>
    ),
  });
  const child = createRoute({
    getParentRoute: () => parent,
    path: 'child',
    loader: () => loader.promise,
    pendingComponent: () => <span>Pending child</span>,
    component: () => <span>Settled child</span>,
  });
  const router = await mount([first, parent.addChildren([child])]);
  let navigation!: Promise<void>;
  await act(async () => {
    navigation = router.navigate({ to: '/b/child' });
    await setTimeout(20);
  });
  await flush();
  expect(view.container.textContent).toBe('b:successPending child');
  expect(source.fetchExperience).toHaveBeenCalledTimes(2);
  expect(source.fetchExperience.mock.calls[1]![0]).toMatchObject({
    experienceId: 'b',
    personalization: { events: [{ type: 'page', properties: { path: '/b/child' } }] },
  });
  const context = payloads.mock.calls.at(-1)![0].context;
  expect(context.location.pathname).toBe('/b/child');
  expect(context.matches.at(-1).status).toBe('pending');
  await act(async () => {
    loader.resolve();
    await navigation;
  });
  await flush();
  expect(view.container.textContent).toBe('b:successSettled child');
  expect(source.fetchExperience).toHaveBeenCalledTimes(2);
});

it.each([false, true])(
  'pairs query-derived descriptors with their page (background reload: %s)',
  async (background) => {
    const { view, source, rootRoute, Page, mount } = navigationView();
    const loader = deferred<void>();
    cleanups.push(() => loader.resolve());
    const route = createRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      validateSearch: (search: Record<string, unknown>) => ({ tab: String(search.tab ?? 'one') }),
      loaderDeps: ({ search }) => ({ tab: background ? 'shared' : search.tab }),
      staleTime: 0,
      shouldReload: true,
      loader: ({ location }) =>
        new globalThis.URLSearchParams(location.searchStr).get('tab') === 'two'
          ? loader.promise
          : undefined,
      component: () => <Page id={route.useSearch().tab} />,
      pendingComponent: () => <span>Pending query</span>,
    });
    const router = await mount([route], '/a?tab=one');
    let navigation!: Promise<void>;
    await act(async () => {
      navigation = router.navigate({ to: '/a', search: { tab: 'two' } });
      await setTimeout(20);
    });
    await flush();
    expect(source.fetchExperience).toHaveBeenCalledTimes(background ? 2 : 1);
    await act(async () => {
      loader.resolve();
      await navigation;
    });
    await flush();
    expect(view.container.textContent).toBe('two:success');
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    expect(source.fetchExperience.mock.calls[1]![0]).toMatchObject({
      experienceId: 'two',
      personalization: {
        events: [{ type: 'page', properties: { path: '/a', search: '?tab=two' } }],
      },
    });
  }
);
