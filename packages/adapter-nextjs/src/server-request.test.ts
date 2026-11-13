import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { RequestRuntime } from '@contentful/experiences-node';
import { applyPrivateResponseCache } from './cache.js';
import { persistAnonymousId } from './cookies.js';
import { bindExperiencesRequest, configureServerExperiences } from './server-request.js';

describe('one explicit Node facade', () => {
  it('binds once and returns the actual facade without decorating methods', () => {
    const sdk = configureServerExperiences({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'test' },
    });
    const forRequest = vi.spyOn(sdk, 'forRequest');
    const request = bindExperiencesRequest(sdk, {
      consent: { events: false, persistence: true },
      locale: 'de',
      request: {
        url: 'https://example.com/page?utm_source=email&tag=a&tag=b',
        headers: new globalThis.Headers({
          cookie: 'ctfl-opt-aid=existing',
          referer: 'https://referrer.test',
        }),
      },
      page: { path: '/page', searchParams: { utm_source: 'email', tag: ['a', 'b'] } },
      personalizationOptions: { ip: 'host-trusted' },
    });
    expect(forRequest).toHaveBeenCalledTimes(1);
    expectTypeOf(request).toEqualTypeOf<RequestRuntime>();
    expect(request).not.toHaveProperty('request');
    expect(request).not.toHaveProperty('persist');
    expect(request).toBe(forRequest.mock.results[0]!.value);
    expect(request.profile?.id).toBe('existing');
    expect(forRequest.mock.calls[0]![0]).toMatchObject({
      personalizationOptions: { ip: 'host-trusted' },
      eventContext: { page: { path: '/page' } },
    });
    expect(Object.hasOwn(request, 'fetchExperience')).toBe(false);
    expect(request.eventBuilder.buildPageView().context).toMatchObject({
      page: {
        url: 'https://example.com/page?utm_source=email&tag=a&tag=b',
        referrer: 'https://referrer.test',
        query: { utm_source: 'email', tag: ['a', 'b'] },
      },
      campaign: { source: 'email' },
    });
    const response = {
      headers: new globalThis.Headers({
        vary: 'RSC, Next-Router-State-Tree',
        'set-cookie': 'other=1',
      }),
    };
    applyPrivateResponseCache(response);
    persistAnonymousId(response, request);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('RSC, Next-Router-State-Tree');
    expect(response.headers.getSetCookie()).toHaveLength(2);
    request.destroy();
  });

  it('treats explicitly empty cookies and effective headers as authoritative', () => {
    const sdk = configureServerExperiences({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'test' },
    });
    const incoming = {
      url: 'https://example.com',
      headers: new globalThis.Headers({ cookie: 'ctfl-opt-aid=old' }),
      cookies: { get: () => ({ value: 'old' }) },
    };
    for (const extra of [
      { cookies: { get: () => undefined } },
      { headers: new globalThis.Headers() },
    ]) {
      const request = bindExperiencesRequest(sdk, {
        consent: { persistence: true },
        request: incoming,
        ...extra,
      });
      expect(request.profile).toBeUndefined();
      request.destroy();
    }
    const request = bindExperiencesRequest(sdk, {
      consent: false,
      request: incoming,
      profile: { id: 'explicit' },
    });
    expect(request.profile?.id).toBe('explicit');
    request.destroy();
  });

  it('requires consent before binding and derives the request preview session', () => {
    const sdk = configureServerExperiences({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'test' },
      preview: { accessToken: 'preview' },
    });
    const forRequest = vi.spyOn(sdk, 'forRequest');
    expect(() => bindExperiencesRequest(sdk, { consent: undefined! })).toThrow('consent');
    expect(forRequest).not.toHaveBeenCalled();
    const preview = { sessionId: 'session' };
    const request = bindExperiencesRequest(sdk, {
      consent: true,
      request: {
        url: 'https://example.com/?preview_session_id=session',
        headers: new globalThis.Headers(),
      },
    });
    expect(request.isPreview).toBe(true);
    const response = { headers: new globalThis.Headers() };
    applyPrivateResponseCache(response);
    persistAnonymousId(response, request);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(forRequest.mock.calls[0]![0]?.preview).toMatchObject(preview);
    request.destroy();
  });
});

it.each([
  [false, '?preview_session_id=session', false],
  [true, '', false],
  [true, '?preview_session_id=', false],
  [true, '?preview_session_id=%20', false],
  [true, '?preview_session_id=%20session%20', true],
] as const)(
  'derives forwarded sessions only with configuration (%s, %s)',
  (configured, search, expected) => {
    const sdk = configureServerExperiences({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'test' },
      preview: configured ? { accessToken: 'preview' } : undefined,
    });
    const request = bindExperiencesRequest(sdk, {
      consent: true,
      profile: { id: 'visitor' },
      headers: new globalThis.Headers({
        'x-ctfl-exp-request-url': 'https://example.com/' + search,
      }),
    });
    expect(request.isPreview).toBe(expected);
    expect(request.profile).toEqual(expected ? undefined : { id: 'visitor' });
    request.destroy();
  }
);

it('does not read cookie identity without persistence consent or during preview', () => {
  const sdk = configureServerExperiences({
    spaceId: 'space',
    environmentId: 'master',
    delivery: { accessToken: 'test' },
    preview: { accessToken: 'preview' },
  });
  const get = vi.fn(() => {
    throw new Error('cookie must not be read');
  });
  for (const context of [
    { consent: false },
    { consent: { events: true } },
    {
      consent: true,
      request: {
        url: 'https://example.com/?preview_session_id=session',
        headers: new globalThis.Headers(),
      },
    },
  ]) {
    for (const profile of [undefined, { id: 'app-approved' }]) {
      const request = bindExperiencesRequest(sdk, { ...context, cookies: { get }, profile });
      expect(request.profile).toEqual(request.isPreview ? undefined : profile);
      request.destroy();
    }
  }
  expect(get).not.toHaveBeenCalled();
});
