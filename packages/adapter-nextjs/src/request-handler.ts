import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server.js';
import type {
  ContentfulExperiences,
  ConsentInput,
  MaybePromise,
  RuntimeLivePreviewOptions,
} from '@contentful/experiences-node';
import { applyNextjsPrivateResponseCache } from './cache.js';
import { persistNextjsAnonymousId, type PersistNextjsAnonymousIdOptions } from './cookies.js';
import {
  cookieReaderFromHeader,
  normalizedRequestUrl,
  NEXTJS_EXPERIENCES_REQUEST_HEADER_PREFIX,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
  type NextjsCookieReader,
  type NextjsRequestLike,
} from './request-context.js';
import {
  bindNextjsExperiencesRequest,
  type BindNextjsExperiencesRequestOptions,
} from './server-request.js';

const OVERRIDE = 'x-middleware-override-headers';
const REQUEST_PREFIX = 'x-middleware-request-';
function headerNames(headers: globalThis.Headers): string[] {
  const names: string[] = [];
  headers.forEach((_value, name) => names.push(name));
  return names;
}

export interface NextjsExperiencesResolverContext {
  readonly request: NextRequest;
  readonly headers: globalThis.Headers;
  readonly cookies: NextjsCookieReader;
}

export type NextjsLivePreviewResolver = (context: {
  readonly request: NextjsRequestLike;
}) => MaybePromise<RuntimeLivePreviewOptions | undefined>;

export interface NextjsExperiencesContextHandlerOptions
  extends
    Omit<
      BindNextjsExperiencesRequestOptions,
      'request' | 'headers' | 'cookies' | 'consent' | 'livePreview'
    >,
    PersistNextjsAnonymousIdOptions {
  readonly sdk: ContentfulExperiences;
  readonly consent:
    ConsentInput | ((context: NextjsExperiencesResolverContext) => MaybePromise<ConsentInput>);
  readonly livePreview?: NextjsLivePreviewResolver;
}

export type NextjsExperiencesRequestHandler = (
  request: NextRequest,
  responseOrEvent?: NextResponse | NextFetchEvent
) => Promise<NextResponse>;

/** Context-only Node middleware. Existing terminal responses never initialize visitor work. */
export function createNextjsExperiencesContextHandler(
  options?: NextjsExperiencesContextHandlerOptions
): NextjsExperiencesRequestHandler {
  return async (request, responseOrEvent) => {
    const existing =
      responseOrEvent instanceof globalThis.Response
        ? (responseOrEvent as NextResponse)
        : undefined;
    if (
      existing &&
      ((existing.status >= 300 && existing.status < 400 && existing.headers.has('location')) ||
        (!existing.headers.has('x-middleware-next') &&
          !existing.headers.has('x-middleware-rewrite') &&
          !existing.headers.has(OVERRIDE)))
    )
      return existing;
    const overridden = existing?.headers.get(OVERRIDE);
    const headers = new globalThis.Headers(overridden == null ? request.headers : undefined);
    for (const name of overridden?.split(',') ?? []) {
      const key = name.trim();
      if (!key) continue;
      const value = existing!.headers.get(`${REQUEST_PREFIX}${key}`);
      if (value !== null) headers.set(key, value);
    }
    for (const name of headerNames(headers)) {
      if (name.startsWith(NEXTJS_EXPERIENCES_REQUEST_HEADER_PREFIX)) headers.delete(name);
    }
    headers.set(
      NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
      normalizedRequestUrl(request.url).toString()
    );
    let experiencesRequest: ReturnType<typeof bindNextjsExperiencesRequest> | undefined;
    if (options) {
      const cookies = cookieReaderFromHeader(headers.get('cookie'));
      const context = { request, headers, cookies };
      const {
        sdk,
        cookieOptions: _cookieOptions,
        deleteWhenProfileCannotPersist: _delete,
        ...requestOptions
      } = options;
      experiencesRequest = bindNextjsExperiencesRequest(sdk, {
        ...requestOptions,
        request,
        headers,
        cookies,
        consent:
          typeof options.consent === 'function' ? await options.consent(context) : options.consent,
        livePreview: await options.livePreview?.(context),
      });
    }
    try {
      const forwarded = NextResponse.next({ request: { headers } });
      const response = existing ?? forwarded;
      if (existing) {
        for (const name of headerNames(response.headers)) {
          if (name === OVERRIDE || name.startsWith(REQUEST_PREFIX)) response.headers.delete(name);
        }
        forwarded.headers.forEach((value, name) => {
          if (name === OVERRIDE || name.startsWith(REQUEST_PREFIX))
            response.headers.set(name, value);
        });
      }
      if (experiencesRequest && options) {
        applyNextjsPrivateResponseCache(response);
        persistNextjsAnonymousId(response, experiencesRequest, {
          anonymousIdCookieName: options.anonymousIdCookieName,
          cookieOptions: { ...options.cookieOptions, httpOnly: false },
          deleteWhenProfileCannotPersist: options.deleteWhenProfileCannotPersist,
        });
      }
      return response;
    } finally {
      experiencesRequest?.destroy();
    }
  };
}
