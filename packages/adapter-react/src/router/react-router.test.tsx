/** @vitest-environment jsdom */

import { act, type HTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Location } from 'react-router-dom';
import type { ExperiencesHandoff, Config } from '@contentful/experiences-web';
import { EventBuilder } from '@contentful/experiences-runtime';
import { sourceSdk } from '../test/managed-experience.js';
import { createDomTestRoot, type DomTestRoot } from '../test/dom-root.js';
import { profileFixture } from '../test/profile.js';
import {
  bindReactRouterExperiences,
  type AutoPageEmissionContext,
  type ReactRouterAutoPageContext,
  type ReactRouterExperiencesProviderProps,
} from './react-router.js';

const { useHref, useLocation, useMatches, construct } = vi.hoisted(() => ({
  useHref: vi.fn(),
  useLocation: vi.fn(),
  useMatches: vi.fn(),
  construct: vi.fn(),
}));
vi.mock('react-router-dom', () => ({ useHref, useLocation, useMatches }));
vi.mock('@contentful/experiences-web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@contentful/experiences-web')>();
  return {
    ...actual,
    ContentfulExperiences: vi.fn(function (config: Config) {
      return construct(config);
    }),
  };
});

const webConfig: Config = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'delivery' },
  locale: 'en-US',
  defaults: { consent: true, persistenceConsent: false },
};
const config = {
  components: {
    hero: ({ title, ...props }: HTMLAttributes<HTMLElement> & { title: string }) => (
      <h1 {...props}>{title}</h1>
    ),
  },
};

const { ExperiencesRoot, ExperiencesProvider, Experience } = bindReactRouterExperiences({ config });

describe('React Router mapping', () => {
  let view: DomTestRoot;
  let source: ReturnType<typeof sourceSdk>;
  let location: Location;
  let matches: ReactRouterAutoPageContext['matches'];
  let trackCurrentPage: ReturnType<typeof vi.fn>;
  let hydrateAndTrackCurrentPage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.history.replaceState(null, '', '/window-only?source=browser#wrong');
    view = createDomTestRoot();
    source = sourceSdk();
    trackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
    hydrateAndTrackCurrentPage = vi.fn().mockResolvedValue({ accepted: true });
    Object.assign(source.sdk, {
      spaceId: webConfig.spaceId,
      environmentId: webConfig.environmentId,
      destroy: () => undefined,
      trackCurrentPage,
      hydrateAndTrackCurrentPage,
    });
    construct.mockReset().mockReturnValue(source.sdk);
    location = {
      pathname: '/products',
      search: '?tab=featured',
      hash: '#details',
      state: { visit: 1 },
      key: 'first',
    };
    matches = [
      { id: 'products', pathname: '/products', params: {}, data: {}, loaderData: {}, handle: {} },
    ];
    useLocation.mockImplementation(() => location);
    useMatches.mockImplementation(() => matches);
    useHref.mockImplementation(
      (value: Location) => `${value.pathname}${value.search}${value.hash}`
    );
  });

  afterEach(async () => {
    await act(async () => view.cleanup());
    vi.unstubAllGlobals();
  });

  async function render(props: Omit<ReactRouterExperiencesProviderProps, 'sdk'> = {}) {
    await act(async () =>
      view.render(
        <ExperiencesProvider sdk={source.sdk} {...props}>
          <Experience experienceId="home" />
        </ExperiencesProvider>
      )
    );
  }

  it('maps location/context through the provider and fetches the same ID once per route', async () => {
    location = { ...location, search: '?tab=featured&tag=first&tag=last' };
    const getPagePayload = vi.fn(
      (_context: AutoPageEmissionContext<ReactRouterAutoPageContext>) => undefined
    );
    const props = { getPagePayload };
    await render(props);
    expect(source.fetchExperience).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        experienceId: 'home',
        personalization: {
          events: [
            {
              type: 'page',
              properties: {
                hash: '#details',
                path: '/products',
                query: { tab: 'featured', tag: ['first', 'last'] },
                search: '?tab=featured&tag=first&tag=last',
                url: `${window.location.origin}/products?tab=featured&tag=first&tag=last#details`,
              },
            },
          ],
        },
      }),
      { config },
      expect.objectContaining({ isCurrent: expect.any(Function) })
    );
    expect(getPagePayload).toHaveBeenCalledExactlyOnceWith({
      isInitialEmission: true,
      routeKey: '/products?tab=featured&tag=first&tag=last',
      context: {
        hash: '#details',
        location,
        matches,
        pathname: '/products',
        routeKey: '/products?tab=featured&tag=first&tag=last',
        search: '?tab=featured&tag=first&tag=last',
        url: '/products?tab=featured&tag=first&tag=last#details',
      },
    });
    expect(getPagePayload.mock.calls[0]![0].context.location).toBe(location);
    expect(getPagePayload.mock.calls[0]![0].context.matches).toBe(matches);
    expect(view.container.querySelector('h1')?.textContent).toBe('content');

    location = { ...location, key: 'same-url', state: { visit: 2 } };
    matches = [...matches];
    await render(props);
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    expect(getPagePayload).toHaveBeenCalledTimes(1);

    location = { ...location, hash: '#other-section' };
    await render(props);
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);

    location = { ...location, pathname: '/offers', search: '?tab=sale', hash: '#offer' };
    await render(props);
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    expect(source.fetchExperience).toHaveBeenLastCalledWith(
      expect.objectContaining({
        experienceId: 'home',
        personalization: {
          events: [
            expect.objectContaining({
              type: 'page',
              properties: expect.objectContaining({
                path: '/offers',
                search: '?tab=sale',
              }),
            }),
          ],
        },
      }),
      { config },
      expect.objectContaining({ isCurrent: expect.any(Function) })
    );
    expect(getPagePayload).toHaveBeenCalledTimes(2);
    expect(getPagePayload).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isInitialEmission: false,
        routeKey: '/offers?tab=sale',
        context: expect.objectContaining({
          location,
          matches,
          pathname: '/offers',
          search: '?tab=sale',
          hash: '#offer',
        }),
      })
    );
    await render(props);
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    expect(trackCurrentPage).not.toHaveBeenCalled();
  });

  it('forwards managed configuration and onStatesReady without router options entering SDK configuration', async () => {
    const onStatesReady = vi.fn();
    const getPagePayload = vi.fn(() => ({ properties: { title: 'Dynamic products' } }));
    await act(async () =>
      view.render(
        <ExperiencesRoot
          {...webConfig}
          onStatesReady={onStatesReady}
          pagePayload={{ properties: { title: 'Products' } }}
          getPagePayload={getPagePayload}
        >
          <span>root child</span>
        </ExperiencesRoot>
      )
    );
    expect(construct).toHaveBeenCalledExactlyOnceWith(webConfig);
    expect(onStatesReady).toHaveBeenCalledExactlyOnceWith(source.sdk.states);
    expect(getPagePayload).not.toHaveBeenCalled();
  });

  it('keeps basename-aware handoff identity while reading the latest router payload', async () => {
    useHref.mockImplementation(
      (value: Location) => `/app${value.pathname}${value.search}${value.hash}`
    );
    const builder = new EventBuilder({
      channel: 'server',
      library: { name: 'test', version: '1' },
    });
    const handoff: ExperiencesHandoff = {
      spaceId: 'space',
      environmentId: 'master',
      cache: { scope: 'private-request' },
      state: { profile: profileFixture('server-profile') },
      replay: { routeKey: '/app/products?tab=featured', events: [builder.buildPageView()] },
    };
    const firstPayload = vi.fn(() => ({ properties: { title: 'First' } }));
    const latestPayload = vi.fn(
      (_context: AutoPageEmissionContext<ReactRouterAutoPageContext>) => ({
        properties: { title: 'Latest' },
      })
    );
    await render({ handoff, getPagePayload: firstPayload });
    const [received, options] = hydrateAndTrackCurrentPage.mock.calls[0]!;
    expect(received).toBe(handoff);
    expect(options.routeKey).toBe('/app/products?tab=featured');
    expect(source.fetchExperience.mock.calls[0]![0].personalization).toBeUndefined();

    location = { ...location, hash: '#latest', state: { visit: 2 } };
    matches = [...matches];
    await render({ handoff, getPagePayload: latestPayload });
    expect(hydrateAndTrackCurrentPage).toHaveBeenCalledOnce();
    expect(options.buildPayload({ isInitialEmission: true }).properties).toMatchObject({
      hash: '#latest',
      title: 'Latest',
    });
    expect(firstPayload).not.toHaveBeenCalled();
    expect(latestPayload).toHaveBeenCalledOnce();
    expect(latestPayload.mock.calls[0]![0].context).toMatchObject({
      hash: '#latest',
      location,
      matches,
    });
  });
});
