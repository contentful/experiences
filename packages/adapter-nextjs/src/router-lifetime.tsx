'use client';

import {
  ExperiencesRoot,
  ExperiencesProvider,
  type ExperiencesRootProps,
  usePreviewState,
  useExperiencesContext,
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

import type { BoundNextjsExperiencesRootProps, NextjsRequestResult } from './request-result.js';

import {
  resolveNextjsLivePreview,
  nextjsLivePreviewSessionId,
  mergeNextjsLivePreview,
} from './live-preview.js';

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
  const current =
    experienceId === undefined || preview?.experienceId === experienceId
      ? preview?.revision
      : undefined;
  const previous = useRef(current);
  useEffect(() => {
    const before = previous.current;
    previous.current = current;
    if (before !== undefined && current !== undefined && before !== current) refresh();
  }, [current, refresh]);
}

/** Preview adds session synchronization to the existing React SDK owner. */
export function NextjsBrowserRoot({
  livePreview,
  sdk,
  previewUrl,
  children,
  ...props
}: BoundNextjsExperiencesRootProps & { previewUrl?: string }) {
  const config = livePreview && 'enabled' in livePreview ? livePreview : undefined;
  if (config && sdk)
    throw new TypeError('Managed Live Preview requires an SDK-owned Next.js root.');
  const url = previewUrl ?? props.routeKey ?? '/';
  const sessionId = config && nextjsLivePreviewSessionId(config, url);
  const direct = livePreview && !('enabled' in livePreview) ? livePreview : undefined;
  const options = useMemo(
    () => (config ? resolveNextjsLivePreview(config, url) : direct),
    [
      sessionId,
      config?.experienceId,
      config?.loadImplementation,
      config?.sessionHost,
      config?.resourceResolution,
      direct,
    ]
  );
  // A captured constructor must read the current binding when it reactivates.
  const current = useRef(options);
  current.current = options;
  const forwarded = useMemo<NonNullable<ExperiencesRootProps['livePreview']>>(
    () => ({
      get experienceId() {
        return current.current!.experienceId;
      },
      get sessionId() {
        return current.current!.sessionId;
      },
      get sessionHost() {
        return current.current!.sessionHost;
      },
      get resourceResolution() {
        return current.current!.resourceResolution;
      },
      loadImplementation() {
        const load = current.current!.loadImplementation;
        return load();
      },
    }),
    []
  );
  if (sdk)
    return (
      <ExperiencesProvider {...props} sdk={sdk}>
        {children}
      </ExperiencesProvider>
    );
  return (
    <ExperiencesRoot
      key={config ? (sessionId ? 'preview' : 'ordinary') : undefined}
      {...(props as ExperiencesRootProps)}
      isPreview={config ? Boolean(sessionId) : props.isPreview}
      livePreview={config && options ? forwarded : options}
    >
      {config && options && <PreviewSession options={options} />}
      {children}
    </ExperiencesRoot>
  );
}

function PreviewSession({
  options,
}: {
  options: NonNullable<ExperiencesRootProps['livePreview']>;
}) {
  const context = useExperiencesContext();
  const applied = useRef(options);
  useEffect(() => {
    if (!context.isLive || applied.current === options) return;
    applied.current = options;
    // Web owns supersession, cleanup and error publication.
    void context.sdk.replaceLivePreview(options).catch(() => undefined);
  }, [context.sdk, context.isLive, options]);
  return null;
}

/** Shared whole-result adoption and page builder precedence for both router families. */
export function NextjsRequestPresentation({
  result,
  Root,
  routeKey,
  configuredBuilder,
  buildRoutePayload,
  ready = true,
  previewUrl,
  ...props
}: BoundNextjsExperiencesRootProps & {
  result?: NextjsRequestResult;
  previewUrl?: string;
  Root: typeof NextjsBrowserRoot;
  routeKey: string;
  configuredBuilder?: ExperiencesRootProps['buildPagePayload'];
  buildRoutePayload: NonNullable<ExperiencesRootProps['buildPagePayload']>;
  ready?: boolean;
}) {
  const canAdopt = useNextjsInitialData(result?.requestId);
  const matchingResult = canAdopt && result?.routeKey === routeKey ? result : undefined;
  const livePreview = mergeNextjsLivePreview(props.livePreview, result?.livePreview);
  const waiting = !ready || (result !== undefined && result.routeKey !== routeKey);
  const initialPagePayload =
    matchingResult?.initialPagePayload ?? (result ? undefined : props.initialPagePayload);
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
      {...(waiting ? { beforeInitialPage: undefined } : {})}
      routeKey={routeKey}
      previewUrl={previewUrl}
      livePreview={
        livePreview && 'enabled' in livePreview && result
          ? { ...livePreview, experienceId: result.experience.experienceId }
          : livePreview
      }
      handoff={
        result
          ? ready || typeof window === 'undefined'
            ? matchingResult?.handoff
            : undefined
          : props.handoff
      }
      handoffKey={result ? matchingResult?.requestId : props.handoffKey}
      // Returning undefined from a builder still permits Web's empty page fallback.
      buildPagePayload={waiting || pageFree ? undefined : buildPagePayload}
      initialPagePayload={undefined}
      pageMode={waiting || pageFree ? undefined : props.pageMode}
    />
  );
}
