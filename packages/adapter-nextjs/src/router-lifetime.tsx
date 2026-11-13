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

import type { BoundRootProps, RequestResult } from './request-result.js';

import { resolvePreview, mergePreview } from './preview.js';

const InitialDataContext = createContext<(requestId: string | undefined) => boolean>(() => true);
const RequestResultContext = createContext<{ result?: RequestResult } | undefined>(undefined);

/** Only request roots provide inherited results, including an initially empty result. */
export function RequestResultBoundary({
  result,
  children,
}: {
  result?: RequestResult;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ result }), [result]);
  return <RequestResultContext.Provider value={value}>{children}</RequestResultContext.Provider>;
}

/** One stable root excludes only restored original bootstrap inputs after departure. */
export function InitialDataBoundary({
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

export function useInitialData(requestId: string | undefined) {
  return useContext(InitialDataContext)(requestId);
}

/** Explicit results override inheritance; history guards apply only to startup seeds. */
export function useRequestOptions(supplied?: RequestResult) {
  const inherited = useContext(RequestResultContext);
  if (supplied === undefined && inherited === undefined)
    throw new Error('request.Experience requires a result prop or a request ExperiencesRoot.');
  const result = supplied ?? inherited?.result;
  const canAdopt = useInitialData(result?.requestId);
  const error = result?.contentError;
  const notFound = result?.notFound === true;
  const initialError = useMemo(() => {
    if (error === undefined) return undefined;
    const value = new Error(error);
    // Keep the not-found outcome distinguishable for client error presentation.
    if (notFound) value.name = 'NotFoundError';
    return value;
  }, [error, notFound]);
  const redirectPath = result?.redirect?.path;
  const initialRedirect = useMemo(
    () => (redirectPath === undefined ? undefined : { path: redirectPath }),
    [redirectPath]
  );
  return {
    result,
    initialPlan: canAdopt ? result?.plan : undefined,
    initialError: canAdopt ? initialError : undefined,
    initialRedirect: canAdopt ? initialRedirect : undefined,
  };
}

/** Server-only presentations observe valid context content without browser resolution. */
export function useServerPreviewRefresh(refresh: () => void) {
  const preview = usePreviewState();
  const previous = useRef(preview?.revision);
  useEffect(() => {
    const before = previous.current;
    previous.current = preview?.revision;
    const id = preview?.data?.sys?.id;
    if (typeof id === 'string' && id.trim() && before !== undefined && before !== preview?.revision)
      refresh();
  }, [preview?.revision, preview?.data?.sys?.id, refresh]);
}

/** Configure Preview transport; the browser URL selects the active session. */
export function BrowserRoot({
  preview,
  sdk,
  previewUrl,
  ...props
}: BoundRootProps & { previewUrl?: string }) {
  if (preview && sdk) throw new TypeError('Managed Preview requires an SDK-owned Next.js root.');
  const options = resolvePreview(preview, previewUrl ?? props.routeKey ?? '/');
  if (sdk) return <ExperiencesProvider {...props} sdk={sdk} />;
  return <ExperiencesRoot {...(props as ExperiencesRootProps)} preview={options} />;
}

/** Shared whole-result adoption and page builder precedence for both router families. */
export function RequestPresentation({
  result,
  Root,
  routeKey,
  configuredBuilder,
  buildRoutePayload,
  ready = true,
  previewUrl,
  ...props
}: BoundRootProps & {
  result?: RequestResult;
  previewUrl?: string;
  Root: typeof BrowserRoot;
  routeKey: string;
  configuredBuilder?: ExperiencesRootProps['buildPagePayload'];
  buildRoutePayload: NonNullable<ExperiencesRootProps['buildPagePayload']>;
  ready?: boolean;
}) {
  const canAdopt = useInitialData(result?.requestId);
  const matchingResult = canAdopt && result?.routeKey === routeKey ? result : undefined;
  const preview = mergePreview(props.preview, result?.preview);
  const waiting = !ready || (result !== undefined && result.routeKey !== routeKey);
  const initialPagePayload =
    matchingResult?.initialPagePayload ?? (result ? undefined : props.initialPagePayload);
  const events = matchingResult?.experience.personalization?.events;
  const pageFree =
    matchingResult?.initialPageOwner === 'server' ||
    // A redirect result is never presented, so the browser records no page for it.
    matchingResult?.redirect !== undefined ||
    (events !== undefined && !events.some((event) => event.type === 'page'));
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
      preview={preview}
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
