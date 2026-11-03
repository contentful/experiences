import type { NextResponse } from 'next/server.js';
import { NEXTJS_EXPERIENCES_REQUEST_HEADER_PREFIX } from './request-context.js';

// Optimization's forwarded-request-headers mechanics, shared by both middleware paths.
const OVERRIDE = 'x-middleware-override-headers';
const PREFIX = 'x-middleware-request-';
const names = (headers: globalThis.Headers) => {
  const result: string[] = [];
  headers.forEach((_value, name) => result.push(name));
  return result;
};

export function isMiddlewareContinuation(response: NextResponse): boolean {
  return (
    !(response.status >= 300 && response.status < 400 && response.headers.has('location')) &&
    ['x-middleware-next', 'x-middleware-rewrite', OVERRIDE].some((name) =>
      response.headers.has(name)
    )
  );
}

export function createForwardedRequestHeaders(
  incoming: globalThis.Headers,
  response?: NextResponse
): globalThis.Headers {
  const overrides = response?.headers.get(OVERRIDE);
  const headers = new globalThis.Headers(overrides == null ? incoming : undefined);
  for (const name of overrides?.split(',') ?? []) {
    const key = name.trim();
    const value = response!.headers.get(PREFIX + key);
    if (key && value !== null) headers.set(key, value);
  }
  for (const name of names(headers))
    if (name.startsWith(NEXTJS_EXPERIENCES_REQUEST_HEADER_PREFIX)) headers.delete(name);
  return headers;
}

export function applyForwardedRequestHeaders(
  response: NextResponse,
  headers: globalThis.Headers
): void {
  for (const name of names(response.headers))
    if (name === OVERRIDE || name.startsWith(PREFIX)) response.headers.delete(name);
  headers.forEach((value, name) => response.headers.set(PREFIX + name, value));
  response.headers.set(OVERRIDE, names(headers).join(','));
}
