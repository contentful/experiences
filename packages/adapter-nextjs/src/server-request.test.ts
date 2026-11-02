import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ExperiencesNodeRequest } from '@contentful/experiences-node';
import { applyNextjsPrivateResponseCache } from './cache.js';
import { persistNextjsAnonymousId } from './cookies.js';
import {
  bindNextjsExperiencesRequest,
  configureNextjsServerExperiences,
} from './server-request.js';

describe('one explicit Node facade', () => {
  it('binds once and returns the actual facade without decorating methods', () => {
    const sdk = configureNextjsServerExperiences({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'test' },
    });
    const forRequest = vi.spyOn(sdk, 'forRequest');
    const request = bindNextjsExperiencesRequest(sdk, {
      consent: { events: false, persistence: true },
      locale: 'de',
      request: {
        url: 'https://example.com/page',
        headers: new globalThis.Headers({ cookie: 'ctfl-opt-aid=existing' }),
      },
      experienceOptions: { ip: 'host-trusted' },
    });
    expect(forRequest).toHaveBeenCalledTimes(1);
    expectTypeOf(request).toEqualTypeOf<ExperiencesNodeRequest>();
    expect(request).not.toHaveProperty('request');
    expect(request).not.toHaveProperty('persist');
    expect(request).toBe(forRequest.mock.results[0]!.value);
    expect(request.profile?.id).toBe('existing');
    expect(forRequest.mock.calls[0]![0]).toMatchObject({
      experienceOptions: { ip: 'host-trusted' },
      eventContext: { page: { path: '/page' } },
    });
    expect(Object.hasOwn(request, 'fetchExperience')).toBe(false);
    const response = {
      headers: new globalThis.Headers({
        vary: 'RSC, Next-Router-State-Tree',
        'set-cookie': 'other=1',
      }),
    };
    applyNextjsPrivateResponseCache(response);
    persistNextjsAnonymousId(response, request);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('RSC, Next-Router-State-Tree');
    expect(response.headers.getSetCookie()).toHaveLength(2);
    request.destroy();
  });

  it('treats explicitly empty cookies and effective headers as authoritative', () => {
    const sdk = configureNextjsServerExperiences({
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
      const request = bindNextjsExperiencesRequest(sdk, {
        consent: { persistence: true },
        request: incoming,
        ...extra,
      });
      expect(request.profile).toBeUndefined();
      request.destroy();
    }
    const request = bindNextjsExperiencesRequest(sdk, {
      consent: false,
      request: incoming,
      profile: { id: 'explicit' },
    });
    expect(request.profile?.id).toBe('explicit');
    request.destroy();
  });

  it('requires consent before binding and forwards preview policy unchanged', () => {
    const sdk = configureNextjsServerExperiences({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'test' },
    });
    const forRequest = vi.spyOn(sdk, 'forRequest');
    expect(() => bindNextjsExperiencesRequest(sdk, { consent: undefined! })).toThrow('consent');
    expect(forRequest).not.toHaveBeenCalled();
    const livePreview = {
      experienceId: 'home',
      sessionId: 'session',
      loadImplementation: async () => {
        throw new Error('initializer must stay lazy');
      },
    };
    const request = bindNextjsExperiencesRequest(sdk, { consent: true, livePreview });
    expect(request.isPreview).toBe(true);
    const response = { headers: new globalThis.Headers() };
    applyNextjsPrivateResponseCache(response);
    persistNextjsAnonymousId(response, request);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(forRequest.mock.calls[0]![0]?.livePreview).toBe(livePreview);
    request.destroy();
  });
});

it('does not read cookie identity without persistence consent or during preview', () => {
  const sdk = configureNextjsServerExperiences({
    spaceId: 'space',
    environmentId: 'master',
    delivery: { accessToken: 'test' },
  });
  const get = vi.fn(() => {
    throw new Error('cookie must not be read');
  });
  for (const context of [
    { consent: false },
    { consent: { events: true } },
    { consent: true, isPreview: true },
    {
      consent: true,
      livePreview: {
        experienceId: 'home',
        sessionId: 'session',
        loadImplementation: async () => {
          throw new Error();
        },
      },
    },
  ]) {
    for (const profile of [undefined, { id: 'app-approved' }]) {
      const request = bindNextjsExperiencesRequest(sdk, { ...context, cookies: { get }, profile });
      expect(request.profile).toEqual(request.isPreview ? undefined : profile);
      request.destroy();
    }
  }
  expect(get).not.toHaveBeenCalled();
});
