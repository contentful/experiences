/** @vitest-environment jsdom */

import { transferableAbortController } from 'node:util';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { plan, sourceSdk } from '../test/managed-experience.js';
import { createDomTestRoot } from '../test/dom-root.js';
import { bindReactRouterExperiences } from './react-router.js';

it('selects Destination content by router path with route page intent and app-owned redirects', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('AbortController', transferableAbortController);
  const view = createDomTestRoot();
  const source = sourceSdk();
  source.fetchByDestinationPath.mockImplementation(async ({ path }) =>
    path === '/old' ? { redirect: { path: '/new' } } : { ...plan(path), experienceId: path }
  );
  const redirects: string[] = [];
  const { ExperiencesProvider, Experience } = bindReactRouterExperiences({
    config: { components: {} },
  });
  function Page() {
    const { pathname } = useLocation();
    return (
      <Experience
        destinationId="dest"
        path={pathname}
        onExperienceRedirect={({ path }) => redirects.push(path)}
        redirectFallback="redirecting"
      />
    );
  }
  const router = createMemoryRouter(
    [
      {
        element: (
          <ExperiencesProvider sdk={source.sdk}>
            <Outlet />
          </ExperiencesProvider>
        ),
        children: [{ path: '*', element: <Page /> }],
      },
    ],
    { initialEntries: ['/home'] }
  );
  try {
    await act(async () => view.render(<RouterProvider router={router} />));
    expect(source.fetchByDestinationPath).toHaveBeenCalledOnce();
    expect(source.fetchByDestinationPath.mock.calls[0]![0]).toMatchObject({
      destinationId: 'dest',
      path: '/home',
      personalization: { events: [{ type: 'page', properties: { path: '/home' } }] },
    });

    await act(async () => {
      await router.navigate('/old');
    });
    expect(source.fetchByDestinationPath).toHaveBeenCalledTimes(2);
    expect(source.fetchByDestinationPath.mock.calls[1]![0]).toMatchObject({
      path: '/old',
      personalization: { events: [{ type: 'page', properties: { path: '/old' } }] },
    });
    expect(view.container.textContent).toBe('redirecting');
    expect(redirects).toEqual(['/new']);
    // The SDK does not navigate; the router location is unchanged until the app acts.
    expect(router.state.location.pathname).toBe('/old');
  } finally {
    await act(async () => view.cleanup());
    router.dispose();
    vi.unstubAllGlobals();
  }
});
