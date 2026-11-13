'use client';

// Bound families and committed route inputs follow Optimization PR #549 (MIT).
import {
  createExperiences,
  type Config,
  type ExperiencesRootProps,
} from '@contentful/experiences-react/client';
import { usePathname, useSearchParams } from 'next/navigation.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRouteKey, queryFromSearchParams } from './request-context.js';
import {
  InitialDataBoundary,
  RequestResultBoundary,
  RequestPresentation,
  BrowserRoot,
  useRequestOptions,
} from './router-lifetime.js';
import { ServerPreviewRefresh } from './server-preview-refresh.js';

import type {
  BoundRootProps,
  DefaultRequestRootProps,
  BoundRequestRootProps,
  RequestExperienceProps,
} from './request-result.js';
import { mergePreview, type PreviewConfig } from './preview.js';
export type { PreviewConfig, PreviewContext } from './preview.js';
export type {
  BoundRootProps,
  BoundRequestRootProps,
  RequestExperienceProps,
  RequestResult,
} from './request-result.js';

export type { BrowserConfig } from './browser-config.js';
export type { DefaultRequestRootProps } from './request-result.js';

type RuntimeIdentity = 'spaceId' | 'environmentId' | 'delivery';

export interface ClientConfig
  extends
    Omit<
      ExperiencesRootProps,
      RuntimeIdentity | 'children' | 'handoff' | 'handoffKey' | 'snapshot' | 'routeKey' | 'preview'
    >,
    Partial<Pick<ExperiencesRootProps, RuntimeIdentity>> {
  readonly config: Config;
  readonly preview?: PreviewConfig;
  readonly consent?: { readonly clientDefaults?: ExperiencesRootProps['defaults'] };
}

export function useAppAutoPageInputs() {
  const routerPathname = usePathname() ?? '/';
  const search = useSearchParams()?.toString() ?? '';
  const candidate = useMemo(() => {
    const routeKey = createRouteKey(`${routerPathname}${search ? `?${search}` : ''}`);
    const url = new globalThis.URL(routeKey, 'https://nextjs.invalid');
    return { pathname: url.pathname, routeKey, search: url.search };
  }, [routerPathname, search]);
  const [confirmed, setConfirmed] = useState<typeof candidate>();
  const browserRoute =
    typeof window === 'undefined' ? undefined : createRouteKey(window.location.href);
  useEffect(() => {
    if (createRouteKey(window.location.href) === candidate.routeKey)
      setConfirmed((previous) =>
        previous?.routeKey === candidate.routeKey ? previous : candidate
      );
  }, [candidate]);
  const current =
    browserRoute !== candidate.routeKey &&
    confirmed !== undefined &&
    confirmed.routeKey === browserRoute
      ? confirmed
      : candidate;
  const { pathname, routeKey, search: currentSearch } = current;
  const buildPagePayload = useCallback<
    NonNullable<ExperiencesRootProps['buildPagePayload']>
  >(() => {
    const searchParams = new globalThis.URLSearchParams(currentSearch);
    const url =
      typeof window === 'undefined'
        ? routeKey
        : new globalThis.URL(routeKey, window.location.origin).toString();
    return {
      properties: {
        path: pathname,
        search: currentSearch,
        query: queryFromSearchParams(searchParams),
        url,
      },
    };
  }, [pathname, routeKey, currentSearch]);
  return { routeKey, buildPagePayload };
}

/** Browser credentials/callbacks stay in the module that calls this pure binder. */
export function bindAppRouterClientExperiences(options: ClientConfig) {
  const { config, consent, ...rootConfig } = options;
  const { Experience, ExperienceRenderer, useManagedExperience } = createExperiences({
    config,
  });

  function BoundBrowserRoot(props: BoundRootProps) {
    const effective = {
      ...rootConfig,
      ...props,
      defaults: props.defaults ?? consent?.clientDefaults ?? rootConfig.defaults,
    };
    return <BrowserRoot {...effective} preview={mergePreview(rootConfig.preview, props.preview)} />;
  }

  function ExperiencesRoot(props: BoundRootProps) {
    const preview = props.preview ?? rootConfig.preview;
    return preview && props.routeKey === undefined ? (
      <AppRouterRequestOwner
        initialPagePayload={rootConfig.initialPagePayload}
        {...props}
        Root={BoundBrowserRoot}
        configuredBuilder={rootConfig.buildPagePayload}
      />
    ) : (
      <BoundBrowserRoot {...props} />
    );
  }

  function RequestExperiencesRoot(props: BoundRequestRootProps) {
    return (
      <RequestResultBoundary result={props.result}>
        <AppRouterRequestOwner
          {...props}
          preview={mergePreview(rootConfig.preview, props.preview)}
          Root={BoundBrowserRoot}
          configuredBuilder={rootConfig.buildPagePayload}
        />
      </RequestResultBoundary>
    );
  }

  function RequestExperience({ result: supplied, ...props }: RequestExperienceProps) {
    const { routeKey } = useAppAutoPageInputs();
    const { result, ...initial } = useRequestOptions(supplied);
    return result?.routeKey === routeKey ? (
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
      <RequestExperiencesRoot {...props} pageMode="analytics">
        <ServerPreviewRefresh />
        {props.children}
      </RequestExperiencesRoot>
    );
  }

  return {
    ExperiencesRoot,
    ExperiencesAnalyticsRoot,
    Experience,
    ExperienceRenderer,
    useManagedExperience,
    request: {
      ExperiencesRoot: RequestExperiencesRoot,
      ExperiencesAnalyticsRoot: RequestExperiencesAnalyticsRoot,
      Experience: RequestExperience,
    },
  };
}

function AppRouterRequestOwner({
  Root,
  configuredBuilder,
  ...props
}: BoundRequestRootProps &
  Pick<BoundRootProps, 'handoff' | 'initialPagePayload' | 'snapshot'> & {
    Root: typeof BrowserRoot;
    configuredBuilder?: ExperiencesRootProps['buildPagePayload'];
  }) {
  const inputs = useAppAutoPageInputs();
  return (
    <InitialDataBoundary routeKey={inputs.routeKey} requestId={props.result?.requestId}>
      <RequestPresentation
        {...props}
        Root={Root}
        routeKey={inputs.routeKey}
        configuredBuilder={configuredBuilder}
        buildRoutePayload={inputs.buildPagePayload}
      />
    </InitialDataBoundary>
  );
}

/** Registry-free owner for a server-supplied request result and children. */
export function AppRouterRequestRoot({ browser, ...props }: DefaultRequestRootProps) {
  return (
    <RequestResultBoundary result={props.result}>
      <AppRouterRequestOwner {...browser} {...props} Root={BrowserRoot} />
    </RequestResultBoundary>
  );
}

export function AppRouterRequestAnalyticsRoot(props: DefaultRequestRootProps) {
  return (
    <AppRouterRequestRoot {...props} pageMode="analytics">
      <ServerPreviewRefresh />
      {props.children}
    </AppRouterRequestRoot>
  );
}
