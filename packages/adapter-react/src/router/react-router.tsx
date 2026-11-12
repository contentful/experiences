'use client';

import { useHref, useLocation, useMatches, type Location } from 'react-router-dom';
import type { CreateReactExperiencesOptions } from '../experience/create-react-experiences.js';
import { createRouterBinding } from './create-router-binding.js';
import type { RouterExperiencesRootProps, RouterExperiencesProviderProps } from './page-payload.js';

export type {
  AutoPagePayload,
  AutoPageEmissionContext,
  AutoPagePayloadOptions,
} from './page-payload.js';

export interface ReactRouterAutoPageContext {
  readonly hash: string;
  readonly location: Location;
  readonly matches: Readonly<ReturnType<typeof useMatches>>;
  readonly pathname: string;
  readonly routeKey: string;
  readonly search: string;
  readonly url: string;
}

export type ReactRouterExperiencesRootProps =
  RouterExperiencesRootProps<ReactRouterAutoPageContext>;
export type ReactRouterExperiencesProviderProps =
  RouterExperiencesProviderProps<ReactRouterAutoPageContext>;

function useRouteContext(): ReactRouterAutoPageContext {
  const location = useLocation();
  const matches = useMatches();
  const { hash, search } = location;
  // Restore the basename without conflating a hash router's routing envelope
  // with the location's metadata fragment. A document <base> can precede '#/'.
  const href = useHref({ ...location, hash: '' });
  const hashIndex = href.indexOf('#');
  const pathAndSearch = hashIndex < 0 ? href : href.slice(hashIndex + 1);
  const searchIndex = pathAndSearch.indexOf('?');
  const pathname = searchIndex < 0 ? pathAndSearch : pathAndSearch.slice(0, searchIndex);
  const url = `${pathAndSearch}${hash}`;
  // Hash is metadata; the existing XDA page/handoff identity is pathname/search.
  const routeKey = `${pathname}${search}`;
  return { hash, location, matches, pathname, routeKey, search, url };
}

/** Bind once; mount a stable root or injected provider inside the router, above managed content. */
export function bindReactRouterExperiences(options: CreateReactExperiencesOptions) {
  return createRouterBinding(options, useRouteContext);
}
