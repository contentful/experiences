import {
  assertExperiencesCacheSafety,
  type ExperiencesCacheMetadata,
  type RequestContext,
  type FetchExperienceOptions,
} from '@contentful/experiences-node';
import type { NextjsResponseLike } from './cookies.js';
import { validateNextjsPublicPermutationCacheTags } from './cache-key.js';

/** Install only in host-assembled private Delivery/CPA configuration. */
export function createNextjsPrivateFetch(
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
  return (input, init) => {
    const options = init as
      | (globalThis.RequestInit & {
          next?: { revalidate?: number | false; [key: string]: unknown };
        })
      | undefined;
    let next = options?.next;
    if (
      next &&
      (next.revalidate === false || (typeof next.revalidate === 'number' && next.revalidate > 0))
    ) {
      const { revalidate: _revalidate, ...rest } = next;
      next = rest;
    }
    return fetchImplementation(input, {
      ...init,
      ...(next === undefined ? {} : { next }),
      cache: 'no-store',
    });
  };
}

export function applyNextjsPrivateResponseCache(response: NextjsResponseLike): void {
  response.headers.set('cache-control', 'private, no-store');
}

/** Validation only; the application owns the complete key and actual public cache. */
export function assertNextjsPublicRequestPolicy(options: {
  readonly cache: Exclude<ExperiencesCacheMetadata, { scope: 'private-request' }>;
  readonly context?: RequestContext;
  readonly fetchOptions?: FetchExperienceOptions;
}): void {
  const { cache, context, fetchOptions } = options;
  if (cache.scope !== 'static' && cache.scope !== 'public-permutation')
    throw new TypeError('Explicit public/static cache policy required');
  assertExperiencesCacheSafety({ spaceId: '', environmentId: '', cache });
  if (cache.scope === 'public-permutation') validateNextjsPublicPermutationCacheTags(cache.tags);
  if (
    context?.profile !== undefined ||
    context?.isPreview ||
    context?.livePreview !== undefined ||
    fetchOptions?.personalization !== undefined ||
    fetchOptions?.preview
  ) {
    throw new TypeError(
      'Public/static requests cannot contain identity, personalization events or preview'
    );
  }
}
