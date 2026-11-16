// Request/response adaptation follows Optimization's pages-router-server.ts at
// f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT). XDA owns content evaluation.
import type { GetServerSidePropsContext } from 'next';
import type { RequestResult } from './request-result.js';
import {
  createAnonymousIdSetCookieHeader,
  toAnonymousIdCookieOptions,
  type CookieConfig,
} from './cookies.js';
import {
  cookieReaderFromHeader,
  createRouteKey,
  isSpeculativeRequest,
  normalizedRequestUrl,
} from './request-context.js';
import { bindExperiencesRequest, configureServerExperiences } from './server-request.js';
import {
  resolveServerValue,
  serializeRequestResult,
  type ServerConfig,
  type ServerRequestContext,
  type ServerRequestOverrides,
} from './server-config.js';
import { loadPrimaryExperience, resolveRequestPolicy } from './request-policy.js';
import { resolvePreview, resolvePreviewSession } from './preview.js';

export type { RequestResult } from './request-result.js';
export { serializeRequestResult } from './server-config.js';
export type { CookieConfig } from './cookies.js';
export type { ServerRequestOverrides, ServerRequestPolicy } from './server-config.js';
export type { PreviewConfig, PreviewContext } from './preview.js';

export interface PagesRouterServerConfig extends ServerConfig {
  /** Trusted HTTP(S) origin. Required here or on every loadExperience call. */
  readonly origin?: string;
}

export type PagesRouterRequestOptions = ServerRequestOverrides & {
  /** Overrides the bound trusted origin; never inferred from request headers. */
  readonly origin?: string;
  /** Visible path/query for application-owned masked URLs; defaults to the native request URL. */
  readonly routeKey?: string;
  readonly cookie?: CookieConfig;
};

function pagesRequest(context: GetServerSidePropsContext, origin?: string, routeKey?: string) {
  let url: URL;
  try {
    url = new URL(origin ?? '');
    if (!['http:', 'https:'].includes(url.protocol) || url.href !== `${url.origin}/`)
      throw new TypeError();
  } catch {
    throw new TypeError(
      'A Pages request requires an explicit HTTP(S) origin without credentials, path, query or hash.'
    );
  }
  if (routeKey !== undefined && (!routeKey.startsWith('/') || routeKey.startsWith('//')))
    throw new TypeError('A Pages routeKey must be an absolute path and query.');
  const headers = new globalThis.Headers();
  for (const [name, value] of Object.entries(context.req.headers)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value])
      headers.append(name, item);
  }
  // resolvedUrl names the rewrite destination. Request identity must match asPath.
  const path = routeKey ?? context.req.url ?? context.resolvedUrl ?? '/';
  const visible = new URL(path.startsWith('/') ? `${url.origin}${path}` : path, url);
  if (routeKey === undefined) {
    const dataPath = visible.pathname.match(/^\/_next\/data\/[^/]+(\/.*)\.json$/);
    const pagePath = dataPath?.[1];
    if (pagePath !== undefined) {
      // Invert Next's /index asset-path escaping before removing a data URL's locale.
      const pathname =
        pagePath === '/index' ? '/' : pagePath.startsWith('/index/') ? pagePath.slice(6) : pagePath;
      const locale = pathname.split('/')[1];
      visible.pathname =
        locale && context.locales?.includes(locale)
          ? pathname.slice(locale.length + 1) || '/'
          : pathname;
    }
  }
  url.pathname = visible.pathname;
  url.search = visible.search;
  const cookieHeader = context.req.headers.cookie;
  const headerCookies = cookieReaderFromHeader(
    Array.isArray(cookieHeader) ? cookieHeader.join('; ') : (cookieHeader ?? null)
  );
  return {
    headers,
    url: normalizedRequestUrl(url).toString(),
    cookies: {
      get: (name: string) => {
        const value = context.req.cookies[name];
        return value === undefined ? headerCookies.get(name) : { value };
      },
    },
  };
}

type PagesRequestArguments<Config> = Config extends { readonly origin: string }
  ? [overrides?: PagesRouterRequestOptions]
  : [overrides: PagesRouterRequestOptions & { readonly origin: string }];

export function bindPagesRouterServerExperiences<Config extends PagesRouterServerConfig>(
  options: Config
) {
  const {
    config: _config,
    consent,
    cookie,
    browser: _browser,
    request: _policy,
    preview,
    origin,
    ...nodeConfig
  } = options;
  const sdk = configureServerExperiences({
    ...nodeConfig,
    preview: resolvePreview(preview, '/'),
  });

  async function loadExperience(
    nativeContext: GetServerSidePropsContext,
    overrides: PagesRouterRequestOptions = {}
  ): Promise<RequestResult> {
    const incoming = pagesRequest(nativeContext, overrides.origin ?? origin, overrides.routeKey);
    const context: ServerRequestContext = {
      request: incoming,
      headers: incoming.headers,
      cookies: incoming.cookies,
      requestUrl: incoming.url,
      routeKey: createRouteKey(incoming.url),
    };
    const resolved = await resolveRequestPolicy(options, overrides, context);
    nativeContext.res.setHeader('Cache-Control', 'private, no-store');
    const session = resolvePreviewSession(preview, context.requestUrl);
    if (isSpeculativeRequest(incoming.headers))
      return serializeRequestResult(resolved.result, resolved.policy);
    const request = bindExperiencesRequest(sdk, {
      request: incoming,
      cookies: incoming.cookies,
      consent:
        overrides.consent ??
        (consent?.server === undefined ? false : await resolveServerValue(consent.server, context)),
      locale: overrides.locale ?? options.locale ?? nativeContext.locale,
      preview: session,
      isPreview: overrides.isPreview === true || session !== undefined,
    });
    try {
      const result = await loadPrimaryExperience(request, resolved, context, options);
      // GSSP is a native JSON boundary. Raw content is available to composeRequest only.
      const serialized = serializeRequestResult(result, resolved.policy);
      const identityCookie = createAnonymousIdSetCookieHeader(request, {
        cookieOptions: toAnonymousIdCookieOptions(overrides.cookie ?? cookie),
      });
      if (identityCookie !== undefined) {
        const previous = nativeContext.res.getHeader('Set-Cookie');
        nativeContext.res.setHeader('Set-Cookie', [
          ...(previous === undefined ? [] : Array.isArray(previous) ? previous : [previous]).map(
            String
          ),
          identityCookie,
        ]);
      }
      return serialized;
    } finally {
      request.destroy();
    }
  }

  const loadWithOrigin: (
    context: GetServerSidePropsContext,
    ...args: PagesRequestArguments<Config>
  ) => Promise<RequestResult> = loadExperience;
  return { request: { loadExperience: loadWithOrigin } };
}
