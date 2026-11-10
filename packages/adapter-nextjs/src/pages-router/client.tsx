'use client';

// Bound components and committed route inputs follow Optimization's Pages binding
// at f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT). React remains the page owner.
import { useRouter } from 'next/router.js';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  createExperiences,
  type ExperiencesRootProps,
  type BoundManagedExperienceProps,
} from '@contentful/experiences-react/client';
import { createPageContext, createRouteKey } from '../request/context.js';
import {
  InitialDataBoundary,
  RequestPresentation,
  BrowserRoot,
  useServerPreviewRefresh,
  useRequestOptions,
} from '../presentation/router-lifetime.js';
import { mergeLivePreview, livePreviewSessionId } from '../presentation/live-preview.js';
import type { ClientConfig } from '../app-router/client.js';
import type {
  BoundRequestRootProps,
  RequestExperienceProps,
} from '../presentation/request-result.js';
export type {
  BoundRootProps,
  BoundRequestRootProps,
  RequestExperienceProps,
  RequestResult,
} from '../presentation/request-result.js';

export type { BrowserConfig } from '../presentation/browser-config.js';
export type { LivePreviewConfig, LivePreviewOptions } from '../presentation/live-preview.js';
export type { HydrationMode } from '../presentation/request-result.js';

export type PagesRouterConfig = ClientConfig;

/** One stable owner in _app; no separate tracker or navigation event sender. */
export function bindPagesRouterExperiences(config: PagesRouterConfig) {
  const { config: registry, consent, ...runtimeConfig } = config;
  const {
    Experience: ManagedExperience,
    ExperienceRenderer,
    useManagedExperience,
  } = createExperiences({ config: registry });

  function ExperiencesRoot(props: BoundRequestRootProps) {
    return (
      <PagesRouterRequestOwner
        {...runtimeConfig}
        {...(consent?.clientDefaults ? { defaults: consent.clientDefaults } : {})}
        {...props}
        livePreview={mergeLivePreview(
          runtimeConfig.livePreview,
          props.result?.livePreview ?? props.livePreview
        )}
        beforeInitialPage={props.beforeInitialPage ?? runtimeConfig.beforeInitialPage}
        onStatesReady={props.onStatesReady ?? runtimeConfig.onStatesReady}
        Root={BrowserRoot}
        configuredBuilder={runtimeConfig.buildPagePayload}
      />
    );
  }

  function RequestExperience({ result, ...props }: RequestExperienceProps) {
    const initial = useRequestOptions(result);
    return <ManagedExperience {...props} {...initial} />;
  }

  const Experience: {
    (props: RequestExperienceProps): ReactElement;
    (props: BoundManagedExperienceProps & { readonly result?: never }): ReactElement;
  } = (
    props: RequestExperienceProps | (BoundManagedExperienceProps & { readonly result?: never })
  ) =>
    props.result === undefined ? (
      <ManagedExperience {...props} />
    ) : (
      <RequestExperience {...props} />
    );

  function ExperiencesAnalyticsRoot({
    experienceId,
    ...props
  }: BoundRequestRootProps & { readonly experienceId?: string }) {
    return (
      <ExperiencesRoot {...props} experienceId={experienceId} pageMode="analytics">
        <ServerPreviewRefresh
          experienceId={experienceId ?? props.result?.experience.experienceId}
        />
        {props.children}
      </ExperiencesRoot>
    );
  }

  return {
    ExperiencesRoot,
    ExperiencesAnalyticsRoot,
    Experience,
    ExperienceRenderer,
    useManagedExperience,
  };
}

function PagesRouterRequestOwner({
  Root,
  configuredBuilder,
  ...props
}: BoundRequestRootProps & {
  Root: typeof BrowserRoot;
  configuredBuilder?: ExperiencesRootProps['buildPagePayload'];
}) {
  const router = useRouter();
  const shallowTransition = useRef(false);
  const [route, setRoute] = useState(() => ({
    data: props.result,
    key: createRouteKey(router.isReady ? router.asPath : (props.result?.routeKey ?? router.asPath)),
    previewKey: createRouteKey(
      router.isReady ? router.asPath : (props.result?.routeKey ?? router.asPath)
    ),
  }));
  // Page props can precede asPath/history and the completion event. Adopt
  // their route and descriptor atomically, before any child request effects.
  if (route.data !== props.result)
    setRoute({
      data: props.result,
      previewKey: shallowTransition.current
        ? route.previewKey
        : createRouteKey(props.result?.routeKey ?? router.asPath),
      key: shallowTransition.current
        ? route.key
        : createRouteKey(props.result?.routeKey ?? router.asPath),
    });
  useEffect(() => {
    // Ignore canceled transitions, hashes and shallow UI updates. Only a normal
    // committed route changes the root's ordinary XDA intent.
    const complete = (url: string, { shallow }: { shallow: boolean }) => {
      const previewKey = createRouteKey(url);
      setRoute((current) => ({ ...current, key: shallow ? current.key : previewKey, previewKey }));
    };
    const start = (_url: string, { shallow }: { shallow: boolean }) => {
      shallowTransition.current = shallow;
    };
    const cancel = () => {
      shallowTransition.current = false;
    };
    if (router.isReady)
      setRoute((current) => ({
        ...current,
        key: createRouteKey(router.asPath),
        previewKey: createRouteKey(router.asPath),
      }));
    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', complete);
    router.events.on('routeChangeError', cancel);
    return () => {
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', complete);
      router.events.off('routeChangeError', cancel);
    };
  }, [router.events, router.isReady]);
  const committedRoute =
    !props.result && router.isReady && !shallowTransition.current
      ? createRouteKey(router.asPath)
      : route.key;
  const previewUrl = !props.result && router.isReady ? router.asPath : route.previewKey;
  const previewSession =
    props.livePreview && 'enabled' in props.livePreview
      ? livePreviewSessionId(props.livePreview, previewUrl)
      : undefined;
  const ready = router.isReady;
  const buildPagePayload = useCallback<
    NonNullable<ExperiencesRootProps['buildPagePayload']>
  >(() => {
    if (!ready) return undefined;
    const url = new URL(
      committedRoute,
      typeof window === 'undefined' ? 'https://nextjs.invalid' : window.location.origin
    );
    return {
      properties: createPageContext({
        path: url.pathname,
        searchParams: url.searchParams,
        url: typeof window === 'undefined' ? committedRoute : url.toString(),
        referrer: typeof document === 'undefined' ? '' : document.referrer,
      }),
    };
  }, [ready, committedRoute]);
  return (
    <InitialDataBoundary
      routeKey={`${committedRoute}#preview=${previewSession ?? ''}`}
      requestId={props.result?.requestId}
    >
      <RequestPresentation
        {...props}
        Root={Root}
        routeKey={committedRoute}
        previewUrl={previewUrl}
        ready={ready}
        configuredBuilder={configuredBuilder}
        buildRoutePayload={buildPagePayload}
      />
    </InitialDataBoundary>
  );
}

function ServerPreviewRefresh({ experienceId }: { experienceId: string | undefined }) {
  const router = useRouter();
  const refresh = useCallback(() => {
    if (router.isReady) void router.replace(router.asPath);
  }, [router]);
  useServerPreviewRefresh(experienceId, refresh);
  return null;
}
