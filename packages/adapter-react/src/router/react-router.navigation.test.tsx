/** @vitest-environment jsdom */

import { transferableAbortController } from 'node:util';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { createHashRouter, createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { sourceSdk } from '../test/managed-experience.js';
import { createReactTestRoot } from '../test/react-root.js';
import {
  bindReactRouterExperiences,
  type AutoPageEmissionContext,
  type ReactRouterAutoPageContext,
} from './react-router.js';

it.each(['memory', 'hash', 'hash with document base'] as const)(
  'uses basename-aware page and route identity with %s routing',
  async (mode) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    // React Router's Node Request needs a Node signal rather than jsdom's signal.
    vi.stubGlobal('AbortController', transferableAbortController);
    const view = createReactTestRoot();
    const source = sourceSdk();
    const getPagePayload = vi.fn(
      (_context: AutoPageEmissionContext<ReactRouterAutoPageContext>) => undefined
    );
    const { ExperiencesProvider, useManagedExperience } = bindReactRouterExperiences({
      config: { components: {} },
    });
    function Page() {
      useManagedExperience({ experienceId: 'products' });
      return <span>Products</span>;
    }
    const search = '?tag=first%20value&tag=last+value&encoded=%2f';
    const initial = `/app/products${search}#details`;
    window.history.replaceState(null, '', mode === 'memory' ? '/' : `/#${initial}`);
    const base = document.createElement('base');
    if (mode === 'hash with document base') {
      base.href = '/host/';
      document.head.append(base);
    }
    const routes = [
      {
        element: (
          <ExperiencesProvider sdk={source.sdk} getPagePayload={getPagePayload}>
            <Outlet />
          </ExperiencesProvider>
        ),
        children: [{ id: 'products', path: 'products', element: <Page /> }],
      },
    ];
    const router =
      mode === 'memory'
        ? createMemoryRouter(routes, { basename: '/app', initialEntries: [initial] })
        : createHashRouter(routes, { basename: '/app' });

    try {
      await act(async () => view.render(<RouterProvider router={router} />));
      expect(source.fetchExperience).toHaveBeenCalledOnce();
      expect(source.fetchExperience.mock.calls[0]![0].personalization?.events?.[0]).toMatchObject({
        properties: { path: '/app/products', search, hash: '#details' },
      });
      expect(getPagePayload.mock.calls[0]![0]).toMatchObject({
        routeKey: `/app/products${search}`,
        context: { pathname: '/app/products', location: { pathname: '/products', search } },
      });

      await act(async () => {
        await router.navigate(`/products${search}#other`);
      });
      expect(source.fetchExperience).toHaveBeenCalledTimes(1);
      expect(getPagePayload).toHaveBeenCalledTimes(1);

      const nextSearch = '?encoded=%2F&tag=next+value';
      await act(async () => {
        await router.navigate(`/products${nextSearch}#other`);
      });
      expect(source.fetchExperience).toHaveBeenCalledTimes(2);
      expect(getPagePayload.mock.calls.at(-1)![0]).toMatchObject({
        routeKey: `/app/products${nextSearch}`,
        context: { search: nextSearch },
      });
    } finally {
      await act(async () => view.cleanup());
      router.dispose();
      base.remove();
      window.history.replaceState(null, '', '/');
      vi.unstubAllGlobals();
    }
  }
);
