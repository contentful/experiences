'use client';

// Bound families and committed route inputs follow Optimization PR #549 (MIT).
import {
  createExperiences,
  type Config,
  type ExperiencesRootProps,
} from '@contentful/experiences-react/client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRouteKey, queryFromSearchParams } from '../request/context.js';
import {
  InitialDataBoundary,
  RequestPresentation,
  BrowserRoot,
  useServerPreviewRefresh,
  useRequestOptions,
} from '../presentation/router-lifetime.js';

import type {
  BoundRootProps,
  DefaultRequestRootProps,
  BoundRequestRootProps,
  RequestExperienceProps,
} from '../presentation/request-result.js';
import { mergeLivePreview, type LivePreviewConfig } from '../presentation/live-preview.js';
export type { LivePreviewConfig, LivePreviewOptions } from '../presentation/live-preview.js';
export type {
  BoundRootProps,
  BoundRequestRootProps,
  RequestExperienceProps,
  RequestResult,
} from '../presentation/request-result.js';

export type { BrowserConfig } from '../presentation/browser-config.js';
export type { DefaultRequestRootProps, HydrationMode } from '../presentation/request-result.js';

type RuntimeIdentity = 'spaceId' | 'environmentId' | 'delivery';

export interface ClientConfig
  extends
    Omit<
      ExperiencesRootProps,
      | RuntimeIdentity
      | 'children'
      | 'handoff'
      | 'handoffKey'
      | 'snapshot'
      | 'routeKey'
      | 'livePreview'
    >,
    Partial<Pick<ExperiencesRootProps, RuntimeIdentity>> {
  readonly config: Config;
  readonly livePreview?: ExperiencesRootProps['livePreview'] | LivePreviewConfig;
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
      ...(consent?.clientDefaults ? { defaults: consent.clientDefaults } : {}),
      ...props,
    };
    return (
      <BrowserRoot
        {...effective}
        livePreview={mergeLivePreview(rootConfig.livePreview, props.livePreview)}
      />
    );
  }

  function ExperiencesRoot(props: BoundRootProps) {
    const preview = props.livePreview ?? rootConfig.livePreview;
    return preview && 'enabled' in preview && props.routeKey === undefined ? (
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
      <AppRouterRequestOwner
        {...props}
        Root={BoundBrowserRoot}
        configuredBuilder={rootConfig.buildPagePayload}
      />
    );
  }

  function RequestExperience({ result, ...props }: RequestExperienceProps) {
    const initial = useRequestOptions(result);
    return <Experience {...props} {...initial} />;
  }

  function ExperiencesAnalyticsRoot({
    experienceId,
    ...props
  }: BoundRootProps & { readonly experienceId?: string }) {
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
  }: BoundRequestRootProps & { readonly experienceId?: string }) {
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
  return <AppRouterRequestOwner {...browser} {...props} Root={BrowserRoot} />;
}

export function AppRouterRequestAnalyticsRoot(props: DefaultRequestRootProps) {
  return (
    <AppRouterRequestRoot {...props} pageMode="analytics">
      <ServerPreviewRefresh
        experienceId={props.experienceId ?? props.result?.experience.experienceId}
      />
      {props.children}
    </AppRouterRequestRoot>
  );
}
