import type { RequestResult } from './request-result.js';

/** Maps a Destination redirect path to the application URL; defaults to the path itself. */
export type RedirectLocation = (path: string, result: RequestResult) => string;

export type RequestOutcome =
  { readonly kind: 'redirect'; readonly location: string } | { readonly kind: 'not-found' };

/**
 * The routing outcome of a primary request, if any. Content, content errors and
 * empty Experiences have none; navigation stays with the application's framework.
 */
export function getRequestOutcome(
  result: Pick<RequestResult, 'redirect' | 'notFound'> & Partial<RequestResult>,
  redirectLocation: RedirectLocation = (path) => path
): RequestOutcome | undefined {
  if (result.redirect)
    return {
      kind: 'redirect',
      location: redirectLocation(result.redirect.path, result as RequestResult),
    };
  if (result.notFound) return { kind: 'not-found' };
  return undefined;
}
