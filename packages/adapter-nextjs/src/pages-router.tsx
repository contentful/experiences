'use client';

// Bound components and committed route inputs follow Optimization's Pages binding
// at f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT). React remains the page owner.
import { useRouter } from 'next/router.js';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createExperiences, type ExperiencesRootProps } from '@contentful/experiences-react/client';
import { createPageContext, createRouteKey } from './request-context.js';
import {
  InitialDataBoundary,
  RequestResultBoundary,
  RequestPresentation,
  BrowserRoot,
  useServerPreviewRefresh,
  useRequestOptions,
  useRequestRedirect,
} from './router-lifetime.js';
import { mergePreview, resolvePreviewSession } from './preview.js';
import type { ClientConfig } from './app-router-client.js';
import type {
  BoundRootProps,
  DefaultRequestRootProps,
  BoundRequestRootProps,
  RequestExperienceProps,
  RequestResult,
} from './request-result.js';
export type {
  BoundRootProps,
  BoundRequestRootProps,
  RequestExperienceProps,
  RequestResult,
} from './request-result.js';

export type { BrowserConfig } from './browser-config.js';
export type { DefaultRequestRootProps } from './request-result.js';
export type { PreviewConfig, PreviewContext } from './preview.js';

export type PagesRouterConfig = ClientConfig;

const PagesRequestRouteContext = createContext<{ routeKey: string; ready: boolean } | undefined>(
  undefined
);

/** One stable owner in _app; no separate tracker or navigation event sender. */
export function bindPagesRouterExperiences(config: PagesRouterConfig) {
  const { config: registry, consent, ...runtimeConfig } = config;
  const react = createExperiences({ config: registry });
  function useDestinationRedirect() {
    const router = useRouter();
    return useCallback(
      (target: { path: string }) => {
        void router.replace(target.path);
      },
      [router]
    );
  }
  function Experience(props: Parameters<typeof react.Experience>[0]) {
    const onRedirect = useDestinationRedirect();
    return <react.Experience {...props} onRedirect={props.onRedirect ?? onRedirect} />;
  }
  function useManagedExperience(props: Parameters<typeof react.useManagedExperience>[0]) {
    const onRedirect = useDestinationRedirect();
    return react.useManagedExperience({ ...props, onRedirect: props.onRedirect ?? onRedirect });
  }

  function RouteOwner(props: BoundRequestRootProps) {
    return (
      <RequestResultBoundary result={props.result}>
        <PagesRouterRequestOwner
          {...props}
          preview={mergePreview(runtimeConfig.preview, props.result?.preview ?? props.preview)}
          Root={BoundBrowserRoot}
          configuredBuilder={runtimeConfig.buildPagePayload}
        />
      </RequestResultBoundary>
    );
  }

  function BoundBrowserRoot(props: BoundRootProps) {
    const effective = {
      ...runtimeConfig,
      ...props,
      defaults: props.defaults ?? consent?.clientDefaults ?? runtimeConfig.defaults,
    };
    return (
      <BrowserRoot {...effective} preview={mergePreview(runtimeConfig.preview, props.preview)} />
    );
  }

  function ExperiencesRoot(props: BoundRootProps) {
    const preview = props.preview ?? runtimeConfig.preview;
    return preview && props.routeKey === undefined ? (
      <PagesRouterRequestOwner
        initialPagePayload={runtimeConfig.initialPagePayload}
        {...props}
        preview={mergePreview(runtimeConfig.preview, props.preview)}
        Root={BoundBrowserRoot}
        configuredBuilder={runtimeConfig.buildPagePayload}
      />
    ) : (
      <BoundBrowserRoot {...props} />
    );
  }

  function RequestExperience({ result: supplied, ...props }: RequestExperienceProps) {
    const owner = useContext(PagesRequestRouteContext);
    const router = useRouter();
    const routeKey = owner?.routeKey ?? createRouteKey(router.asPath);
    const ready = owner?.ready ?? router.isReady;
    const { result, initialRedirect, ...initial } = useRequestOptions(supplied);
    const onRedirect = useDestinationRedirect();
    useRequestRedirect(result, initialRedirect, ready && result?.routeKey === routeKey, onRedirect);
    if (initialRedirect) return null;
    return ready && result?.routeKey === routeKey ? (
      <Experience {...props} {...result.experience} {...initial} />
    ) : (
      <Experience {...props} experience={undefined} />
    );
  }

  function ExperiencesAnalyticsRoot(props: BoundRootProps) {
    return (
      <ExperiencesRoot {...props} pageMode="analytics">
        <ServerPreviewRefresh />
        {props.children}
      </ExperiencesRoot>
    );
  }

  function RequestExperiencesAnalyticsRoot(props: BoundRequestRootProps) {
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
    Experience,
    ExperienceRenderer: react.ExperienceRenderer,
    useManagedExperience,
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
}: BoundRootProps & {
  result?: RequestResult;
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
  const previewSession = resolvePreviewSession(props.preview, previewUrl)?.sessionId;
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
    <PagesRequestRouteContext.Provider value={{ routeKey: committedRoute, ready }}>
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
export function PagesRouterRequestRoot({ browser, ...props }: DefaultRequestRootProps) {
  return (
    <RequestResultBoundary result={props.result}>
      <PagesRouterRequestOwner {...browser} {...props} Root={BrowserRoot} />
    </RequestResultBoundary>
  );
}

export function PagesRouterRequestAnalyticsRoot(props: DefaultRequestRootProps) {
  return (
    <PagesRouterRequestRoot {...props} pageMode="analytics">
      <ServerPreviewRefresh />
      {props.children}
    </PagesRouterRequestRoot>
  );
}
