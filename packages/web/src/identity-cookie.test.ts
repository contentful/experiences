// @vitest-environment jsdom

import {
  ANONYMOUS_ID_COOKIE,
  ANONYMOUS_ID_COOKIE_LEGACY,
  ANONYMOUS_ID_KEY,
} from '@contentful/experiences-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentityCookie } from './identity-cookie.js';
import { getCookie, setCookie } from './lib/cookies.js';
import LocalStore from './storage/local-store.js';

function clearCookies(): void {
  for (const name of [ANONYMOUS_ID_COOKIE, ANONYMOUS_ID_COOKIE_LEGACY]) {
    document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/`;
  }
}

/** Replaces document.cookie with a jar to read from and a log of everything written. */
function captureCookieWrites(jar = ''): { writes: string[]; restore: () => void } {
  const writes: string[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => jar,
    set: (value: string) => {
      writes.push(value);
    },
  });
  return {
    writes,
    restore: () => {
      Reflect.deleteProperty(document, 'cookie');
      Object.defineProperty(Document.prototype, 'cookie', descriptor);
    },
  };
}

function create(overrides: ConstructorParameters<typeof IdentityCookie>[1] = {}) {
  const store = new LocalStore();
  const identity = new IdentityCookie(store, overrides);
  return { store, identity };
}

beforeEach(() => {
  window.localStorage.clear();
  clearCookies();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('IdentityCookie.persist', () => {
  it('writes the cookie and the stored id for an allowed identity', () => {
    const { identity } = create();

    identity.persist('visitor-1');

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('visitor-1');
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('visitor-1');
  });

  it('clears both when there is no identity to keep', () => {
    const { identity } = create();
    identity.persist('visitor-1');

    identity.persist(undefined);

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
  });

  it('expires the cookie after 365 days by default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const { writes, restore } = captureCookieWrites();
    const { identity } = create();

    identity.persist('visitor-1');
    restore();

    expect(writes[0]).toContain(`Expires=${new Date('2027-01-01T00:00:00.000Z').toUTCString()}`);
  });
});

describe('IdentityCookie cookie scope', () => {
  it('applies the configured domain, path, SameSite, Secure and expiry', () => {
    const { writes, restore } = captureCookieWrites();
    const { identity } = create({
      domain: 'example.com',
      path: '/shop',
      sameSite: 'lax',
      secure: true,
      expires: 30,
    });

    identity.persist('visitor-1');
    restore();

    expect(writes[0]).toMatch(
      /^ctfl-opt-aid=visitor-1; Path=\/shop; Domain=example\.com; SameSite=lax; Secure; Expires=/
    );
  });

  it('deletes the cookie in the scope it was written in', () => {
    const { writes, restore } = captureCookieWrites();
    const { identity } = create({
      domain: 'example.com',
      path: '/shop',
      sameSite: 'none',
      secure: true,
    });

    identity.persist('visitor-1');
    identity.clear();
    restore();

    expect(writes.at(-2)).toContain('Path=/shop; Domain=example.com; SameSite=none; Secure');
    expect(writes.at(-1)).toContain(
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/shop; Domain=example.com; SameSite=none; Secure'
    );
  });
});

describe('IdentityCookie.adopt', () => {
  it('returns the server cookie id and stores it', () => {
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');
    const { identity, store } = create();

    const result = identity.adopt({ currentProfileId: undefined });

    expect(result).toEqual({ id: 'server-id', differsFromProfile: true });
    expect(store.anonymousId).toBe('server-id');
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('server-id');
  });

  it('reports no difference when the cookie matches the profile already held', () => {
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');
    const { identity } = create();

    expect(identity.adopt({ currentProfileId: 'server-id' })).toEqual({
      id: 'server-id',
      differsFromProfile: false,
    });
  });

  it('returns nothing when there is no cookie', () => {
    const { identity } = create();

    expect(identity.adopt({ currentProfileId: undefined })).toBeUndefined();
  });

  it('writes nothing when the cookie already matches the stored id', () => {
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'server-id');
    const { writes, restore } = captureCookieWrites(`${ANONYMOUS_ID_COOKIE}=server-id`);
    const { identity } = create();

    const result = identity.adopt({ currentProfileId: 'server-id' });
    restore();

    // Rewriting it would push its expiry out each time the SDK starts.
    expect(writes).toEqual([]);
    expect(result).toEqual({ id: 'server-id', differsFromProfile: false });
  });

  it('does not report a difference for a cookie that matches the stored id, even with no profile', () => {
    setCookie(ANONYMOUS_ID_COOKIE, 'server-id');
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'server-id');
    const { identity } = create();

    // Nothing changed since the last load, so there is nothing to reconcile.
    expect(identity.adopt({ currentProfileId: undefined })).toEqual({
      id: 'server-id',
      differsFromProfile: false,
    });
  });

  it('migrates a legacy cookie to the current one and removes the legacy cookie', () => {
    setCookie(ANONYMOUS_ID_COOKIE_LEGACY, 'legacy-id');
    const { identity, store } = create();

    const result = identity.adopt({ currentProfileId: undefined });

    expect(result?.id).toBe('legacy-id');
    expect(store.anonymousId).toBe('legacy-id');
    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('legacy-id');
    expect(getCookie(ANONYMOUS_ID_COOKIE_LEGACY)).toBeUndefined();
  });

  it('reads the legacy cookie ahead of the current one, as the Optimization SDK does, and removes it', () => {
    setCookie(ANONYMOUS_ID_COOKIE, 'current-id');
    setCookie(ANONYMOUS_ID_COOKIE_LEGACY, 'legacy-id');
    const { identity } = create();

    expect(identity.adopt({ currentProfileId: undefined })?.id).toBe('legacy-id');
    expect(getCookie(ANONYMOUS_ID_COOKIE_LEGACY)).toBeUndefined();
  });

  it('writes the current cookie when a matching legacy cookie is migrated', () => {
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'legacy-id');
    setCookie(ANONYMOUS_ID_COOKIE_LEGACY, 'legacy-id');
    const { identity } = create();

    identity.adopt({ currentProfileId: undefined });

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBe('legacy-id');
    expect(getCookie(ANONYMOUS_ID_COOKIE_LEGACY)).toBeUndefined();
  });
});

describe('IdentityCookie.resolve', () => {
  it('prefers the profile id, then the adopted handoff id, then the stored id', () => {
    const { identity, store } = create();
    store.anonymousId = 'stored-id';

    expect(identity.resolve({ profileId: 'profile-id', handoffId: 'handoff-id' })).toBe(
      'profile-id'
    );
    expect(identity.resolve({ profileId: undefined, handoffId: 'handoff-id' })).toBe('handoff-id');
    expect(identity.resolve({ profileId: undefined, handoffId: undefined })).toBe('stored-id');
  });

  it('is undefined when nothing is known', () => {
    const { identity } = create();

    expect(identity.resolve({ profileId: undefined, handoffId: undefined })).toBeUndefined();
  });
});

describe('IdentityCookie.clear', () => {
  it('removes both cookies and the stored id', () => {
    setCookie(ANONYMOUS_ID_COOKIE, 'visitor-1');
    setCookie(ANONYMOUS_ID_COOKIE_LEGACY, 'visitor-1');
    const { identity, store } = create();
    store.anonymousId = 'visitor-1';

    identity.clear();

    expect(getCookie(ANONYMOUS_ID_COOKIE)).toBeUndefined();
    expect(getCookie(ANONYMOUS_ID_COOKIE_LEGACY)).toBeUndefined();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
  });
});
