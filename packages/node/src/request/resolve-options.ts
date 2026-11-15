import type { FetchResolveOptions, ResolveOptions } from '@contentful/experiences-runtime';
import type { RequestContext } from './types.js';

export function mergeResolveOptions(
  request: RequestContext['resolveOptions'],
  method: ResolveOptions
): ResolveOptions {
  return {
    ...mergeFetchResolveOptions(request, method),
    sourceMap: method.sourceMap ?? request?.sourceMap,
  };
}

export function mergeFetchResolveOptions(
  request: RequestContext['resolveOptions'],
  method: FetchResolveOptions
): FetchResolveOptions {
  return {
    config: method.config,
    metadata: { ...request?.metadata, ...method.metadata },
    debug: method.debug ?? request?.debug,
  };
}
