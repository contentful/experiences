import { ANONYMOUS_ID_COOKIE } from '@contentful/experiences-node';

/**
 * The HTTP side of the identity cookie, for an application that renders on a Node server.
 *
 * The Node SDK never touches HTTP: it takes the visitor's profile and consent from the
 * host, and tells the host whether it may keep the identity (`canPersistProfile`). This
 * file is that host code, written against plain `Cookie` and `Set-Cookie` headers so it
 * fits any framework. Copy what you need; none of it is SDK API.
 */

/**
 * The cookie settings, in the same shape and units as the Web SDK's `cookie` option, so one
 * object can configure both sides. Only HTTP serialization differs: `expires` is a number
 * of days here too, and becomes an `Expires` date in the header.
 */
export interface IdentityCookieSettings {
  domain?: string;
  path?: string;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  /** Days until the cookie expires. The Web SDK writes 365 unless told otherwise. */
  expires?: number;
}

const DEFAULT_EXPIRES_IN_DAYS = 365;
const EXPIRED_UTC = 'Thu, 01 Jan 1970 00:00:00 GMT';

/**
 * One cookie's value from a `Cookie` request header. The header is split on `;` and each
 * field trimmed, so `a=1;b=2` and `a=1; b=2` read alike, as in the Optimization SDK's
 * server cookie parser.
 */
function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim() || undefined;
  }
  return undefined;
}

/** The visitor's profile id from a `Cookie` request header, if the cookie is present. */
export function readIdentity(cookieHeader: string | undefined): string | undefined {
  return readCookie(cookieHeader, ANONYMOUS_ID_COOKIE);
}

/**
 * Whether this application may keep the visitor's identity. It has to come from the
 * application: your own consent record, a session, a CMP token. The identity cookie being
 * present proves nothing about consent, and neither does anything in the browser's storage.
 * This example reads a cookie of its own to show where that decision belongs.
 */
export function hasServerConsent(cookieHeader: string | undefined): boolean {
  return readCookie(cookieHeader, 'app-personalization-consent') === 'granted';
}

function scope(settings: IdentityCookieSettings): string {
  let attributes = `; Path=${settings.path ?? '/'}`;
  if (settings.domain) attributes += `; Domain=${settings.domain}`;
  if (settings.sameSite) attributes += `; SameSite=${settings.sameSite}`;
  if (settings.secure) attributes += '; Secure';
  return attributes;
}

/**
 * The `Set-Cookie` value for a response, or `undefined` when there is nothing to change.
 *
 * Pass the request's `canPersistProfile` and the handoff's continuation id
 * (`handoff.profileId`), which is what the browser continues. Do not pass the profile the
 * preview evaluated (`request.profile?.id`); it can differ from the visitor's own id.
 *
 * Persistence permission decides: when it is withheld the cookie is expired, in the scope
 * it was written in, and otherwise the current id is written. The cookie's presence is
 * never taken as permission.
 */
export function identitySetCookie({
  canPersistProfile,
  profileId,
  hadCookie,
  settings = {},
}: {
  canPersistProfile: boolean;
  profileId: string | undefined;
  /** Whether the request carried the cookie, so an absent one is not expired needlessly. */
  hadCookie: boolean;
  settings?: IdentityCookieSettings;
}): string | undefined {
  if (!canPersistProfile) {
    return hadCookie
      ? `${ANONYMOUS_ID_COOKIE}=; Expires=${EXPIRED_UTC}${scope(settings)}`
      : undefined;
  }
  if (!profileId) return undefined;

  const days = settings.expires ?? DEFAULT_EXPIRES_IN_DAYS;
  const expires = new Date(Date.now() + days * 86_400_000).toUTCString();
  // Written as it is, like the Web SDK, so both sides read one value.
  return `${ANONYMOUS_ID_COOKIE}=${profileId}${scope(settings)}; Expires=${expires}`;
}
