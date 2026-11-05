// Request-bound and explicit families follow Optimization PR #549 (MIT), adapted
// to XDA descriptor evaluation rather than selected-optimization resolution.
import {
  ServerExperienceRenderer,
  type ServerExperienceRendererProps,
} from '@contentful/experiences-react/server';
import {
  type ExperiencesHandoff,
  type RuntimeFetchExperienceOptions,
  type RuntimeFetchResolveOptions,
  type PortableRenderPlan,
} from '@contentful/experiences-node';
import { cookies, headers } from 'next/headers.js';
import { cache, cloneElement, createElement, type ComponentType } from 'react';
import type {
  BoundNextjsRequestRootProps,
  NextjsRequestExperienceProps,
} from './request-result.js';
import {
  bindNextjsExperiencesRequest,
  configureNextjsServerExperiences,
} from './server-request.js';
import {
  createNextjsRouteKey,
  normalizedRequestUrl,
  isNextjsSpeculativeRequest,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
} from './request-context.js';
import { assertNextjsPublicRequestPolicy } from './cache.js';
import {
  createNextjsExperiencesContextHandler,
  type NextjsExperiencesResolverContext,
} from './request-handler.js';
import { toNextjsAnonymousIdCookieOptions } from './cookies.js';
import {
  resolveNextjsServerValue,
  nextjsBrowserRootConfig,
  serializeNextjsRequestResult,
  type NextjsServerExperiencesConfig,
  type NextjsServerRequestContext,
  type NextjsServerRequestOverrides,
  type NextjsServerRequestResult,
} from './server-config.js';
import { loadNextjsPrimaryExperience, resolveNextjsRequestPolicy } from './request-policy.js';
import {
  NextjsAppRouterRequestRoot,
  NextjsAppRouterRequestAnalyticsRoot,
} from './app-router-client.js';

export { serializeNextjsRequestResult } from './server-config.js';
export type { NextjsCookieConfig } from './cookies.js';
export type { NextjsServerRequestOverrides, NextjsServerRequestPolicy } from './server-config.js';
export type { NextjsHydrationMode } from './request-result.js';

export type NextjsAppRouterRequestContext = NextjsServerRequestContext;
export type NextjsAppRouterServerExperiencesConfig = NextjsServerExperiencesConfig;

export interface NextjsAppRouterServerExperiencesOptions {
  readonly request?: {
    readonly ExperiencesRoot?: ComponentType<BoundNextjsRequestRootProps>;
    readonly ExperiencesAnalyticsRoot?: ComponentType<BoundNextjsRequestRootProps>;
    readonly Experience?: ComponentType<NextjsRequestExperienceProps>;
  };
}

export type BoundNextjsServerRequestRootProps = Omit<
  BoundNextjsRequestRootProps,
  'sdk' | 'onStatesReady' | 'beforeInitialPage' | 'buildPagePayload' | 'result'
>;

export type NextjsAppRouterExperienceResult = NextjsServerRequestResult;

/** Ordinary callbacks and custom components belong in the client binding. */
export type NextjsServerRequestExperienceProps = Omit<
  ServerExperienceRendererProps,
  'experience' | 'config' | 'renderUnknown' | 'renderError' | 'as' | 'rootProps'
> & {
  readonly as?: Extract<ServerExperienceRendererProps['as'], string>;
  readonly rootProps?: Omit<
    NonNullable<ServerExperienceRendererProps['rootProps']>,
    Extract<keyof NonNullable<ServerExperienceRendererProps['rootProps']>, `on${string}`>
  >;
};

export type NextjsServerExperienceProps = Omit<
  ServerExperienceRendererProps,
  'experience' | 'config'
> &
  (
    | { readonly experience: PortableRenderPlan }
    | (RuntimeFetchExperienceOptions & {
        readonly experience?: never;
        readonly cache?: Exclude<ExperiencesHandoff['cache'], { scope: 'private-request' }>;
        readonly resolveOptions?: Omit<RuntimeFetchResolveOptions, 'config'>;
      })
  );

export function bindNextjsAppRouterServerExperiences(
  options: NextjsAppRouterServerExperiencesConfig,
  client?: NextjsAppRouterServerExperiencesOptions
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
  const sdk = configureNextjsServerExperiences(nodeConfig);

  // One React render-local result supplies both the root and presentation.
  const loadExperience = cache(
    async (
      overrides: NextjsServerRequestOverrides = {}
    ): Promise<NextjsAppRouterExperienceResult> => {
      const cookieStore = await cookies();
      const requestHeaders = new globalThis.Headers(await headers());
      const forwarded = requestHeaders.get(NEXTJS_EXPERIENCES_REQUEST_URL_HEADER);
      if (!forwarded)
        throw new Error(
          'Configure the Experiences request handler before using request components.'
        );
      const requestUrl = normalizedRequestUrl(forwarded).toString();
      const context: NextjsAppRouterRequestContext = {
        request: { url: requestUrl, headers: requestHeaders, cookies: cookieStore },
        requestUrl,
        routeKey: createNextjsRouteKey(requestUrl),
        headers: requestHeaders,
        cookies: cookieStore,
      };
      const resolved = await resolveNextjsRequestPolicy(options, overrides, context);
      const rsc = context.headers.get('rsc') === '1';
      const preview = await livePreview?.(context);
      // Hybrid navigations load in Web; server-only refreshes use a server round-trip.
      if (
        isNextjsSpeculativeRequest(context.headers) ||
        (rsc && resolved.result.hydration !== 'server-only' && !preview)
      )
        return resolved.result;
      const request = bindNextjsExperiencesRequest(sdk, {
        request: context.request,
        cookies: context.cookies,
        consent:
          overrides.consent ??
          (consent?.server === undefined
            ? false
            : await resolveNextjsServerValue(consent.server, context)),
        locale: overrides.locale ?? nodeConfig.locale,
        livePreview: preview,
        isPreview: overrides.isPreview === true || preview !== undefined,
      });
      try {
        return await loadNextjsPrimaryExperience(request, resolved, context, options, !rsc);
      } finally {
        request.destroy();
      }
    }
  );

  function browserResult(result: NextjsAppRouterExperienceResult) {
    return serializeNextjsRequestResult(result, { metadataKeys: options.request?.metadataKeys });
  }

  function ExperiencesRoot(props: BoundNextjsRequestRootProps) {
    if (client?.request?.ExperiencesRoot)
      return createElement(client.request.ExperiencesRoot, props);
    return createElement(NextjsAppRouterRequestRoot, {
      ...props,
      spaceId: options.spaceId,
      environmentId: options.environmentId,
      ...(options.locale !== undefined ? { locale: options.locale } : {}),
      browser: nextjsBrowserRootConfig(options),
      ...(consent?.clientDefaults ? { defaults: consent.clientDefaults } : {}),
      ...(cookie ? { cookie } : {}),
    });
  }

  async function RequestExperiencesRoot(props: BoundNextjsServerRequestRootProps) {
    const root = ExperiencesRoot(props);
    return cloneElement(root, { result: browserResult(await loadExperience()) });
  }

  function ExperiencesAnalyticsRoot(props: BoundNextjsRequestRootProps) {
    if (client?.request?.ExperiencesAnalyticsRoot)
      return createElement(client.request.ExperiencesAnalyticsRoot, props);
    return createElement(NextjsAppRouterRequestAnalyticsRoot, {
      ...props,
      spaceId: options.spaceId,
      environmentId: options.environmentId,
      ...(options.locale !== undefined ? { locale: options.locale } : {}),
      browser: nextjsBrowserRootConfig(options),
      ...(consent?.clientDefaults ? { defaults: consent.clientDefaults } : {}),
      ...(cookie ? { cookie } : {}),
    });
  }

  async function RequestExperiencesAnalyticsRoot(props: BoundNextjsServerRequestRootProps) {
    const root = ExperiencesAnalyticsRoot(props);
    return cloneElement(root, { result: browserResult(await loadExperience()) });
  }

  async function RequestExperience(props: NextjsServerRequestExperienceProps) {
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

  async function Experience(props: NextjsServerExperienceProps) {
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
    if (cachePolicy)
      assertNextjsPublicRequestPolicy({ cache: cachePolicy, fetchOptions: descriptor });
    const request = sdk.forRequest({ consent: false });
    try {
      const plan = await request.fetchExperience(descriptor, { ...resolveOptions, config });
      return <ServerExperienceRenderer {...presentation} experience={plan} config={config} />;
    } finally {
      request.destroy();
    }
  }

  function handlerContext(context: NextjsExperiencesResolverContext): NextjsServerRequestContext {
    const requestUrl = normalizedRequestUrl(
      context.headers.get(NEXTJS_EXPERIENCES_REQUEST_URL_HEADER) ?? context.request.url
    ).toString();
    return {
      request: { url: requestUrl, headers: context.headers, cookies: context.cookies },
      headers: context.headers,
      cookies: context.cookies,
      requestUrl,
      routeKey: createNextjsRouteKey(requestUrl),
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
    requestHandler: createNextjsExperiencesContextHandler({
      sdk,
      consent:
        consent?.server === undefined
          ? false
          : (context) => resolveNextjsServerValue(consent.server!, handlerContext(context)),
      locale: nodeConfig.locale,
      cookieOptions: toNextjsAnonymousIdCookieOptions(cookie),
      livePreview: livePreview
        ? (context) => livePreview(handlerContext(context as NextjsExperiencesResolverContext))
        : undefined,
    }),
  };
}
