import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ContentfulExperiences, RequestRuntime } from '@contentful/experiences-node';
import { bindExperiencesRequest } from './server-request.js';

function nodeBoundary() {
  const facade = {} as RequestRuntime;
  const forRequest = vi.fn<ContentfulExperiences['forRequest']>(() => facade);
  const sdk = { forRequest } as unknown as ContentfulExperiences;
  return { sdk, forRequest, facade };
}

describe('one explicit Node facade', () => {
  it('binds once and returns the actual facade without decorating methods', () => {
    const { sdk, forRequest, facade } = nodeBoundary();
    const request = bindExperiencesRequest(sdk, {
      consent: { events: false, persistence: true },
      locale: 'de',
      request: {
        url: 'https://example.com/page',
        headers: new globalThis.Headers({ cookie: 'ctfl-opt-aid=existing' }),
      },
      personalizationOptions: { ip: 'host-trusted' },
    });
    expect(forRequest).toHaveBeenCalledTimes(1);
    expectTypeOf(request).toEqualTypeOf<RequestRuntime>();
    expect(request).toBe(facade);
    expect(forRequest.mock.calls[0]![0]).toMatchObject({
      profile: { id: 'existing' },
      locale: 'de',
      consent: { events: false, persistence: true },
      personalizationOptions: { ip: 'host-trusted' },
      eventContext: { page: { path: '/page' } },
    });
  });

  it('treats explicitly empty cookies and effective headers as authoritative', () => {
    const { sdk, forRequest } = nodeBoundary();
    const incoming = {
      url: 'https://example.com',
      headers: new globalThis.Headers({ cookie: 'ctfl-opt-aid=old' }),
      cookies: { get: () => ({ value: 'old' }) },
    };
    for (const extra of [
      { cookies: { get: () => undefined } },
      { headers: new globalThis.Headers() },
    ]) {
      bindExperiencesRequest(sdk, {
        consent: { persistence: true },
        request: incoming,
        ...extra,
      });
      expect(forRequest.mock.calls.at(-1)![0]?.profile).toBeUndefined();
    }
    bindExperiencesRequest(sdk, {
      consent: false,
      request: incoming,
      profile: { id: 'explicit' },
    });
    expect(forRequest.mock.calls.at(-1)![0]?.profile).toEqual({ id: 'explicit' });
  });

  it('requires consent before binding and forwards preview policy unchanged', () => {
    const { sdk, forRequest } = nodeBoundary();
    expect(() => bindExperiencesRequest(sdk, { consent: undefined! })).toThrow('consent');
    expect(forRequest).not.toHaveBeenCalled();
    const livePreview = {
      experienceId: 'home',
      sessionId: 'session',
      loadImplementation: async () => {
        throw new Error('initializer must stay lazy');
      },
    };
    bindExperiencesRequest(sdk, { consent: true, livePreview });
    expect(forRequest).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ livePreview, profile: undefined })
    );
  });
});

it('does not read cookie identity without persistence consent or during preview', () => {
  const { sdk, forRequest } = nodeBoundary();
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
      bindExperiencesRequest(sdk, { ...context, cookies: { get }, profile });
      expect(forRequest.mock.calls.at(-1)![0]?.profile).toEqual(
        'isPreview' in context || 'livePreview' in context ? undefined : profile
      );
    }
  }
  expect(get).not.toHaveBeenCalled();
});
