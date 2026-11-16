'use client';

// Bound components and committed route inputs follow Optimization's Pages binding
// at f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT). React remains the page owner.
import { useRouter } from 'next/router.js';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  createReactExperiences,
  type ExperiencesRootProps,
} from '@contentful/experiences-react/client';
import { createNextjsPageContext, createNextjsRouteKey } from './request-context.js';
import {
  NextjsInitialDataBoundary,
  NextjsRequestResultBoundary,
  NextjsRequestPresentation,
  NextjsBrowserRoot,
  useServerPreviewRefresh,
  useNextjsRequestOptions,
} from './router-lifetime.js';
import { mergeNextjsPreview, resolveNextjsPreviewSession } from './preview.js';
import type { NextjsClientExperiencesConfig } from './app-router-client.js';
import type {
  BoundNextjsExperiencesRootProps,
  NextjsDefaultRequestRootProps,
  BoundNextjsRequestRootProps,
  NextjsRequestExperienceProps,
  NextjsRequestResult,
} from './request-result.js';
export type {
  BoundNextjsExperiencesRootProps,
  BoundNextjsRequestRootProps,
  NextjsRequestExperienceProps,
  NextjsRequestResult,
} from './request-result.js';

export type { NextjsBrowserConfig } from './browser-config.js';
export type { NextjsDefaultRequestRootProps } from './request-result.js';
export type { NextjsPreviewConfig, NextjsPreviewContext } from './preview.js';

export type NextjsPagesRouterExperiencesConfig = NextjsClientExperiencesConfig;

const PagesRequestRouteContext = createContext<{ routeKey: string; ready: boolean } | undefined>(
  undefined
);

/** One stable owner in _app; no separate tracker or navigation event sender. */
export function bindNextjsPagesRouterExperiences(config: NextjsPagesRouterExperiencesConfig) {
  const { config: registry, consent, ...runtimeConfig } = config;
  const react = createReactExperiences({ config: registry });

  function RouteOwner(props: BoundNextjsRequestRootProps) {
    return (
      <NextjsRequestResultBoundary result={props.result}>
        <PagesRouterRequestOwner
          {...props}
          preview={mergeNextjsPreview(
            runtimeConfig.preview,
            props.result?.preview ?? props.preview
          )}
          Root={BrowserRoot}
          configuredBuilder={runtimeConfig.buildPagePayload}
        />
      </NextjsRequestResultBoundary>
    );
  }

  function BrowserRoot(props: BoundNextjsExperiencesRootProps) {
    const effective = {
      ...runtimeConfig,
      ...props,
      defaults: props.defaults ?? consent?.clientDefaults ?? runtimeConfig.defaults,
    };
    return (
      <NextjsBrowserRoot
        {...effective}
        preview={mergeNextjsPreview(runtimeConfig.preview, props.preview)}
      />
    );
  }

  function ExperiencesRoot(props: BoundNextjsExperiencesRootProps) {
    const preview = props.preview ?? runtimeConfig.preview;
    return preview && props.routeKey === undefined ? (
      <PagesRouterRequestOwner
        initialPagePayload={runtimeConfig.initialPagePayload}
        {...props}
        preview={mergeNextjsPreview(runtimeConfig.preview, props.preview)}
        Root={BrowserRoot}
        configuredBuilder={runtimeConfig.buildPagePayload}
      />
    ) : (
      <BrowserRoot {...props} />
    );
  }

  function RequestExperience({ result: supplied, ...props }: NextjsRequestExperienceProps) {
    const owner = useContext(PagesRequestRouteContext);
    const router = useRouter();
    const routeKey = owner?.routeKey ?? createNextjsRouteKey(router.asPath);
    const ready = owner?.ready ?? router.isReady;
    const { result, ...initial } = useNextjsRequestOptions(supplied);
    return ready && result?.routeKey === routeKey ? (
      <react.Experience {...props} {...result.experience} {...initial} />
    ) : (
      <react.Experience {...props} experience={undefined} />
    );
  }

  function ExperiencesAnalyticsRoot(props: BoundNextjsExperiencesRootProps) {
    return (
      <ExperiencesRoot {...props} pageMode="analytics">
        <ServerPreviewRefresh />
        {props.children}
      </ExperiencesRoot>
    );
  }

  function RequestExperiencesAnalyticsRoot(props: BoundNextjsRequestRootProps) {
    return (
      <RouteOwner {...props} pageMode="analytics">
        <ServerPreviewRefresh />
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
}: BoundNextjsExperiencesRootProps & {
  result?: NextjsRequestResult;
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
    previewKey: createNextjsRouteKey(
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
        : createNextjsRouteKey(props.result?.routeKey ?? router.asPath),
      key: shallowTransition.current
        ? route.key
        : createNextjsRouteKey(props.result?.routeKey ?? router.asPath),
    });
  useEffect(() => {
    // Ignore canceled transitions, hashes and shallow UI updates. Only a normal
    // committed route changes the root's ordinary XDA intent.
    const complete = (url: string, { shallow }: { shallow: boolean }) => {
      const previewKey = createNextjsRouteKey(url);
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
        key: createNextjsRouteKey(router.asPath),
        previewKey: createNextjsRouteKey(router.asPath),
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
      ? createNextjsRouteKey(router.asPath)
      : route.key;
  const previewUrl = !props.result && router.isReady ? router.asPath : route.previewKey;
  const previewSession = resolveNextjsPreviewSession(props.preview, previewUrl)?.sessionId;
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
    <PagesRequestRouteContext.Provider value={{ routeKey: committedRoute, ready }}>
      <NextjsInitialDataBoundary
        routeKey={`${committedRoute}#preview=${previewSession ?? ''}`}
        requestId={props.result?.requestId}
      >
        <NextjsRequestPresentation
          {...props}
          Root={Root}
          routeKey={committedRoute}
          previewUrl={previewUrl}
          ready={ready}
          configuredBuilder={configuredBuilder}
          buildRoutePayload={buildPagePayload}
        />
      </NextjsInitialDataBoundary>
    </PagesRequestRouteContext.Provider>
  );
}

function ServerPreviewRefresh() {
  const router = useRouter();
  const refresh = useCallback(() => {
    if (router.isReady) void router.replace(router.asPath);
  }, [router]);
  useServerPreviewRefresh(refresh);
  return null;
}

/** Registry-free owner for the normal _app request path. */
export function NextjsPagesRouterRequestRoot({ browser, ...props }: NextjsDefaultRequestRootProps) {
  return (
    <NextjsRequestResultBoundary result={props.result}>
      <PagesRouterRequestOwner {...browser} {...props} Root={NextjsBrowserRoot} />
    </NextjsRequestResultBoundary>
  );
}

export function NextjsPagesRouterRequestAnalyticsRoot(props: NextjsDefaultRequestRootProps) {
  return (
    <NextjsPagesRouterRequestRoot {...props} pageMode="analytics">
      <ServerPreviewRefresh />
      {props.children}
    </NextjsPagesRouterRequestRoot>
  );
}
