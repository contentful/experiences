'use client';

import { useMemo } from 'react';
import {
  useRouter,
  useRouterState,
  type AnyRouter,
  type RouterState,
} from '@tanstack/react-router';
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

type TanStackLocation = RouterState<AnyRouter['routeTree']>['location'];
type TanStackMatches = RouterState<AnyRouter['routeTree']>['matches'];

export interface TanStackRouterAutoPageContext {
  readonly hash: TanStackLocation['hash'];
  readonly location: TanStackLocation;
  readonly matches: TanStackMatches;
  readonly pathname: TanStackLocation['pathname'];
  readonly routeKey: string;
  readonly router: AnyRouter;
  readonly search: TanStackLocation['searchStr'];
  readonly url: TanStackLocation['href'];
}

export type TanStackRouterExperiencesRootProps =
  RouterExperiencesRootProps<TanStackRouterAutoPageContext>;
export type TanStackRouterExperiencesProviderProps =
  RouterExperiencesProviderProps<TanStackRouterAutoPageContext>;

function usePageOptions(options: AutoPagePayloadOptions<TanStackRouterAutoPageContext>) {
  const router = useRouter();
  const snapshot = useRouterState({
    select: (state) => ({
      location: state.location,
      resolvedLocation: state.resolvedLocation,
      matches: state.matches,
    }),
  });
  // Location-only updates are pending; settled matches publish before resolvedLocation.
  // Move URL and content together, retaining the previous URL during pending UI.
  const location = useMemo(
    () =>
      snapshot.matches.some((match) => match.status === 'pending')
        ? (snapshot.resolvedLocation ?? snapshot.location)
        : snapshot.location,
    [snapshot.matches, snapshot.resolvedLocation]
  );
  const matches = snapshot.matches;
  const { hash, href, pathname, searchStr } = location;
  const routeKey = `${pathname}${searchStr}`;
  const routerPayload = useMemo(
    () => buildRouterPagePayload({ hash, pathname, search: searchStr, url: href }),
    [hash, href, pathname, searchStr]
  );
  const context = useMemo(
    () => ({ hash, location, matches, pathname, routeKey, router, search: searchStr, url: href }),
    [hash, location, matches, pathname, routeKey, router, searchStr, href]
  );
  return useRouterPageInputs(routerPayload, options, context, routeKey);
}

/** Bind once; mount a stable root or injected provider inside the router, above managed content. */
export function bindTanStackRouterExperiences(options: CreateReactExperiencesOptions) {
  const bound = createReactExperiences(options);
  function ExperiencesRoot({
    pagePayload,
    getPagePayload,
    ...props
  }: TanStackRouterExperiencesRootProps) {
    const inputs = usePageOptions({ pagePayload, getPagePayload });
    return <bound.ExperiencesRoot {...props} {...inputs} />;
  }
  function ExperiencesProvider({
    pagePayload,
    getPagePayload,
    ...props
  }: TanStackRouterExperiencesProviderProps) {
    const inputs = usePageOptions({ pagePayload, getPagePayload });
    return <bound.ExperiencesProvider {...props} {...inputs} />;
  }
  return { ...bound, ExperiencesRoot, ExperiencesProvider };
}
