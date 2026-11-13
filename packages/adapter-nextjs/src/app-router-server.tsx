// Request-bound and explicit families follow Optimization PR #549 (MIT), adapted
// to XDA descriptor evaluation rather than selected-optimization resolution.
import {
  ServerExperienceRenderer,
  type ServerExperienceRendererProps,
} from '@contentful/experiences-react/server';
import {
  isDestinationRedirect,
  type ExperienceRequest,
  type ExperiencesHandoff,
  type FetchDestinationOptions,
  type FetchResolveOptions,
  type PortableRenderPlan,
} from '@contentful/experiences-node';
import { cookies, headers } from 'next/headers.js';
import { notFound, redirect } from 'next/navigation.js';
import { getRequestOutcome, type RedirectLocation } from './request-outcome.js';
import type { RequestResult } from './request-result.js';
import { cache, createElement, type ComponentType } from 'react';
import { ServerPreviewRefresh } from './server-preview-refresh.js';
import type { BoundRequestRootProps, RequestExperienceProps } from './request-result.js';
import { bindExperiencesRequest, configureServerExperiences } from './server-request.js';
import {
  createRouteKey,
  normalizedRequestUrl,
  isSpeculativeRequest,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
} from './request-context.js';
import { assertPublicRequestPolicy } from './cache.js';
import {
  createExperiencesContextHandler,
  type ExperiencesResolverContext,
} from './request-handler.js';
import { toAnonymousIdCookieOptions } from './cookies.js';
import {
  resolveServerValue,
  browserRootConfig,
  serializeRequestResult,
  type ServerConfig,
  type ServerRequestContext,
  type ServerRequestOverrides,
  type ServerRequestResult,
} from './server-config.js';
import { loadPrimaryExperience, resolveRequestPolicy } from './request-policy.js';
import { mergePreview } from './preview.js';
import { AppRouterRequestRoot, AppRouterRequestAnalyticsRoot } from './app-router-client.js';

export { serializeRequestResult } from './server-config.js';
export type { CookieConfig } from './cookies.js';
export type { ServerRequestOverrides, ServerRequestPolicy } from './server-config.js';
export type { PreviewConfig, PreviewContext } from './server-config.js';
export { getRequestOutcome } from './request-outcome.js';
export type { RedirectLocation, RequestOutcome } from './request-outcome.js';

/**
 * Route a primary Destination redirect with App Router `redirect()` and a missing
 * Experience, Destination, path or node with `notFound()`. Call it in the page or
 * layout before presenting the result; otherwise it returns the result unchanged.
 */
export function applyAppRouterOutcome<Result extends RequestResult>(
  result: Result,
  options: { readonly redirectLocation?: RedirectLocation } = {}
): Result {
  const outcome = getRequestOutcome(result, options.redirectLocation);
  if (outcome?.kind === 'redirect') redirect(outcome.location);
  if (outcome?.kind === 'not-found') notFound();
  return result;
}

export type AppRouterRequestContext = ServerRequestContext;
export type AppRouterServerConfig = ServerConfig;

export interface AppRouterServerOptions {
  readonly request?: {
    readonly Experience?: ComponentType<RequestExperienceProps>;
    readonly ExperiencesRoot?: ComponentType<BoundRequestRootProps>;
    readonly ExperiencesAnalyticsRoot?: ComponentType<BoundRequestRootProps>;
  };
}

export type BoundServerRequestRootProps = Omit<
  BoundRequestRootProps,
  'sdk' | 'onStatesReady' | 'beforeInitialPage' | 'buildPagePayload' | 'result'
>;

export type AppRouterExperienceResult = ServerRequestResult;

/** Server renderer callbacks stay on the server; DOM handlers belong in client components. */
export type ServerRequestExperienceProps = Omit<
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
export type ServerRequestClientExperienceProps = Omit<
  ServerRequestExperienceProps,
  'renderError' | 'renderUnknown'
>;

export type ServerExperienceProps = Omit<ServerExperienceRendererProps, 'experience' | 'config'> &
  (
    | { readonly experience: PortableRenderPlan }
    | (ExperienceRequest & {
        readonly experience?: never;
        readonly cache?: Exclude<ExperiencesHandoff['cache'], { scope: 'private-request' }>;
        readonly resolveOptions?: Omit<FetchResolveOptions, 'config'>;
      })
  );

export function bindAppRouterServerExperiences(
  options: AppRouterServerConfig,
  client?: AppRouterServerOptions & {
    readonly request?: NonNullable<AppRouterServerOptions['request']> & {
      readonly Experience?: never;
    };
  }
): ReturnType<typeof createAppRouterServerExperiences<ServerRequestExperienceProps>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a runtime redeclaration.
export function bindAppRouterServerExperiences(
  options: AppRouterServerConfig,
  client: AppRouterServerOptions
): ReturnType<typeof createAppRouterServerExperiences<ServerRequestClientExperienceProps>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation.
export function bindAppRouterServerExperiences(
  options: AppRouterServerConfig,
  client?: AppRouterServerOptions
) {
  return createAppRouterServerExperiences(options, client);
}

function createAppRouterServerExperiences<PresentationProps extends ServerRequestExperienceProps>(
  options: AppRouterServerConfig,
  client?: AppRouterServerOptions
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
  const sdk = configureServerExperiences({
    ...nodeConfig,
    preview,
  });

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
      if (isSpeculativeRequest(context.headers)) return resolved.result;
      const request = bindExperiencesRequest(sdk, {
        request: context.request,
        cookies: context.cookies,
        consent:
          overrides.consent ??
          (consent?.server === undefined
            ? false
            : await resolveServerValue(consent.server, context)),
        locale: overrides.locale ?? nodeConfig.locale,
        preflight: resolved.mode === 'hybrid',
      });
      try {
        return await loadPrimaryExperience(request, resolved, context, options);
      } finally {
        request.destroy();
      }
    }
  );

  const browserResult = cache((result: AppRouterExperienceResult) =>
    serializeRequestResult(result, { metadataKeys: options.request?.metadataKeys })
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

  function registeredRootProps(props: BoundRequestRootProps) {
    const browser = options.browser ? browserRootConfig(options) : undefined;
    const preview = mergePreview(
      mergePreview(browser?.preview, props.preview),
      props.result?.preview
    );
    return {
      ...browser,
      ...(browser ? inheritedRootProps() : {}),
      ...props,
      ...(preview ? { preview } : {}),
    };
  }

  function ExperiencesRoot(props: BoundRequestRootProps) {
    if (client?.request?.ExperiencesRoot)
      return createElement(client.request.ExperiencesRoot, {
        ...registeredRootProps(props),
      });
    return createElement(AppRouterRequestRoot, {
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
      browser: browserRootConfig(options),
    });
  }

  async function RequestExperiencesRoot(props: BoundServerRequestRootProps) {
    return ExperiencesRoot({ ...props, result: browserResult(await loadExperience()) });
  }

  function ExperiencesAnalyticsRoot(props: BoundRequestRootProps) {
    if (client?.request?.ExperiencesAnalyticsRoot)
      return createElement(client.request.ExperiencesAnalyticsRoot, {
        ...registeredRootProps(props),
      });
    return createElement(AppRouterRequestAnalyticsRoot, {
      ...props,
      ...inheritedRootProps(),
      browser: browserRootConfig(options),
    });
  }

  async function RequestExperiencesAnalyticsRoot(props: BoundServerRequestRootProps) {
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

  async function Experience(props: ServerExperienceProps) {
    if (props.experience !== undefined) {
      return <ServerExperienceRenderer {...props} config={config} experience={props.experience} />;
    }
    const {
      experienceId,
      destinationId,
      path,
      nodeId,
      locale,
      parameters,
      personalization,
      extensions,
      resolveOptions,
      cache: cachePolicy,
      ...presentation
    } = props as ExperienceRequest & {
      experienceId?: string;
      destinationId?: string;
      path?: string;
      nodeId?: string;
      locale?: string;
      parameters?: never;
      extensions?: never;
      resolveOptions?: Omit<FetchResolveOptions, 'config'>;
      cache?: Exclude<ExperiencesHandoff['cache'], { scope: 'private-request' }>;
    } & Omit<ServerExperienceRendererProps, 'experience' | 'config'>;
    const descriptor = (
      experienceId !== undefined
        ? { experienceId, locale, parameters, personalization, extensions }
        : nodeId !== undefined
          ? { destinationId, nodeId, personalization }
          : { destinationId, path, personalization }
    ) as ExperienceRequest;
    if (cachePolicy)
      assertPublicRequestPolicy({
        cache: cachePolicy,
        fetchOptions: descriptor,
      });
    const request = sdk.forRequest({ consent: false });
    try {
      const resolve = { ...resolveOptions, config };
      const result: PortableRenderPlan | { redirect: { path: string } } =
        'experienceId' in descriptor && descriptor.experienceId !== undefined
          ? await request.fetchExperience(descriptor, resolve)
          : 'nodeId' in descriptor
            ? await request.fetchByDestinationNode(
                descriptor as FetchDestinationOptions & { nodeId: string },
                resolve
              )
            : await request.fetchByDestinationPath(
                descriptor as FetchDestinationOptions & { path: string },
                resolve
              );
      // A redirect is never content; route it with request.loadExperience and applyAppRouterOutcome.
      if (isDestinationRedirect(result)) return null;
      return <ServerExperienceRenderer {...presentation} experience={result} config={config} />;
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
    }),
  };
}
