import { NextResponse } from 'next/server.js';
import { describe, expect, it } from 'vitest';
import type { ExperiencesNodeRequest } from '@contentful/experiences-node';
import { createNextjsAnonymousIdSetCookieHeader, persistNextjsAnonymousId } from './cookies.js';

const request = (values: Partial<ExperiencesNodeRequest>) => values as ExperiencesNodeRequest;

describe('response identity boundary', () => {
  it('retains configurable HttpOnly for standalone server-scoped persistence', () => {
    const facade = request({ canPersistProfile: true, profile: { id: 'server-id' } });
    const options = { cookieOptions: { httpOnly: true } };
    expect(createNextjsAnonymousIdSetCookieHeader(facade, options)).toContain('; HttpOnly;');
    const response = NextResponse.next();
    persistNextjsAnonymousId(response, facade, options);
    expect(response.cookies.get('ctfl-opt-aid')?.httpOnly).toBe(true);
    expect(response.headers.get('set-cookie')).toContain('; HttpOnly;');
  });

  it('appends the current ID without replacing application cookies or headers', () => {
    const response = {
      headers: new globalThis.Headers({ 'set-cookie': 'app=value; Path=/', vary: 'RSC' }),
    };
    persistNextjsAnonymousId(
      response,
      request({ canPersistProfile: true, profile: { id: 'id /+' }, isPreview: false }),
      { cookieOptions: { path: '/app', domain: 'example.com', secure: true, httpOnly: false } }
    );
    expect(response.headers.getSetCookie()).toEqual([
      'app=value; Path=/',
      'ctfl-opt-aid=id%20%2F%2B; Domain=example.com; Path=/app; Secure; SameSite=Lax',
    ]);
    expect(response.headers.get('vary')).toBe('RSC');
  });

  it('expires using the same scope only under the selected withdrawal policy', () => {
    const facade = request({
      canPersistProfile: false,
      profile: { id: 'memory' },
      isPreview: false,
    });
    expect(
      createNextjsAnonymousIdSetCookieHeader(facade, {
        cookieOptions: { path: '/app', domain: 'example.com' },
      })
    ).toBe(
      'ctfl-opt-aid=; Max-Age=0; Domain=example.com; Path=/app; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax'
    );
    expect(
      createNextjsAnonymousIdSetCookieHeader(facade, { deleteWhenProfileCannotPersist: false })
    ).toBeUndefined();
  });

  it.each([true, false])(
    'preview never writes or expires identity (persistence %s)',
    (canPersistProfile) => {
      expect(
        createNextjsAnonymousIdSetCookieHeader(
          request({ canPersistProfile, isPreview: true, profile: { id: 'id' } })
        )
      ).toBeUndefined();
    }
  );

  it('does not create missing identity and rejects cookie attribute injection', () => {
    expect(
      createNextjsAnonymousIdSetCookieHeader(request({ canPersistProfile: true, isPreview: false }))
    ).toBeUndefined();
    expect(() =>
      createNextjsAnonymousIdSetCookieHeader(
        request({ canPersistProfile: true, profile: { id: 'id' } }),
        { cookieOptions: { path: '/; injected=x' } }
      )
    ).toThrow('scope');
  });
});

it('uses the response-time profile rather than an earlier identity snapshot', () => {
  let id = 'initial';
  const facade = request({
    isPreview: false,
    canPersistProfile: true,
    get profile() {
      return { id };
    },
  });
  id = 'final-evaluated';
  const response = { headers: new globalThis.Headers() };
  persistNextjsAnonymousId(response, facade);
  expect(response.headers.get('set-cookie')).toContain('ctfl-opt-aid=final-evaluated');
});

it('keeps SDK identity in the actual NextResponse jar across application cookie writes', () => {
  const response = NextResponse.next();
  response.cookies.set('before', 'one');
  response.headers.set('vary', 'RSC');
  persistNextjsAnonymousId(
    response,
    request({ isPreview: false, canPersistProfile: true, profile: { id: 'issued /+' } })
  );
  response.cookies.set('after', 'two');
  expect(response.cookies.get('ctfl-opt-aid')?.value).toBe('issued /+');
  expect(response.cookies.get('before')?.value).toBe('one');
  expect(response.cookies.get('after')?.value).toBe('two');
  expect(
    response.headers.getSetCookie().filter((cookie) => cookie.startsWith('ctfl-opt-aid='))
  ).toEqual(['ctfl-opt-aid=issued%20%2F%2B; Path=/; SameSite=lax']);
  expect(response.headers.get('x-middleware-set-cookie')).toContain(
    'ctfl-opt-aid=issued%20%2F%2B;'
  );
  expect(response.headers.get('vary')).toBe('RSC');
});

it('replaces middleware identity with scoped expiry in the actual NextResponse jar', () => {
  const response = NextResponse.next();
  const cookieOptions = { path: '/app', domain: 'example.com' };
  response.cookies.set('ctfl-opt-aid', 'old-identity', cookieOptions);
  response.cookies.set('other', 'preserved');
  const otherScopes = [
    'ctfl-opt-aid=root-identity; Domain=example.com; Path=/',
    'ctfl-opt-aid=other-domain; Domain=other.example.com; Path=/app',
    'ctfl-opt-aid=; Path=/app; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  for (const value of otherScopes) response.headers.append('set-cookie', value);
  response.headers.append(
    'set-cookie',
    'ctfl-opt-aid=raw-old-identity; domain=.EXAMPLE.COM; path=/app'
  );
  persistNextjsAnonymousId(
    response,
    request({ isPreview: false, canPersistProfile: false, profile: { id: 'volatile' } }),
    { cookieOptions }
  );
  expect(response.headers.getSetCookie()).toEqual(expect.arrayContaining(otherScopes));
  expect(response.headers.get('set-cookie')).not.toContain('old-identity');
  // Next's name-keyed jar cannot retain raw alternate scopes across later jar writes.
  response.cookies.set('later', 'preserved-too');
  expect(response.cookies.get('ctfl-opt-aid')).toMatchObject({
    value: '',
    path: '/app',
    domain: 'example.com',
    maxAge: 0,
    expires: new Date(0),
  });
  expect(response.cookies.get('other')?.value).toBe('preserved');
  expect(response.cookies.get('later')?.value).toBe('preserved-too');
  const identityHeaders = response.headers
    .getSetCookie()
    .filter((cookie) => cookie.startsWith('ctfl-opt-aid='));
  expect(identityHeaders).toHaveLength(1);
  expect(identityHeaders[0]).toContain('Expires=Thu, 01 Jan 1970');
  expect(identityHeaders[0]).toContain('Max-Age=0');
  expect(response.headers.get('x-middleware-set-cookie')).toContain('ctfl-opt-aid=;');
  expect(response.headers.get('x-middleware-set-cookie')).not.toContain('old-identity');
});

it.each([false, true])(
  'normalizes options and preserves raw cookie order (duplicate scope: %s)',
  (duplicateScope) => {
    const initial = duplicateScope ? ['app=old; Path=/', 'app=new; Path=/'] : ['app=jar; Path=/'];
    const headers = new globalThis.Headers();
    for (const value of initial) headers.append('set-cookie', value);
    const response = NextResponse.next({ headers });
    const rawHeaders = [
      'raw=header; Path=/',
      ...(!duplicateScope ? ['app=raw-update; Path=/'] : []),
      'app=scoped; Path=/account',
      'app=domain; Domain=example.com; Path=/',
      'app=; Domain=example.com; Path=/account; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ];
    for (const value of rawHeaders) response.headers.append('set-cookie', value);
    const facade = request({ canPersistProfile: true, profile: { id: 'id' } });
    const options = { cookieOptions: { maxAge: 1.9, sameSite: true } };
    persistNextjsAnonymousId(response, facade, options);
    expect(response.cookies.get('ctfl-opt-aid')).toMatchObject({ maxAge: 1, sameSite: 'strict' });
    expect(
      response.headers.getSetCookie().filter((value) => !value.startsWith('ctfl-opt-aid='))
    ).toEqual([...initial, ...rawHeaders]);
    expect(createNextjsAnonymousIdSetCookieHeader(facade, options)).toBe(
      'ctfl-opt-aid=id; Max-Age=1; Path=/; SameSite=Strict'
    );
    expect(options.cookieOptions).toEqual({ maxAge: 1.9, sameSite: true });
  }
);
