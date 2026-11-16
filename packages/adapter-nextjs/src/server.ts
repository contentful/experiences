export * from '@contentful/experiences-react/server';

export {
  configureNextjsServerExperiences,
  bindNextjsExperiencesRequest,
  type BindNextjsExperiencesRequestOptions,
} from './server-request.js';
export {
  createNextjsPageContext,
  createNextjsRequestContext,
  createNextjsRouteKey,
  NEXTJS_EXPERIENCES_REQUEST_HEADER_PREFIX,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
  type CreateNextjsPageContextOptions,
  type CreateNextjsRequestContextOptions,
  type NextjsPageContextInput,
  type NextjsSearchParams,
  type NextjsCookieReader,
  type NextjsRequestLike,
} from './request-context.js';
export {
  createNextjsAnonymousIdSetCookieHeader,
  persistNextjsAnonymousId,
  type NextjsAnonymousIdCookieOptions,
  type PersistNextjsAnonymousIdOptions,
  type NextjsResponseLike,
} from './cookies.js';
export {
  createNextjsPrivateFetch,
  applyNextjsPrivateResponseCache,
  assertNextjsPublicRequestPolicy,
} from './cache.js';
export {
  serializeNextjsPlan,
  serializeNextjsHandoff,
  serializeNextjsJsonForHtml,
} from './serialization.js';
export {
  createExperiencesCacheKey,
  createPublicPermutationCacheMetadata,
  type NextjsExperiencesCacheKeyInput,
} from './cache-key.js';
export type { RequestRuntime, RequestContext, ConsentInput } from '@contentful/experiences-node';

export type { NextjsPreviewConfig, NextjsPreviewContext } from './preview.js';
