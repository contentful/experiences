import { isLocalRedirectPath, request } from '$lib/server/experiences.js';
import type { Handle, HandleServerError } from '@sveltejs/kit';

export const handleFetch = request.handleFetch;

export const handleError: HandleServerError = ({ error }) => {
  console.error(error);
  // Plain public JSON for native Kit 2 SSR boundary recovery. No raw message/stack.
  return { message: 'This content could not be displayed.' };
};

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const outcome = event.locals.exoDocumentOutcome;
  if (
    ['/[...path]', '/experiences/[id]'].includes(event.route.id ?? '') &&
    !event.isDataRequest &&
    !event.isSubRequest &&
    ['GET', 'HEAD'].includes(event.request.method) &&
    outcome?.routeKey === event.url.pathname + event.url.search &&
    response.status === 200 &&
    response.headers.get('content-type')?.startsWith('text/html')
  ) {
    if (isLocalRedirectPath(outcome.redirect)) {
      const headers = new globalThis.Headers(response.headers);
      headers.set('location', outcome.redirect);
      headers.delete('content-length');
      headers.delete('content-type');
      return new globalThis.Response(null, { status: 307, headers });
    }
    if (outcome.notFound) {
      return new globalThis.Response(response.body, {
        status: 404,
        statusText: 'Not Found',
        headers: response.headers,
      });
    }
  }
  return response;
};
