// Request/response adaptation follows Optimization's pages-router-server.ts at
// f76f1ff04df1b466c98fc6ce5db6b569f9212438 (MIT). XDA owns content evaluation.
import type { GetServerSidePropsContext } from 'next';
import type { NextjsRequestResult } from './request-result.js';
import {
  createNextjsAnonymousIdSetCookieHeader,
  toNextjsAnonymousIdCookieOptions,
  type NextjsCookieConfig,
} from './cookies.js';
import {
  cookieReaderFromHeader,
  createNextjsRouteKey,
  isNextjsSpeculativeRequest,
  normalizedRequestUrl,
} from './request-context.js';
import {
  bindNextjsExperiencesRequest,
  configureNextjsServerExperiences,
} from './server-request.js';
import {
  resolveNextjsServerValue,
  serializeNextjsRequestResult,
  type NextjsServerExperiencesConfig,
  type NextjsServerRequestContext,
  type NextjsServerRequestOverrides,
} from './server-config.js';
import { loadNextjsPrimaryExperience, resolveNextjsRequestPolicy } from './request-policy.js';

export type { NextjsRequestResult } from './request-result.js';
export { serializeNextjsRequestResult } from './server-config.js';
export type { NextjsCookieConfig } from './cookies.js';
export type { NextjsServerRequestOverrides, NextjsServerRequestPolicy } from './server-config.js';

export interface NextjsPagesRouterServerExperiencesConfig extends NextjsServerExperiencesConfig {
  /** Explicit origin, otherwise derived from the native request headers. */
  readonly origin?: string;
}

export type NextjsPagesRouterRequestOptions = NextjsServerRequestOverrides & {
  readonly origin?: string;
  readonly cookie?: NextjsCookieConfig;
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

export function bindNextjsPagesRouterServerExperiences(
  options: NextjsPagesRouterServerExperiencesConfig
) {
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
  const sdk = configureNextjsServerExperiences(nodeConfig);

  async function loadExperience(
    nativeContext: GetServerSidePropsContext,
    overrides: NextjsPagesRouterRequestOptions = {}
  ): Promise<NextjsRequestResult> {
    const incoming = pagesRequest(nativeContext, overrides.origin ?? origin);
    const context: NextjsServerRequestContext = {
      request: incoming,
      headers: incoming.headers,
      cookies: incoming.cookies,
      requestUrl: incoming.url,
      routeKey: createNextjsRouteKey(incoming.url),
    };
    const resolved = await resolveNextjsRequestPolicy(options, overrides, context);
    nativeContext.res.setHeader('Cache-Control', 'private, no-store');
    const preview = await livePreview?.(context);
    if (isNextjsSpeculativeRequest(incoming.headers))
      return serializeNextjsRequestResult(resolved.result, resolved.policy);
    const request = bindNextjsExperiencesRequest(sdk, {
      request: incoming,
      cookies: incoming.cookies,
      consent:
        overrides.consent ??
        (consent?.server === undefined
          ? false
          : await resolveNextjsServerValue(consent.server, context)),
      locale: overrides.locale ?? options.locale ?? nativeContext.locale,
      livePreview: preview,
      isPreview: overrides.isPreview === true || preview !== undefined,
    });
    try {
      const result = await loadNextjsPrimaryExperience(request, resolved, context, options);
      // GSSP is a native JSON boundary. Raw content is available to composeRequest only.
      const serialized = serializeNextjsRequestResult(result, resolved.policy);
      const identityCookie = createNextjsAnonymousIdSetCookieHeader(request, {
        cookieOptions: toNextjsAnonymousIdCookieOptions(overrides.cookie ?? cookie),
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
