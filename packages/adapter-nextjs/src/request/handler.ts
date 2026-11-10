import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server.js';
import type {
  ContentfulExperiences,
  ConsentInput,
  MaybePromise,
  LivePreviewOptions,
} from '@contentful/experiences-node';
import { applyPrivateResponseCache } from '../cache/policy.js';
import { persistAnonymousId, type PersistAnonymousIdOptions } from './cookies.js';
import {
  cookieReaderFromHeader,
  normalizedRequestUrl,
  isSpeculativeRequest,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
  type CookieReader,
  type RequestLike,
} from './context.js';
import { bindExperiencesRequest, type BindExperiencesRequestOptions } from './server-request.js';

import {
  isMiddlewareContinuation,
  createForwardedRequestHeaders,
  applyForwardedRequestHeaders,
} from './forwarded-headers.js';

export interface ExperiencesResolverContext {
  readonly request: NextRequest;
  readonly headers: globalThis.Headers;
  readonly cookies: CookieReader;
}

export type LivePreviewResolver = (context: {
  readonly request: RequestLike;
}) => MaybePromise<LivePreviewOptions | undefined>;

export interface ExperiencesContextHandlerOptions
  extends
    Omit<
      BindExperiencesRequestOptions,
      'request' | 'headers' | 'cookies' | 'consent' | 'livePreview'
    >,
    PersistAnonymousIdOptions {
  readonly sdk: ContentfulExperiences;
  readonly consent:
    ConsentInput | ((context: ExperiencesResolverContext) => MaybePromise<ConsentInput>);
  readonly livePreview?: LivePreviewResolver;
}

export type ExperiencesRequestHandler = (
  request: NextRequest,
  responseOrEvent?: NextResponse | NextFetchEvent
) => Promise<NextResponse>;

/** Context-only Node middleware. Existing terminal responses never initialize visitor work. */
export function createExperiencesContextHandler(
  options?: ExperiencesContextHandlerOptions
): ExperiencesRequestHandler {
  return async (request, responseOrEvent) => {
    const existing =
      responseOrEvent instanceof globalThis.Response
        ? (responseOrEvent as NextResponse)
        : undefined;
    if (existing && !isMiddlewareContinuation(existing)) return existing;
    const headers = createForwardedRequestHeaders(request.headers, existing);
    headers.set(
      NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
      normalizedRequestUrl(request.url).toString()
    );
    let experiencesRequest: ReturnType<typeof bindExperiencesRequest> | undefined;
    if (
      options &&
      !isSpeculativeRequest(headers) &&
      headers.get('rsc') !== '1' &&
      headers.get('x-nextjs-data') !== '1'
    ) {
      const cookies = cookieReaderFromHeader(headers.get('cookie'));
      const context = { request, headers, cookies };
      const {
        sdk,
        cookieOptions: _cookieOptions,
        deleteWhenProfileCannotPersist: _delete,
        ...requestOptions
      } = options;
      experiencesRequest = bindExperiencesRequest(sdk, {
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
      const response = existing ?? NextResponse.next();
      applyForwardedRequestHeaders(response, headers);
      if (experiencesRequest && options) {
        applyPrivateResponseCache(response);
        persistAnonymousId(response, experiencesRequest, {
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
