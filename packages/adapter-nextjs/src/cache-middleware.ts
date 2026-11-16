import type { ExperiencesCacheMetadata, MaybePromise } from '@contentful/experiences-node';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server.js';
import { validateNextjsPublicPermutationCacheTags } from './cache-key.js';
import { NEXTJS_EXPERIENCES_REQUEST_URL_HEADER, normalizedRequestUrl } from './request-context.js';
import {
  isMiddlewareContinuation,
  createForwardedRequestHeaders,
  applyForwardedRequestHeaders,
} from './forwarded-request-headers.js';

const REWRITE = 'x-middleware-rewrite';
const DEFAULT_CACHE_KEY_SEARCH_PARAM = 'ctfl-exp-cache-key';

export type NextjsPublicPermutationCacheMetadata = Extract<
  ExperiencesCacheMetadata,
  { scope: 'public-permutation' }
>;

export interface NextjsPublicPermutationCacheRewriteContext {
  readonly cache: NextjsPublicPermutationCacheMetadata;
  readonly encodedCacheKey: string;
  readonly pathname: string;
  readonly request: NextRequest;
}

export interface NextjsPublicPermutationCacheMiddlewareOptions {
  /** The application approves all public XDA dimensions; never return visitor identity or replay. */
  readonly resolveCache: (
    request: NextRequest
  ) => MaybePromise<NextjsPublicPermutationCacheMetadata | undefined>;
  readonly rewrite?: (context: NextjsPublicPermutationCacheRewriteContext) => string | URL;
  readonly cacheKeySearchParam?: string;
}

export type NextjsPublicPermutationCacheMiddleware = (
  request: NextRequest,
  responseOrEvent?: NextResponse | NextFetchEvent
) => MaybePromise<NextResponse>;

/** Edge-compatible routing only; no SDK construction, content fetching or event work. */
export function createNextjsPublicPermutationCacheMiddleware(
  options: NextjsPublicPermutationCacheMiddlewareOptions
): NextjsPublicPermutationCacheMiddleware {
  return async (request, responseOrEvent) => {
    const existing =
      responseOrEvent instanceof globalThis.Response
        ? (responseOrEvent as NextResponse)
        : undefined;
    if (existing && (!isMiddlewareContinuation(existing) || existing.headers.has(REWRITE)))
      return existing;

    const cache = await options.resolveCache(request);
    if (cache === undefined) return existing ?? NextResponse.next();
    if (
      typeof cache !== 'object' ||
      cache === null ||
      Array.isArray(cache) ||
      cache.scope !== 'public-permutation' ||
      typeof cache.key !== 'string' ||
      !cache.key.trim()
    ) {
      throw new TypeError(
        'Public permutation cache middleware requires public scope and a nonempty key.'
      );
    }
    validateNextjsPublicPermutationCacheTags(cache.tags);

    let rewriteUrl: URL;
    if (options.rewrite) {
      rewriteUrl = new URL(
        options.rewrite({
          cache,
          encodedCacheKey: encodeURIComponent(cache.key),
          pathname: request.nextUrl.pathname,
          request,
        }),
        request.url
      );
    } else {
      rewriteUrl = new URL(request.url);
      rewriteUrl.searchParams.set(
        options.cacheKeySearchParam ?? DEFAULT_CACHE_KEY_SEARCH_PARAM,
        cache.key
      );
    }

    const headers = createForwardedRequestHeaders(request.headers, existing);
    headers.set(
      NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
      normalizedRequestUrl(request.url).toString()
    );
    const response = existing ?? NextResponse.rewrite(rewriteUrl);
    response.headers.set(REWRITE, rewriteUrl.toString());
    applyForwardedRequestHeaders(response, headers);
    return response;
  };
}
