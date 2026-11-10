/** @vitest-environment jsdom */

import { setImmediate, setTimeout } from 'node:timers/promises';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { sourceSdk, deferred } from '../managed-experience.js';
import { createReactTestRoot } from '../react-root.js';
import { bindTanStackRouterExperiences } from '../../router/tanstack-router.js';

it('pairs a destination descriptor and URL when matches commit before the resolved location', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const view = createReactTestRoot();
  const source = sourceSdk();
  const loader = deferred<void>();
  const { ExperiencesProvider, useManagedExperience } = bindTanStackRouterExperiences({
    config: { components: {} },
  });
  function Page({ id }: { id: string }) {
    useManagedExperience({ experienceId: id });
    return <span>{id}</span>;
  }
  const rootRoute = createRootRoute({
    component: () => (
      <ExperiencesProvider sdk={source.sdk}>
        <Outlet />
      </ExperiencesProvider>
    ),
  });
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
  const router = createRouter({
    routeTree: rootRoute.addChildren([first, second]),
    history: createMemoryHistory({ initialEntries: ['/a'] }),
    defaultPendingMs: 1,
    defaultPendingMinMs: 1,
  });
  const flush = async () => {
    for (let i = 0; i < 4; i++)
      await act(async () => {
        await setImmediate();
      });
  };
  try {
    await act(async () => {
      view.render(<RouterProvider router={router} />);
      await setImmediate();
    });
    await flush();
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    let navigation!: Promise<void>;
    await act(async () => {
      navigation = router.navigate({ to: '/b' });
      await setTimeout(20);
    });
    expect(view.container.textContent).toBe('Pending destination');
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    await act(async () => {
      loader.resolve();
      await setImmediate();
    });
    await flush();
    await navigation;
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    expect(source.fetchExperience).toHaveBeenLastCalledWith(
      expect.objectContaining({
        experienceId: 'b',
        personalization: {
          events: [
            expect.objectContaining({
              type: 'page',
              properties: expect.objectContaining({ path: '/b' }),
            }),
          ],
        },
      }),
      expect.anything()
    );
    expect(view.container.textContent).toBe('b');
  } finally {
    loader.resolve();
    await act(async () => view.cleanup());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
