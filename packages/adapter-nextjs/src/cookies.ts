import { ANONYMOUS_ID_COOKIE, type RequestRuntime } from '@contentful/experiences-node';

export interface NextjsAnonymousIdCookieOptions {
  readonly domain?: string;
  readonly expires?: Date;
  readonly httpOnly?: boolean;
  readonly maxAge?: number;
  readonly path?: string;
  readonly sameSite?: boolean | 'lax' | 'none' | 'strict';
  readonly secure?: boolean;
}

export interface PersistNextjsAnonymousIdOptions {
  readonly anonymousIdCookieName?: string;
  readonly cookieOptions?: NextjsAnonymousIdCookieOptions;
  /** Explicit host withdrawal policy. Defaults to true, following Optimization. */
  readonly deleteWhenProfileCannotPersist?: boolean;
}

export interface NextjsResponseLike {
  readonly headers: globalThis.Headers;
  readonly cookies?: {
    set(name: string, value: string, options?: NextjsAnonymousIdCookieOptions): unknown;
  };
}

function resolveAnonymousIdCookie(
  request: RequestRuntime,
  {
    anonymousIdCookieName = ANONYMOUS_ID_COOKIE,
    cookieOptions,
    deleteWhenProfileCannotPersist = true,
  }: PersistNextjsAnonymousIdOptions = {}
) {
  if (request.isPreview || (!request.canPersistProfile && !deleteWhenProfileCannotPersist))
    return undefined;
  const value = request.canPersistProfile ? request.profile?.id : '';
  if (value === undefined || (request.canPersistProfile && !value)) return undefined;
  const options = {
    path: '/',
    sameSite: 'lax' as const,
    ...cookieOptions,
    ...(!request.canPersistProfile ? { expires: new Date(0), maxAge: 0 } : {}),
  };
  if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(anonymousIdCookieName))
    throw new TypeError('Invalid anonymous ID cookie name');
  for (const attribute of [options.path, options.domain]) {
    if (
      attribute !== undefined &&
      [...attribute].some((char) => char === ';' || char < ' ' || char === '\x7f')
    )
      throw new TypeError('Invalid anonymous ID cookie scope');
  }
  if (options.maxAge !== undefined && !Number.isFinite(options.maxAge))
    throw new TypeError('Invalid cookie maxAge');
  if (options.expires !== undefined && !Number.isFinite(options.expires.getTime()))
    throw new TypeError('Invalid cookie expires');
  if (options.maxAge !== undefined) options.maxAge = Math.trunc(options.maxAge);
  const sameSite = options.sameSite === true ? ('strict' as const) : options.sameSite;
  return { name: anonymousIdCookieName, value, options: { ...options, sameSite } };
}

export function createNextjsAnonymousIdSetCookieHeader(
  request: RequestRuntime,
  options?: PersistNextjsAnonymousIdOptions
): string | undefined {
  const cookie = resolveAnonymousIdCookie(request, options);
  return cookie === undefined ? undefined : serializeCookie(cookie);
}

function serializeCookie({
  name,
  value,
  options,
}: NonNullable<ReturnType<typeof resolveAnonymousIdCookie>>): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite[0]!.toUpperCase()}${options.sameSite.slice(1)}`);
  }
  return parts.join('; ');
}

function isCookieAtScope(
  header: string,
  name: string,
  options: NextjsAnonymousIdCookieOptions
): boolean {
  if (header.slice(0, header.indexOf('=')).trim() !== name) return false;
  const [, ...attributes] = header.split(';');
  let domain = '';
  let path = '';
  for (const attribute of attributes) {
    const separator = attribute.indexOf('=');
    if (separator === -1) continue;
    const key = attribute.slice(0, separator).trim().toLowerCase();
    const value = attribute.slice(separator + 1).trim();
    if (key === 'domain') domain = value.toLowerCase().replace(/^\./, '');
    if (key === 'path') path = value;
  }
  return (
    domain === (options.domain ?? '').toLowerCase().replace(/^\./, '') &&
    path === (options.path ?? '/')
  );
}

/** Append at a writable response boundary using the facade's current identity. */
export function persistNextjsAnonymousId(
  response: NextjsResponseLike,
  request: RequestRuntime,
  options?: PersistNextjsAnonymousIdOptions
): void {
  const cookie = resolveAnonymousIdCookie(request, options);
  if (cookie === undefined) return;
  if (response.cookies) {
    const previous = response.headers.getSetCookie();
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    // Next's jar is name-keyed; preserve raw application headers in their original order.
    const written = response.headers.getSetCookie();
    if (
      previous.every(
        (value) => written.includes(value) || isCookieAtScope(value, cookie.name, cookie.options)
      )
    )
      return;
    const identity = written.find((value) => isCookieAtScope(value, cookie.name, cookie.options));
    if (identity === undefined) return;
    response.headers.delete('set-cookie');
    for (const value of previous) {
      if (isCookieAtScope(value, cookie.name, cookie.options)) continue;
      response.headers.append('set-cookie', value);
    }
    response.headers.append('set-cookie', identity);
  } else {
    response.headers.append('set-cookie', serializeCookie(cookie));
  }
}
