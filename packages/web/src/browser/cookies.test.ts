// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCookie, removeCookie, setCookie } from './cookies.js';

const originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');

/** Replaces document.cookie with a jar to read from and a log of everything written. */
function stubCookieJar(jar = ''): { written: string[] } {
  const written: string[] = [];
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => jar,
    set: (value: string) => {
      written.push(value);
    },
  });
  return { written };
}

afterEach(() => {
  // Restore globals first: an SSR test replaces `document`, and the cookie jar cannot be
  // put back until it exists again.
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Own-property stubs shadow the prototype accessor, so deleting them restores jsdom's.
  Reflect.deleteProperty(document, 'cookie');
  if (originalCookie) Object.defineProperty(Document.prototype, 'cookie', originalCookie);
});

describe('getCookie', () => {
  it('returns the matching cookie value when present', () => {
    stubCookieJar('foo=bar; baz=qux');

    expect(getCookie('baz')).toBe('qux');
  });

  it('returns undefined when cookie is missing', () => {
    stubCookieJar('foo=bar');

    expect(getCookie('missing')).toBeUndefined();
  });

  it('returns undefined when document.cookie is empty', () => {
    stubCookieJar('');

    expect(getCookie('foo')).toBeUndefined();
  });

  it('does not match a cookie whose name only ends with the requested one', () => {
    stubCookieJar('xfoo=wrong; foo=right');

    expect(getCookie('foo')).toBe('right');
  });

  it('returns undefined in SSR environments where document is undefined', () => {
    vi.stubGlobal('document', undefined);

    expect(getCookie('foo')).toBeUndefined();
  });
});

describe('setCookie', () => {
  it('writes a cookie with Path=/ by default', () => {
    const { written } = stubCookieJar();

    setCookie('foo', 'bar');

    expect(written).toEqual(['foo=bar; Path=/']);
  });

  it('appends Expires when expires is a finite number of days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const { written } = stubCookieJar();

    setCookie('foo', 'bar', { expires: 1 });

    expect(written[0]).toContain('foo=bar; Path=/');
    expect(written[0]).toContain(`Expires=${new Date('2026-01-02T00:00:00.000Z').toUTCString()}`);
  });

  it('skips Expires when value is not finite', () => {
    const { written } = stubCookieJar();

    setCookie('foo', 'bar', { expires: Number.POSITIVE_INFINITY });

    expect(written).toEqual(['foo=bar; Path=/']);
  });

  it('appends Domain when provided', () => {
    const { written } = stubCookieJar();

    setCookie('foo', 'bar', { domain: 'example.com' });

    expect(written).toEqual(['foo=bar; Path=/; Domain=example.com']);
  });

  it('writes SameSite and Secure when provided', () => {
    const { written } = stubCookieJar();

    setCookie('foo', 'bar', { sameSite: 'lax', secure: true });

    expect(written).toEqual(['foo=bar; Path=/; SameSite=lax; Secure']);
  });

  it('is a no-op in SSR environments where document is undefined', () => {
    vi.stubGlobal('document', undefined);

    expect(() => {
      setCookie('foo', 'bar');
    }).not.toThrow();
  });
});

describe('removeCookie', () => {
  it('uses the configured scope and policy for both writing and deletion', () => {
    const { written } = stubCookieJar();
    const attributes = {
      domain: 'example.com',
      path: '/shop',
      sameSite: 'none',
      secure: true,
    } as const;

    setCookie('foo', 'bar', attributes);
    removeCookie('foo', attributes);

    expect(written).toEqual([
      'foo=bar; Path=/shop; Domain=example.com; SameSite=none; Secure',
      'foo=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/shop; Domain=example.com; SameSite=none; Secure',
    ]);
  });

  it('writes an expired cookie at the epoch', () => {
    const { written } = stubCookieJar();

    removeCookie('foo');

    expect(written).toEqual(['foo=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/']);
  });

  it('appends Domain when provided', () => {
    const { written } = stubCookieJar();

    removeCookie('foo', { domain: 'example.com' });

    expect(written).toEqual([
      'foo=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Domain=example.com',
    ]);
  });

  it('is a no-op in SSR environments where document is undefined', () => {
    vi.stubGlobal('document', undefined);

    expect(() => {
      removeCookie('foo');
    }).not.toThrow();
  });
});
