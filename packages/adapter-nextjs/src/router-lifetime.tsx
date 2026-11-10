'use client';

import {
  ExperiencesRoot,
  ExperiencesProvider,
  type ExperiencesRootProps,
  usePreviewState,
} from '@contentful/experiences-react/client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import type {
  BoundNextjsExperiencesRootProps,
  BoundNextjsRequestRootProps,
  NextjsRequestResult,
} from './request-result.js';

const InitialDataContext = createContext<(requestId: string | undefined) => boolean>(() => true);

/** One stable root excludes only restored original bootstrap inputs after departure. */
export function NextjsInitialDataBoundary({
  routeKey,
  requestId,
  children,
}: {
  routeKey: string;
  requestId?: string;
  children: ReactNode;
}) {
  const initial = useRef({ routeKey, requestId });
  const departed = useRef(false);
  useEffect(() => {
    if (routeKey !== initial.current.routeKey) departed.current = true;
  }, [routeKey]);
  const hasDeparted = departed.current || routeKey !== initial.current.routeKey;
  return (
    <InitialDataContext.Provider
      value={(id) => id === undefined || !hasDeparted || id !== initial.current.requestId}
    >
      {children}
    </InitialDataContext.Provider>
  );
}

export function useNextjsInitialData(requestId: string | undefined) {
  return useContext(InitialDataContext)(requestId);
}

/** Request presentation adopts the whole descriptor and its matching startup outcome. */
export function useNextjsRequestOptions(result: NextjsRequestResult) {
  const canAdopt = useNextjsInitialData(result.requestId);
  const initialError = useMemo(
    () => (result.contentError === undefined ? undefined : new Error(result.contentError)),
    [result.contentError]
  );
  return {
    ...result.experience,
    initialPlan: canAdopt ? result.plan : undefined,
    initialError: canAdopt ? initialError : undefined,
  };
}

/** SSR content is refreshed only when its own Preview Session revision changes. */
export function useServerPreviewRefresh(experienceId: string | undefined, refresh: () => void) {
  const preview = usePreviewState();
  const current = preview?.experienceId === experienceId ? preview?.revision : undefined;
  const previous = useRef(current);
  useEffect(() => {
    const before = previous.current;
    previous.current = current;
    if (before !== undefined && current !== undefined && before !== current) refresh();
  }, [current, refresh]);
}

/** Reuse React's managed/injected owner without constructing a rendering registry. */
export function NextjsBrowserRoot(props: BoundNextjsExperiencesRootProps) {
  return props.sdk ? (
    <ExperiencesProvider {...props} sdk={props.sdk} />
  ) : (
    <ExperiencesRoot {...(props as ExperiencesRootProps)} />
  );
}

/** Shared whole-result adoption and page builder precedence for both router families. */
export function NextjsRequestPresentation({
  result,
  Root,
  routeKey,
  configuredBuilder,
  buildRoutePayload,
  ready = true,
  ...props
}: BoundNextjsRequestRootProps & {
  Root: typeof NextjsBrowserRoot;
  routeKey: string;
  configuredBuilder?: ExperiencesRootProps['buildPagePayload'];
  buildRoutePayload: NonNullable<ExperiencesRootProps['buildPagePayload']>;
  ready?: boolean;
}) {
  const canAdopt = useNextjsInitialData(result?.requestId);
  const matchingResult = canAdopt && result?.routeKey === routeKey ? result : undefined;
  const initialPagePayload = matchingResult?.initialPagePayload;
  const events = matchingResult?.experience.personalization?.events;
  const pageFree = events !== undefined && !events.some((event) => event.type === 'page');
  const builder = props.buildPagePayload ?? configuredBuilder;
  const buildPagePayload = useCallback<NonNullable<ExperiencesRootProps['buildPagePayload']>>(
    (context) => {
      if (!ready) return undefined;
      if (builder) return builder(context);
      if (initialPagePayload) return initialPagePayload;
      return buildRoutePayload(context);
    },
    [ready, builder, initialPagePayload, buildRoutePayload]
  );
  return (
    <Root
      {...props}
      routeKey={routeKey}
      handoff={canAdopt && (ready || typeof window === 'undefined') ? result?.handoff : undefined}
      handoffKey={result?.requestId}
      // Returning undefined from a builder still permits Web's empty page fallback.
      buildPagePayload={pageFree ? undefined : buildPagePayload}
      initialPagePayload={undefined}
      pageMode={pageFree ? undefined : props.pageMode}
    />
  );
}
