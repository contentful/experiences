'use client';

import { useMemo } from 'react';
import { useLocation, useMatches, type Location, type UIMatch } from 'react-router-dom';
import {
  createReactExperiences,
  type CreateReactExperiencesOptions,
} from '../experience/create-react-experiences.js';
import {
  buildRouterPagePayload,
  useRouterPageInputs,
  type AutoPagePayloadOptions,
  type RouterExperiencesRootProps,
  type RouterExperiencesProviderProps,
} from './page-payload.js';

export type {
  AutoPagePayload,
  AutoPageEmissionContext,
  AutoPagePayloadOptions,
} from './page-payload.js';

export interface ReactRouterAutoPageContext {
  readonly hash: string;
  readonly location: Location;
  readonly matches: readonly UIMatch[];
  readonly pathname: string;
  readonly routeKey: string;
  readonly search: string;
  readonly url: string;
}

export type ReactRouterExperiencesRootProps =
  RouterExperiencesRootProps<ReactRouterAutoPageContext>;
export type ReactRouterExperiencesProviderProps =
  RouterExperiencesProviderProps<ReactRouterAutoPageContext>;

function usePageOptions(options: AutoPagePayloadOptions<ReactRouterAutoPageContext>) {
  const location = useLocation();
  const matches = useMatches();
  const { hash, pathname, search } = location;
  const url = `${pathname}${search}${hash}`;
  // Hash is metadata; the existing XDA page/handoff identity is pathname/search.
  const routeKey = `${pathname}${search}`;
  const routerPayload = useMemo(
    () => buildRouterPagePayload({ hash, pathname, search, url }),
    [hash, pathname, search, url]
  );
  const context = useMemo(
    () => ({ hash, location, matches, pathname, routeKey, search, url }),
    [hash, location, matches, pathname, routeKey, search, url]
  );
  return useRouterPageInputs(routerPayload, options, context, routeKey);
}

/** Bind once; mount a stable root or injected provider inside the router, above managed content. */
export function bindReactRouterExperiences(options: CreateReactExperiencesOptions) {
  const bound = createReactExperiences(options);
  function ExperiencesRoot({
    pagePayload,
    getPagePayload,
    ...props
  }: ReactRouterExperiencesRootProps) {
    const inputs = usePageOptions({ pagePayload, getPagePayload });
    return <bound.ExperiencesRoot {...props} {...inputs} />;
  }
  function ExperiencesProvider({
    pagePayload,
    getPagePayload,
    ...props
  }: ReactRouterExperiencesProviderProps) {
    const inputs = usePageOptions({ pagePayload, getPagePayload });
    return <bound.ExperiencesProvider {...props} {...inputs} />;
  }
  return { ...bound, ExperiencesRoot, ExperiencesProvider };
}
