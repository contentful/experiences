// Request-bound and explicit families follow Optimization PR #549 (MIT), adapted
// to XDA descriptor evaluation rather than selected-optimization resolution.
import {
  ServerExperienceRenderer,
  type ServerExperienceRendererProps,
} from '@contentful/experiences-react/server';
import {
  type ExperiencesHandoff,
  type FetchExperienceOptions,
  type FetchResolveOptions,
  type PortableRenderPlan,
} from '@contentful/experiences-node';
import { cookies, headers } from 'next/headers.js';
import { cache, cloneElement, createElement, type ComponentType } from 'react';
import type {
  BoundRequestRootProps,
  RequestExperienceProps,
} from '../presentation/request-result.js';
import { bindExperiencesRequest, configureServerExperiences } from '../request/server-request.js';
import {
  createRouteKey,
  normalizedRequestUrl,
  isSpeculativeRequest,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
} from '../request/context.js';
import { assertPublicRequestPolicy } from '../cache/policy.js';
import {
  createExperiencesContextHandler,
  type ExperiencesResolverContext,
} from '../request/handler.js';
import { toAnonymousIdCookieOptions } from '../request/cookies.js';
import {
  resolveServerValue,
  browserRootConfig,
  serializeRequestResult,
  type ServerConfig,
  type ServerRequestContext,
  type ServerRequestOverrides,
  type ServerRequestResult,
} from '../request/server-config.js';
import { loadPrimaryExperience, resolveRequestPolicy } from '../request/policy.js';
import { resolveLivePreview, livePreviewSessionId } from '../presentation/live-preview.js';
import { AppRouterRequestRoot, AppRouterRequestAnalyticsRoot } from './client.js';

export { serializeRequestResult } from '../request/server-config.js';
export type { CookieConfig } from '../request/cookies.js';
export type { ServerRequestOverrides, ServerRequestPolicy } from '../request/server-config.js';
export type { HydrationMode } from '../presentation/request-result.js';
export type { LivePreviewConfig, LivePreviewOptions } from '../presentation/live-preview.js';

export type AppRouterRequestContext = ServerRequestContext;
export type AppRouterServerExperiencesConfig = ServerConfig;

export interface AppRouterServerExperiencesOptions {
  readonly request?: {
    readonly ExperiencesRoot?: ComponentType<BoundRequestRootProps>;
    readonly ExperiencesAnalyticsRoot?: ComponentType<BoundRequestRootProps>;
    readonly Experience?: ComponentType<RequestExperienceProps>;
  };
}

export type BoundServerRequestRootProps = Omit<
  BoundRequestRootProps,
  'sdk' | 'onStatesReady' | 'beforeInitialPage' | 'buildPagePayload' | 'result'
>;

export type AppRouterExperienceResult = ServerRequestResult;

/** Ordinary callbacks and custom components belong in the client binding. */
export type ServerRequestExperienceProps = Omit<
  ServerExperienceRendererProps,
  'experience' | 'config' | 'renderUnknown' | 'renderError' | 'as' | 'rootProps'
> & {
  readonly as?: Extract<ServerExperienceRendererProps['as'], string>;
  readonly rootProps?: Omit<
    NonNullable<ServerExperienceRendererProps['rootProps']>,
    Extract<keyof NonNullable<ServerExperienceRendererProps['rootProps']>, `on${string}`>
  >;
};

export type ServerExperienceProps = Omit<ServerExperienceRendererProps, 'experience' | 'config'> &
  (
    | { readonly experience: PortableRenderPlan }
    | (FetchExperienceOptions & {
        readonly experience?: never;
        readonly cache?: Exclude<ExperiencesHandoff['cache'], { scope: 'private-request' }>;
        readonly resolveOptions?: Omit<FetchResolveOptions, 'config'>;
      })
  );

export function bindAppRouterServerExperiences(
  options: AppRouterServerExperiencesConfig,
  client?: AppRouterServerExperiencesOptions
) {
  const {
    config,
    consent,
    cookie,
    browser: _browser,
    request: _policy,
    livePreview,
    ...nodeConfig
  } = options;
  const sdk = configureServerExperiences(nodeConfig);

  // One React render-local result supplies both the root and presentation.
  const loadExperience = cache(
    async (overrides: ServerRequestOverrides = {}): Promise<AppRouterExperienceResult> => {
      const cookieStore = await cookies();
      const requestHeaders = new globalThis.Headers(await headers());
      const forwarded = requestHeaders.get(NEXTJS_EXPERIENCES_REQUEST_URL_HEADER);
      if (!forwarded)
        throw new Error(
          'Configure the Experiences request handler before using request components.'
        );
      const requestUrl = normalizedRequestUrl(forwarded).toString();
      const context: AppRouterRequestContext = {
        request: { url: requestUrl, headers: requestHeaders, cookies: cookieStore },
        requestUrl,
        routeKey: createRouteKey(requestUrl),
        headers: requestHeaders,
        cookies: cookieStore,
      };
      const resolved = await resolveRequestPolicy(options, overrides, context);
      const rsc = context.headers.get('rsc') === '1';
      const preview =
        typeof livePreview === 'function'
          ? await livePreview(context)
          : livePreview
            ? resolveLivePreview(livePreview, context.requestUrl, resolved.descriptor.experienceId)
            : undefined;
      // Hybrid navigations load in Web; server-only refreshes use a server round-trip.
      if (
        isSpeculativeRequest(context.headers) ||
        (rsc && resolved.result.hydration !== 'server-only' && !preview)
      )
        return resolved.result;
      const request = bindExperiencesRequest(sdk, {
        request: context.request,
        cookies: context.cookies,
        consent:
          overrides.consent ??
          (consent?.server === undefined
            ? false
            : await resolveServerValue(consent.server, context)),
        locale: overrides.locale ?? nodeConfig.locale,
        livePreview: preview,
        isPreview: overrides.isPreview === true || preview !== undefined,
      });
      try {
        return await loadPrimaryExperience(request, resolved, context, options, !rsc);
      } finally {
        request.destroy();
      }
    }
  );

  function browserResult(result: AppRouterExperienceResult) {
    return serializeRequestResult(result, { metadataKeys: options.request?.metadataKeys });
  }

  function inheritedRootProps() {
    return {
      spaceId: options.spaceId,
      environmentId: options.environmentId,
      ...(options.locale !== undefined ? { locale: options.locale } : {}),
      ...(consent?.clientDefaults ? { defaults: consent.clientDefaults } : {}),
      ...(cookie ? { cookie } : {}),
    };
  }

  function ExperiencesRoot(props: BoundRequestRootProps) {
    if (client?.request?.ExperiencesRoot)
      return createElement(client.request.ExperiencesRoot, {
        ...(options.browser ? { ...browserRootConfig(options), ...inheritedRootProps() } : {}),
        ...props,
      });
    return createElement(AppRouterRequestRoot, {
      ...props,
      ...inheritedRootProps(),
      browser: browserRootConfig(options),
    });
  }

  async function RequestExperiencesRoot(props: BoundServerRequestRootProps) {
    const root = ExperiencesRoot(props);
    return cloneElement(root, { result: browserResult(await loadExperience()) });
  }

  function ExperiencesAnalyticsRoot(props: BoundRequestRootProps) {
    if (client?.request?.ExperiencesAnalyticsRoot)
      return createElement(client.request.ExperiencesAnalyticsRoot, {
        ...(options.browser ? { ...browserRootConfig(options), ...inheritedRootProps() } : {}),
        ...props,
      });
    return createElement(AppRouterRequestAnalyticsRoot, {
      ...props,
      ...inheritedRootProps(),
      browser: browserRootConfig(options),
    });
  }

  async function RequestExperiencesAnalyticsRoot(props: BoundServerRequestRootProps) {
    const root = ExperiencesAnalyticsRoot(props);
    return cloneElement(root, { result: browserResult(await loadExperience()) });
  }

  async function RequestExperience(props: ServerRequestExperienceProps) {
    const result = await loadExperience();
    if (result.hydration === 'preserve-server') {
      if (!client?.request?.Experience)
        throw new TypeError(
          'Supply the client binding request.Experience for hybrid request rendering.'
        );
      return createElement(client.request!.Experience, {
        ...props,
        result: browserResult(result),
      });
    }
    return result.plan ? (
      <ServerExperienceRenderer {...props} config={config} experience={result.plan} />
    ) : null;
  }

  async function Experience(props: ServerExperienceProps) {
    if (props.experience !== undefined) {
      return <ServerExperienceRenderer {...props} config={config} experience={props.experience} />;
    }
    const {
      experienceId,
      locale,
      parameters,
      personalization,
      extensions,
      preview,
      resolveOptions,
      cache: cachePolicy,
      ...presentation
    } = props;
    const descriptor = { experienceId, locale, parameters, personalization, extensions, preview };
    if (cachePolicy) assertPublicRequestPolicy({ cache: cachePolicy, fetchOptions: descriptor });
    const request = sdk.forRequest({ consent: false });
    try {
      const plan = await request.fetchExperience(descriptor, { ...resolveOptions, config });
      return <ServerExperienceRenderer {...presentation} experience={plan} config={config} />;
    } finally {
      request.destroy();
    }
  }

  function handlerContext(context: ExperiencesResolverContext): ServerRequestContext {
    const requestUrl = normalizedRequestUrl(
      context.headers.get(NEXTJS_EXPERIENCES_REQUEST_URL_HEADER) ?? context.request.url
    ).toString();
    return {
      request: { url: requestUrl, headers: context.headers, cookies: context.cookies },
      headers: context.headers,
      cookies: context.cookies,
      requestUrl,
      routeKey: createRouteKey(requestUrl),
    };
  }

  return {
    Experience,
    ExperiencesRoot,
    ExperiencesAnalyticsRoot,
    request: {
      loadExperience,
      Experience: RequestExperience,
      ExperiencesRoot: RequestExperiencesRoot,
      ExperiencesAnalyticsRoot: RequestExperiencesAnalyticsRoot,
    },
    requestHandler: createExperiencesContextHandler({
      sdk,
      consent:
        consent?.server === undefined
          ? false
          : (context) => resolveServerValue(consent.server!, handlerContext(context)),
      locale: nodeConfig.locale,
      cookieOptions: toAnonymousIdCookieOptions(cookie),
      livePreview: livePreview
        ? async (context) => {
            const serverContext = handlerContext(context as ExperiencesResolverContext);
            if (typeof livePreview === 'function') return livePreview(serverContext);
            if (!livePreviewSessionId(livePreview, serverContext.requestUrl)) return undefined;
            const descriptor = options.request?.experience
              ? await resolveServerValue(options.request.experience, serverContext)
              : undefined;
            return resolveLivePreview(
              livePreview,
              serverContext.requestUrl,
              descriptor?.experienceId
            );
          }
        : undefined,
    }),
  };
}
