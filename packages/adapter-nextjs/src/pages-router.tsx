'use client';

// Bound components and committed route inputs follow Optimization's Pages binding
// at f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT). React remains the page owner.
import { useRouter } from 'next/router.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createReactExperiences,
  type ExperiencesRootProps,
} from '@contentful/experiences-react/client';
import { createNextjsPageContext, createNextjsRouteKey } from './request-context.js';
import {
  NextjsInitialDataBoundary,
  NextjsRequestPresentation,
  NextjsBrowserRoot,
  useServerPreviewRefresh,
  useNextjsRequestOptions,
} from './router-lifetime.js';
import type { NextjsClientExperiencesConfig } from './app-router-client.js';
import type {
  BoundNextjsExperiencesRootProps,
  NextjsDefaultRequestRootProps,
  BoundNextjsRequestRootProps,
  NextjsRequestExperienceProps,
} from './request-result.js';
export type {
  BoundNextjsExperiencesRootProps,
  BoundNextjsRequestRootProps,
  NextjsRequestExperienceProps,
  NextjsRequestResult,
} from './request-result.js';

export type { NextjsBrowserConfig } from './browser-config.js';
export type { NextjsDefaultRequestRootProps, NextjsHydrationMode } from './request-result.js';

export type NextjsPagesRouterExperiencesConfig = NextjsClientExperiencesConfig;

/** One stable owner in _app; no separate tracker or navigation event sender. */
export function bindNextjsPagesRouterExperiences(config: NextjsPagesRouterExperiencesConfig) {
  const { config: registry, consent, ...runtimeConfig } = config;
  const react = createReactExperiences({ config: registry });

  function RouteOwner(props: BoundNextjsRequestRootProps) {
    return (
      <PagesRouterRequestOwner
        {...props}
        Root={ExperiencesRoot}
        configuredBuilder={runtimeConfig.buildPagePayload}
      />
    );
  }

  function ExperiencesRoot(props: BoundNextjsExperiencesRootProps) {
    const effective = {
      ...runtimeConfig,
      ...(consent?.clientDefaults ? { defaults: consent.clientDefaults } : {}),
      ...props,
      beforeInitialPage: props.beforeInitialPage ?? runtimeConfig.beforeInitialPage,
      onStatesReady: props.onStatesReady ?? runtimeConfig.onStatesReady,
    };
    return <NextjsBrowserRoot {...effective} />;
  }

  function RequestExperience({ result, ...props }: NextjsRequestExperienceProps) {
    const initial = useNextjsRequestOptions(result);
    return <react.Experience {...props} {...initial} />;
  }

  function ExperiencesAnalyticsRoot({
    experienceId,
    ...props
  }: BoundNextjsExperiencesRootProps & { readonly experienceId?: string }) {
    return (
      <ExperiencesRoot {...props} pageMode="analytics">
        <ServerPreviewRefresh experienceId={experienceId} />
        {props.children}
      </ExperiencesRoot>
    );
  }

  function RequestExperiencesAnalyticsRoot({
    experienceId,
    ...props
  }: BoundNextjsRequestRootProps & { readonly experienceId?: string }) {
    return (
      <RouteOwner {...props} pageMode="analytics">
        <ServerPreviewRefresh
          experienceId={experienceId ?? props.result?.experience.experienceId}
        />
        {props.children}
      </RouteOwner>
    );
  }

  return {
    ExperiencesRoot,
    ExperiencesAnalyticsRoot,
    Experience: react.Experience,
    ExperienceRenderer: react.ExperienceRenderer,
    useManagedExperience: react.useManagedExperience,
    request: {
      ExperiencesRoot: RouteOwner,
      ExperiencesAnalyticsRoot: RequestExperiencesAnalyticsRoot,
      Experience: RequestExperience,
    },
  };
}

function PagesRouterRequestOwner({
  Root,
  configuredBuilder,
  ...props
}: BoundNextjsRequestRootProps & {
  Root: typeof NextjsBrowserRoot;
  configuredBuilder?: ExperiencesRootProps['buildPagePayload'];
}) {
  const router = useRouter();
  const shallowTransition = useRef(false);
  const [route, setRoute] = useState(() => ({
    data: props.result,
    key: createNextjsRouteKey(
      router.isReady ? router.asPath : (props.result?.routeKey ?? router.asPath)
    ),
  }));
  // Page props can precede asPath/history and the completion event. Adopt
  // their route and descriptor atomically, before any child request effects.
  if (route.data !== props.result)
    setRoute({
      data: props.result,
      key: shallowTransition.current
        ? route.key
        : createNextjsRouteKey(props.result?.routeKey ?? router.asPath),
    });
  useEffect(() => {
    // Ignore canceled transitions, hashes and shallow UI updates. Only a normal
    // committed route changes the root's ordinary XDA intent.
    const complete = (url: string, { shallow }: { shallow: boolean }) => {
      if (!shallow) setRoute((current) => ({ ...current, key: createNextjsRouteKey(url) }));
    };
    const start = (_url: string, { shallow }: { shallow: boolean }) => {
      shallowTransition.current = shallow;
    };
    const cancel = () => {
      shallowTransition.current = false;
    };
    if (router.isReady)
      setRoute((current) => ({ ...current, key: createNextjsRouteKey(router.asPath) }));
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
      ? createNextjsRouteKey(router.asPath)
      : route.key;
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
      properties: createNextjsPageContext({
        path: url.pathname,
        searchParams: url.searchParams,
        url: typeof window === 'undefined' ? committedRoute : url.toString(),
        referrer: typeof document === 'undefined' ? '' : document.referrer,
      }),
    };
  }, [ready, committedRoute]);
  return (
    <NextjsInitialDataBoundary routeKey={committedRoute} requestId={props.result?.requestId}>
      <NextjsRequestPresentation
        {...props}
        Root={Root}
        routeKey={committedRoute}
        ready={ready}
        configuredBuilder={configuredBuilder}
        buildRoutePayload={buildPagePayload}
      />
    </NextjsInitialDataBoundary>
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

/** Registry-free owner for the normal _app request path. */
export function NextjsPagesRouterRequestRoot({ browser, ...props }: NextjsDefaultRequestRootProps) {
  return <PagesRouterRequestOwner {...browser} {...props} Root={NextjsBrowserRoot} />;
}

export function NextjsPagesRouterRequestAnalyticsRoot(props: NextjsDefaultRequestRootProps) {
  return (
    <NextjsPagesRouterRequestRoot {...props} pageMode="analytics">
      <ServerPreviewRefresh
        experienceId={props.experienceId ?? props.result?.experience.experienceId}
      />
      {props.children}
    </NextjsPagesRouterRequestRoot>
  );
}
