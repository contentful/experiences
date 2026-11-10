// Request/response adaptation follows Optimization's pages-router-server.ts at
// f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT). XDA owns content evaluation.
import type { GetServerSidePropsContext } from 'next';
import type { RequestResult } from '../presentation/request-result.js';
import {
  createAnonymousIdSetCookieHeader,
  toAnonymousIdCookieOptions,
  type CookieConfig,
} from '../request/cookies.js';
import {
  cookieReaderFromHeader,
  createRouteKey,
  isSpeculativeRequest,
  normalizedRequestUrl,
} from '../request/context.js';
import { bindExperiencesRequest, configureServerExperiences } from '../request/server-request.js';
import {
  resolveServerValue,
  serializeRequestResult,
  type ServerConfig,
  type ServerRequestContext,
  type ServerRequestOverrides,
} from '../request/server-config.js';
import { loadPrimaryExperience, resolveRequestPolicy } from '../request/policy.js';
import { resolveLivePreview } from '../presentation/live-preview.js';

export type { RequestResult, HydrationMode } from '../presentation/request-result.js';
export { serializeRequestResult } from '../request/server-config.js';
export type { CookieConfig } from '../request/cookies.js';
export type { ServerRequestOverrides, ServerRequestPolicy } from '../request/server-config.js';
export type { LivePreviewConfig, LivePreviewOptions } from '../presentation/live-preview.js';

export interface PagesRouterServerConfig extends ServerConfig {
  /** Explicit origin, otherwise derived from the native request headers. */
  readonly origin?: string;
}

export type PagesRouterRequestOptions = ServerRequestOverrides & {
  readonly origin?: string;
  readonly cookie?: CookieConfig;
};

function pagesRequest(context: GetServerSidePropsContext, origin?: string) {
  const headers = new globalThis.Headers();
  for (const [name, value] of Object.entries(context.req.headers)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value])
      headers.append(name, item);
  }
  const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? headers.get('host');
  const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'http';
  if (!origin && !host) throw new TypeError('A Pages request requires an origin or Host header.');
  const url = new URL(origin ?? `${proto}://${host}`);
  const visible = new URL(context.resolvedUrl || context.req.url || '/', url);
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

export function bindPagesRouterServerExperiences(options: PagesRouterServerConfig) {
  const {
    config: _config,
    consent,
    cookie,
    browser: _browser,
    request: _policy,
    livePreview,
    origin,
    ...nodeConfig
  } = options;
  const sdk = configureServerExperiences(nodeConfig);

  async function loadExperience(
    nativeContext: GetServerSidePropsContext,
    overrides: PagesRouterRequestOptions = {}
  ): Promise<RequestResult> {
    const incoming = pagesRequest(nativeContext, overrides.origin ?? origin);
    const context: ServerRequestContext = {
      request: incoming,
      headers: incoming.headers,
      cookies: incoming.cookies,
      requestUrl: incoming.url,
      routeKey: createRouteKey(incoming.url),
    };
    const resolved = await resolveRequestPolicy(options, overrides, context);
    nativeContext.res.setHeader('Cache-Control', 'private, no-store');
    const dataRequest = incoming.headers.get('x-nextjs-data') === '1';
    const preview =
      typeof livePreview === 'function'
        ? await livePreview(context)
        : livePreview
          ? resolveLivePreview(livePreview, context.requestUrl, resolved.descriptor.experienceId)
          : undefined;
    if (
      isSpeculativeRequest(incoming.headers) ||
      (resolved.result.hydration === 'preserve-server' && dataRequest && !preview)
    )
      return serializeRequestResult(resolved.result, resolved.policy);
    const request = bindExperiencesRequest(sdk, {
      request: incoming,
      cookies: incoming.cookies,
      consent:
        overrides.consent ??
        (consent?.server === undefined ? false : await resolveServerValue(consent.server, context)),
      locale: overrides.locale ?? options.locale ?? nativeContext.locale,
      livePreview: preview,
      isPreview: overrides.isPreview === true || preview !== undefined,
    });
    try {
      const result = await loadPrimaryExperience(request, resolved, context, options, !dataRequest);
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

  return { request: { loadExperience } };
}
