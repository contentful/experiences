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
import { cache, createElement, type ComponentType } from 'react';
import { ServerPreviewRefresh } from './server-preview-refresh.js';
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
  resolveNextjsPreview,
  resolveNextjsPreviewSession,
  mergeNextjsPreview,
} from './preview.js';
import {
  NextjsAppRouterRequestRoot,
  NextjsAppRouterRequestAnalyticsRoot,
} from './app-router-client.js';

export { serializeNextjsRequestResult } from './server-config.js';
export type { NextjsCookieConfig } from './cookies.js';
export type { NextjsServerRequestOverrides, NextjsServerRequestPolicy } from './server-config.js';
export type { NextjsPreviewConfig, NextjsPreviewContext } from './preview.js';

export type NextjsAppRouterRequestContext = NextjsServerRequestContext;
export type NextjsAppRouterServerExperiencesConfig = NextjsServerExperiencesConfig;

export interface NextjsAppRouterServerExperiencesOptions {
  readonly request?: {
    readonly Experience?: ComponentType<NextjsRequestExperienceProps>;
    readonly ExperiencesRoot?: ComponentType<BoundNextjsRequestRootProps>;
    readonly ExperiencesAnalyticsRoot?: ComponentType<BoundNextjsRequestRootProps>;
  };
}

export type BoundNextjsServerRequestRootProps = Omit<
  BoundNextjsRequestRootProps,
  'sdk' | 'onStatesReady' | 'beforeInitialPage' | 'buildPagePayload' | 'result'
>;

export type NextjsAppRouterExperienceResult = NextjsServerRequestResult;

/** Server renderer callbacks stay on the server; DOM handlers belong in client components. */
export type NextjsServerRequestExperienceProps = Omit<
  ServerExperienceRendererProps,
  'experience' | 'config' | 'as' | 'rootProps'
> & {
  readonly as?: Extract<ServerExperienceRendererProps['as'], string>;
  readonly rootProps?: Omit<
    NonNullable<ServerExperienceRendererProps['rootProps']>,
    Extract<keyof NonNullable<ServerExperienceRendererProps['rootProps']>, `on${string}`>
  >;
};

/** Client renderer callbacks must be configured in the injected client module. */
export type NextjsServerRequestClientExperienceProps = Omit<
  NextjsServerRequestExperienceProps,
  'renderError' | 'renderUnknown'
>;

export type NextjsServerExperienceProps = Omit<
  ServerExperienceRendererProps,
  'experience' | 'config'
> &
  (
    | { readonly experience: PortableRenderPlan }
    | (FetchExperienceOptions & {
        readonly experience?: never;
        readonly cache?: Exclude<ExperiencesHandoff['cache'], { scope: 'private-request' }>;
        readonly resolveOptions?: Omit<FetchResolveOptions, 'config'>;
      })
  );

export function bindNextjsAppRouterServerExperiences(
  options: NextjsAppRouterServerExperiencesConfig,
  client?: NextjsAppRouterServerExperiencesOptions & {
    readonly request?: NonNullable<NextjsAppRouterServerExperiencesOptions['request']> & {
      readonly Experience?: never;
    };
  }
): ReturnType<typeof createAppRouterServerExperiences<NextjsServerRequestExperienceProps>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a runtime redeclaration.
export function bindNextjsAppRouterServerExperiences(
  options: NextjsAppRouterServerExperiencesConfig,
  client: NextjsAppRouterServerExperiencesOptions
): ReturnType<typeof createAppRouterServerExperiences<NextjsServerRequestClientExperienceProps>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation.
export function bindNextjsAppRouterServerExperiences(
  options: NextjsAppRouterServerExperiencesConfig,
  client?: NextjsAppRouterServerExperiencesOptions
) {
  return createAppRouterServerExperiences(options, client);
}

function createAppRouterServerExperiences<
  PresentationProps extends NextjsServerRequestExperienceProps,
>(
  options: NextjsAppRouterServerExperiencesConfig,
  client?: NextjsAppRouterServerExperiencesOptions
) {
  const {
    config,
    consent,
    cookie,
    browser: _browser,
    request: _policy,
    preview,
    ...nodeConfig
  } = options;
  const sdk = configureNextjsServerExperiences({
    ...nodeConfig,
    preview: resolveNextjsPreview(preview, '/'),
  });

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
      const session = resolveNextjsPreviewSession(preview, context.requestUrl);
      if (isNextjsSpeculativeRequest(context.headers)) return resolved.result;
      const request = bindNextjsExperiencesRequest(sdk, {
        request: context.request,
        cookies: context.cookies,
        consent:
          overrides.consent ??
          (consent?.server === undefined
            ? false
            : await resolveNextjsServerValue(consent.server, context)),
        locale: overrides.locale ?? nodeConfig.locale,
        preview: session,
        isPreview: overrides.isPreview === true || session !== undefined,
      });
      try {
        return await loadNextjsPrimaryExperience(request, resolved, context, options);
      } finally {
        request.destroy();
      }
    }
  );

  const browserResult = cache((result: NextjsAppRouterExperienceResult) =>
    serializeNextjsRequestResult(result, { metadataKeys: options.request?.metadataKeys })
  );

  function inheritedRootProps() {
    return {
      spaceId: options.spaceId,
      environmentId: options.environmentId,
      ...(options.locale !== undefined ? { locale: options.locale } : {}),
      ...(consent?.clientDefaults ? { defaults: consent.clientDefaults } : {}),
      ...(cookie ? { cookie } : {}),
    };
  }

  function registeredRootProps(props: BoundNextjsRequestRootProps) {
    const browser = options.browser ? nextjsBrowserRootConfig(options) : undefined;
    const preview = mergeNextjsPreview(
      mergeNextjsPreview(browser?.preview, props.preview),
      props.result?.preview
    );
    return {
      ...browser,
      ...(browser ? inheritedRootProps() : {}),
      ...props,
      ...(preview ? { preview } : {}),
    };
  }

  function ExperiencesRoot(props: BoundNextjsRequestRootProps) {
    if (client?.request?.ExperiencesRoot)
      return createElement(client.request.ExperiencesRoot, {
        ...registeredRootProps(props),
      });
    return createElement(NextjsAppRouterRequestRoot, {
      ...props,
      children: client?.request?.Experience ? (
        props.children
      ) : (
        <>
          <ServerPreviewRefresh />
          {props.children}
        </>
      ),
      ...inheritedRootProps(),
      browser: nextjsBrowserRootConfig(options),
    });
  }

  async function RequestExperiencesRoot(props: BoundNextjsServerRequestRootProps) {
    return ExperiencesRoot({ ...props, result: browserResult(await loadExperience()) });
  }

  function ExperiencesAnalyticsRoot(props: BoundNextjsRequestRootProps) {
    if (client?.request?.ExperiencesAnalyticsRoot)
      return createElement(client.request.ExperiencesAnalyticsRoot, {
        ...registeredRootProps(props),
      });
    return createElement(NextjsAppRouterRequestAnalyticsRoot, {
      ...props,
      ...inheritedRootProps(),
      browser: nextjsBrowserRootConfig(options),
    });
  }

  async function RequestExperiencesAnalyticsRoot(props: BoundNextjsServerRequestRootProps) {
    const { plan: _plan, ...result } = browserResult(await loadExperience());
    return ExperiencesAnalyticsRoot({ ...props, result });
  }

  async function RequestExperience(props: PresentationProps) {
    const result = await loadExperience();
    if (result.plan === undefined && result.contentError === undefined) return null;
    if (client?.request?.Experience)
      return createElement(client.request.Experience, { ...props, result: browserResult(result) });
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
    const descriptor = {
      experienceId,
      locale,
      parameters,
      personalization,
      extensions,
      preview,
    };
    if (cachePolicy)
      assertNextjsPublicRequestPolicy({
        cache: cachePolicy,
        fetchOptions: descriptor,
        context: { isPreview: sdk.config.preview?.sessionId !== undefined },
      });
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
      preview: preview
        ? (context) => resolveNextjsPreviewSession(preview, context.request.url)
        : undefined,
    }),
  };
}
