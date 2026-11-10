import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server.js';
import type {
  ContentfulExperiences,
  ConsentInput,
  MaybePromise,
  RuntimeLivePreviewOptions,
} from '@contentful/experiences-node';
import { applyNextjsPrivateResponseCache } from '../cache/policy.js';
import { persistNextjsAnonymousId, type PersistNextjsAnonymousIdOptions } from './cookies.js';
import {
  cookieReaderFromHeader,
  normalizedRequestUrl,
  isNextjsSpeculativeRequest,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
  type NextjsCookieReader,
  type NextjsRequestLike,
} from './request-context.js';
import {
  bindNextjsExperiencesRequest,
  type BindNextjsExperiencesRequestOptions,
} from './server-request.js';

import {
  isMiddlewareContinuation,
  createForwardedRequestHeaders,
  applyForwardedRequestHeaders,
} from './forwarded-request-headers.js';

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
    if (existing && !isMiddlewareContinuation(existing)) return existing;
    const headers = createForwardedRequestHeaders(request.headers, existing);
    headers.set(
      NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
      normalizedRequestUrl(request.url).toString()
    );
    let experiencesRequest: ReturnType<typeof bindNextjsExperiencesRequest> | undefined;
    if (
      options &&
      !isNextjsSpeculativeRequest(headers) &&
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
      const response = existing ?? NextResponse.next();
      applyForwardedRequestHeaders(response, headers);
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
