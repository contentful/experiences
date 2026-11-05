'use client';

// Bound families and committed route inputs follow Optimization PR #549 (MIT).
import {
  createReactExperiences,
  type Config,
  type ExperiencesRootProps,
} from '@contentful/experiences-react/client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createNextjsRouteKey } from './request-context.js';
import {
  NextjsInitialDataBoundary,
  NextjsRequestPresentation,
  NextjsBrowserRoot,
  useServerPreviewRefresh,
  useNextjsRequestOptions,
} from './router-lifetime.js';

import type {
  BoundNextjsExperiencesRootProps,
  NextjsDefaultRequestRootProps,
  BoundNextjsRequestRootProps,
  NextjsRequestExperienceProps,
} from './request-result.js';
import { mergeNextjsLivePreview, type NextjsLivePreviewConfig } from './live-preview.js';
export type { NextjsLivePreviewConfig, NextjsLivePreviewOptions } from './live-preview.js';
export type {
  BoundNextjsExperiencesRootProps,
  BoundNextjsRequestRootProps,
  NextjsRequestExperienceProps,
  NextjsRequestResult,
} from './request-result.js';

export type { NextjsBrowserConfig } from './browser-config.js';
export type { NextjsDefaultRequestRootProps, NextjsHydrationMode } from './request-result.js';

type RuntimeIdentity = 'spaceId' | 'environmentId' | 'delivery';

export interface NextjsClientExperiencesConfig
  extends
    Omit<
      ExperiencesRootProps,
      RuntimeIdentity | 'children' | 'handoff' | 'snapshot' | 'routeKey' | 'livePreview'
    >,
    Partial<Pick<ExperiencesRootProps, RuntimeIdentity>> {
  readonly config: Config;
  readonly livePreview?: ExperiencesRootProps['livePreview'] | NextjsLivePreviewConfig;
  readonly consent?: { readonly clientDefaults?: ExperiencesRootProps['defaults'] };
}

export function useNextAppAutoPageInputs() {
  const routerPathname = usePathname() ?? '/';
  const search = useSearchParams()?.toString() ?? '';
  const candidate = useMemo(() => {
    const routeKey = createNextjsRouteKey(`${routerPathname}${search ? `?${search}` : ''}`);
    const url = new globalThis.URL(routeKey, 'https://nextjs.invalid');
    return { pathname: url.pathname, routeKey, search: url.search };
  }, [routerPathname, search]);
  const [confirmed, setConfirmed] = useState<typeof candidate>();
  const browserRoute =
    typeof window === 'undefined' ? undefined : createNextjsRouteKey(window.location.href);
  useEffect(() => {
    if (createNextjsRouteKey(window.location.href) === candidate.routeKey)
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
        query: Object.fromEntries(searchParams),
        url,
      },
    };
  }, [pathname, routeKey, currentSearch]);
  return { routeKey, buildPagePayload };
}

/** Browser credentials/callbacks stay in the module that calls this pure binder. */
export function bindNextjsAppRouterClientExperiences(options: NextjsClientExperiencesConfig) {
  const { config, consent, ...rootConfig } = options;
  const { Experience, ExperienceRenderer, useManagedExperience } = createReactExperiences({
    config,
  });

  function BrowserRoot(props: BoundNextjsExperiencesRootProps) {
    const effective = {
      ...rootConfig,
      ...(consent?.clientDefaults ? { defaults: consent.clientDefaults } : {}),
      ...props,
    };
    return (
      <NextjsBrowserRoot
        {...effective}
        livePreview={mergeNextjsLivePreview(rootConfig.livePreview, props.livePreview)}
      />
    );
  }

  function ExperiencesRoot(props: BoundNextjsExperiencesRootProps) {
    const preview = props.livePreview ?? rootConfig.livePreview;
    return preview && 'enabled' in preview && props.routeKey === undefined ? (
      <AppRouterRequestOwner
        initialPagePayload={rootConfig.initialPagePayload}
        {...props}
        Root={BrowserRoot}
        configuredBuilder={rootConfig.buildPagePayload}
      />
    ) : (
      <BrowserRoot {...props} />
    );
  }

  function RequestExperiencesRoot(props: BoundNextjsRequestRootProps) {
    return (
      <AppRouterRequestOwner
        {...props}
        Root={BrowserRoot}
        configuredBuilder={rootConfig.buildPagePayload}
      />
    );
  }

  function RequestExperience({ result, ...props }: NextjsRequestExperienceProps) {
    const initial = useNextjsRequestOptions(result);
    return <Experience {...props} {...initial} />;
  }

  function ExperiencesAnalyticsRoot({
    experienceId,
    ...props
  }: BoundNextjsExperiencesRootProps & { readonly experienceId?: string }) {
    return (
      <ExperiencesRoot {...props} experienceId={experienceId} pageMode="analytics">
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
      <RequestExperiencesRoot {...props} experienceId={experienceId} pageMode="analytics">
        <ServerPreviewRefresh
          experienceId={experienceId ?? props.result?.experience.experienceId}
        />
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

function ServerPreviewRefresh({ experienceId }: { experienceId: string | undefined }) {
  const router = useRouter();
  useServerPreviewRefresh(experienceId, router.refresh);
  return null;
}

function AppRouterRequestOwner({
  Root,
  configuredBuilder,
  ...props
}: BoundNextjsRequestRootProps &
  Pick<BoundNextjsExperiencesRootProps, 'handoff' | 'initialPagePayload' | 'snapshot'> & {
    Root: typeof NextjsBrowserRoot;
    configuredBuilder?: ExperiencesRootProps['buildPagePayload'];
  }) {
  const inputs = useNextAppAutoPageInputs();
  return (
    <NextjsInitialDataBoundary routeKey={inputs.routeKey} requestId={props.result?.requestId}>
      <NextjsRequestPresentation
        {...props}
        Root={Root}
        routeKey={inputs.routeKey}
        configuredBuilder={configuredBuilder}
        buildRoutePayload={inputs.buildPagePayload}
      />
    </NextjsInitialDataBoundary>
  );
}

/** Registry-free owner for a server-supplied request result and children. */
export function NextjsAppRouterRequestRoot({ browser, ...props }: NextjsDefaultRequestRootProps) {
  return <AppRouterRequestOwner {...browser} {...props} Root={NextjsBrowserRoot} />;
}

export function NextjsAppRouterRequestAnalyticsRoot(props: NextjsDefaultRequestRootProps) {
  return (
    <NextjsAppRouterRequestRoot {...props} pageMode="analytics">
      <ServerPreviewRefresh
        experienceId={props.experienceId ?? props.result?.experience.experienceId}
      />
      {props.children}
    </NextjsAppRouterRequestRoot>
  );
}
