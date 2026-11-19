import { building } from '$app/env';
import type { Handle, HandleFetch, HandleServerError } from '@sveltejs/kit/hooks';
import { getBinding } from '#lib/server/experiences.js';
export const handleFetch: HandleFetch = (context) => {
  const url = new URL(context.request.url);
  if (
    url.origin !== context.event.url.origin ||
    url.pathname !== '/_exo/prepare' ||
    context.request.method !== 'POST'
  )
    return context.fetch(context.request);
  if (building) return new Response('Unavailable during build', { status: 503 });
  try {
    return getBinding().request.handleFetch(context);
  } catch {
    return new Response('Configure server Delivery and deployment-gated Preview credentials.', {
      status: 503,
      headers: { 'cache-control': 'private, no-store' },
    });
  }
};
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const outcome = event.locals.exoDocumentOutcome;
  const status =
    outcome?.notFound &&
    outcome.routeKey === event.url.pathname + event.url.search &&
    response.status === 200 &&
    response.headers.get('content-type')?.includes('text/html')
      ? 404
      : response.status;
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'private, no-store');
  return new Response(response.body, { status, statusText: response.statusText, headers });
};
// Kit 3 native SSR boundary recovery: synchronous, serializable and sanitized.
export const handleError: HandleServerError = ({ error }) => {
  console.error(error);
  return { message: 'This content could not be displayed.' };
};
