'use client';

import { useState } from 'react';
import {
  useRouter,
  useRouterState,
  type AnyRouter,
  type RouterState,
} from '@tanstack/react-router';
import type { CreateExperiencesOptions } from '../experience/create-experiences.js';
import { sameValue } from '../experience/source-controller.js';
import { createRouterBinding } from './create-router-binding.js';
import { type RouterRootProps, type RouterProviderProps } from './page-payload.js';

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

export type TanStackRouterExperiencesRootProps = RouterRootProps<TanStackRouterAutoPageContext>;
export type TanStackRouterExperiencesProviderProps =
  RouterProviderProps<TanStackRouterAutoPageContext>;

function useRouteContext(): TanStackRouterAutoPageContext {
  const router = useRouter();
  const snapshot = useRouterState({
    select: (state) => ({
      location: state.location,
      resolvedLocation: state.resolvedLocation,
      matches: state.matches,
    }),
  });
  const [presented, setPresented] = useState(() => ({ router, ...snapshot }));
  // A location-only publication still belongs to the outgoing content. Adopt the
  // destination when route matches change, including successful parents with a
  // pending child. Fetching/status updates alone do not identify a new route.
  const matchesChanged =
    snapshot.matches.length !== presented.matches.length ||
    snapshot.matches.some((match, index) => {
      const previous = presented.matches[index]!;
      return match.id !== previous.id || !sameValue(match.search, previous.search);
    });
  const changed =
    router !== presented.router ||
    matchesChanged ||
    snapshot.resolvedLocation !== presented.resolvedLocation;
  const current = changed
    ? {
        router,
        ...snapshot,
        location:
          matchesChanged || router !== presented.router
            ? snapshot.location
            : (snapshot.resolvedLocation ?? snapshot.location),
      }
    : presented;
  // Render-time state adjustment pairs the new context with its children in the
  // same render and leaves abandoned renders isolated from the committed owner.
  if (changed) setPresented(current);
  const location = current.location;
  const matches = snapshot.matches;
  const { hash, href, pathname, searchStr } = location;
  const routeKey = `${pathname}${searchStr}`;
  return { hash, location, matches, pathname, routeKey, router, search: searchStr, url: href };
}

/** Bind once; mount a stable root or injected provider inside the router, above managed content. */
export function bindTanStackRouterExperiences(options: CreateExperiencesOptions) {
  return createRouterBinding(options, useRouteContext, () => {
    const router = useRouter();
    return ({ path }) => {
      void router.navigate({ to: path, replace: true });
    };
  });
}
