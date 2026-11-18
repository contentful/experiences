import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerBindingOptions } from './server-types.js';

const doubles = vi.hoisted(() => ({
  real: false,
  facades: [] as Record<string, unknown>[],
  fetch: vi.fn(),
  transfer: vi.fn(),
}));
vi.mock('@contentful/experiences-node', async (original) => {
  const actual = await original<typeof import('@contentful/experiences-node')>();
  return {
    ...actual,
    ContentfulExperiences: class {
      constructor(config: import('@contentful/experiences-node').Config) {
        if (doubles.real) return new actual.ContentfulExperiences(config) as never;
      }
      forRequest(context: Record<string, unknown>) {
        const facade = {
          ...context,
          isPreview: !!context.preview,
          canPersistProfile: (context.consent as { persistence: boolean }).persistence,
          destroy: vi.fn(),
          fetchExperience: (descriptor: unknown, resolve: unknown) =>
            doubles.fetch(descriptor, resolve, facade),
          fetchExperienceForHandoff: (descriptor: unknown, resolve: unknown, replay: unknown) =>
            doubles.transfer(descriptor, resolve, replay, facade),
        };
        doubles.facades.push(facade);
        return facade;
      }
    },
  };
});
import { createServerOperation } from './server-operation.js';

const plan = { experienceId: 'home', nodes: [], metadata: {}, debug: false, diagnostics: [] };
function event(cookie?: string) {
  return {
    url: new URL('https://example.com/document'),
    request: new globalThis.Request('https://example.com/document'),
    cookies: {
      get: vi.fn((name: string) => (name === 'ctfl-opt-aid' ? cookie : undefined)),
      set: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as RequestEvent;
}
function options(overrides: Partial<ServerBindingOptions> = {}): ServerBindingOptions {
  return {
    spaceId: 'space',
    environmentId: 'master',
    delivery: { accessToken: 'private-token' },
    config: { components: {} },
    endpoint: '/_exo',
    consent: { server: true },
    request: { mode: 'ssr', authorizeExperience: () => true },
    ...overrides,
  };
}
const input = {
  operation: 'prepare' as const,
  routeKey: '/home?tag=a&tag=b',
  experience: { experienceId: 'home' },
};

describe('Kit owned server operation', () => {
  beforeEach(() => {
    doubles.real = false;
    doubles.facades.length = 0;
    doubles.fetch.mockReset().mockResolvedValue(plan);
    doubles.transfer.mockReset().mockResolvedValue({
      plan,
      handoff: { spaceId: 'space', environmentId: 'master', cache: { scope: 'private-request' } },
    });
  });

  it('isolates concurrent request identity, locale, context and consent and returns SSR ownership', async () => {
    const run = createServerOperation(options());
    const [one, two] = await Promise.all([
      run(
        event('visitor-a'),
        { ...input, locale: 'fr-FR', eventContext: { userAgent: 'a' } },
        { document: true }
      ),
      run(
        event('visitor-b'),
        { ...input, locale: 'de-DE', consent: false, eventContext: { userAgent: 'b' } },
        { document: true }
      ),
    ]);
    expect(one.initialPageOwner).toBe('server');
    expect(two.initialPageOwner).toBe('server');
    expect(one.handoff?.profileId).toBe('visitor-a');
    expect(two.handoff?.profileId).toBeUndefined();
    expect(
      doubles.facades.map((value) => [
        value.locale,
        value.profile,
        value.eventContext,
        value.consent,
      ])
    ).toEqual([
      ['fr-FR', { id: 'visitor-a' }, { userAgent: 'a' }, { events: true, persistence: true }],
      ['de-DE', undefined, { userAgent: 'b' }, { events: false, persistence: false }],
    ]);
    for (const facade of doubles.facades) expect(facade.destroy).toHaveBeenCalled();
  });

  it('prepares enhanced navigation as hybrid without cookies or document callback', async () => {
    const onResult = vi.fn();
    const requestEvent = event('cookie-visitor');
    const run = createServerOperation(
      options({ request: { mode: 'ssr', authorizeExperience: () => true, onResult } })
    );
    const result = await run(
      requestEvent,
      { ...input, profileId: 'browser-visitor' },
      { document: false }
    );
    expect(result.handoff).toBeDefined();
    expect(result.initialPageOwner).toBeUndefined();
    expect(doubles.facades[0]?.profile).toEqual({ id: 'browser-visitor' });
    expect(doubles.transfer.mock.calls[0]?.[2]).toEqual({ routeKey: input.routeKey });
    expect(requestEvent.cookies.set).not.toHaveBeenCalled();
    expect(requestEvent.cookies.delete).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
  });

  it.each([{ events: [] }, { events: [{ type: 'track', event: 'Action', properties: {} }] }])(
    'preserves authoritative descriptor event intent $events',
    async ({ events }) => {
      const run = createServerOperation(options());
      await run(
        event(),
        {
          ...input,
          experience: { experienceId: 'home', personalization: { events: events as never } },
        },
        { document: true }
      );
      expect(doubles.fetch.mock.calls[0]?.[0].personalization.events).toEqual(events);
    }
  );

  it('reads without visit intent, composition, ownership, replay or identity writes', async () => {
    const hook = vi.fn();
    const requestEvent = event();
    const run = createServerOperation(
      options({
        request: {
          mode: 'hybrid',
          authorizeExperience: () => true,
          initialEvents: hook,
          pagePayload: hook,
          composeRequest: hook,
          onResult: hook,
        },
      })
    );
    const result = await run(
      requestEvent,
      {
        ...input,
        operation: 'read',
        experience: { experienceId: 'home', personalization: { events: [] } },
      },
      { document: true }
    );
    expect(result).toMatchObject({ eventFree: true, plan });
    expect(result.handoff).toBeUndefined();
    expect(result.initialPageOwner).toBeUndefined();
    expect(doubles.fetch.mock.calls[0]?.[0]).toEqual({ experienceId: 'home' });
    expect(hook).not.toHaveBeenCalled();
    expect(requestEvent.cookies.delete).not.toHaveBeenCalled();
  });

  it('activates preview from candidate URL and excludes visitor transfer and cookie mutation', async () => {
    const requestEvent = event('visitor');
    const run = createServerOperation(options({ preview: { accessToken: 'preview-private' } }));
    const result = await run(
      requestEvent,
      { ...input, routeKey: '/home?preview_session_id=session' },
      { document: true }
    );
    expect(doubles.facades[0]?.preview).toEqual({ sessionId: 'session' });
    expect(result.handoff).toBeUndefined();
    expect(result.initialPageOwner).toBeUndefined();
    expect(requestEvent.url.pathname).toBe('/document');
    expect(requestEvent.cookies.set).not.toHaveBeenCalled();
    expect(requestEvent.cookies.delete).not.toHaveBeenCalled();
  });

  it('cleans up application and projection failures while allowing application errors to propagate', async () => {
    const failure = new Error('application failure');
    const run = createServerOperation(
      options({
        request: {
          mode: 'ssr',
          authorizeExperience: () => true,
          onResult: () => {
            throw failure;
          },
        },
      })
    );
    await expect(run(event(), input, { document: true })).rejects.toBe(failure);
    expect(doubles.facades[0]?.destroy).toHaveBeenCalled();
    doubles.fetch.mockRejectedValueOnce(failure);
    await expect(run(event(), input, { document: true })).rejects.toBe(failure);
    expect(doubles.facades[1]?.destroy).toHaveBeenCalled();
    doubles.fetch.mockResolvedValueOnce({ ...plan, metadata: { invalid: () => {} } });
    const invalid = createServerOperation(
      options({
        request: { mode: 'ssr', authorizeExperience: () => true, metadataKeys: ['invalid'] },
      })
    );
    await expect(invalid(event(), input, { document: true })).rejects.toThrow('Non-JSON');
    expect(doubles.facades[2]?.destroy).toHaveBeenCalled();
  });

  it('classifies missing content safely and retains server ownership and final cookies before cleanup', async () => {
    doubles.fetch.mockRejectedValue({ statusCode: 404, body: 'secret response' });
    const requestEvent = event('visitor');
    const onResult = vi.fn((_: RequestEvent, value) => {
      expect(value.notFound).toBe(true);
      expect(requestEvent.cookies.set).toHaveBeenCalled();
    });
    const run = createServerOperation(
      options({ request: { mode: 'ssr', authorizeExperience: () => true, onResult } })
    );
    const result = await run(requestEvent, input, { document: true });
    expect(result).toMatchObject({
      notFound: true,
      initialPageOwner: 'server',
      contentErrorKind: 'not-found',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(requestEvent.cookies.set).toHaveBeenCalledWith(
      'ctfl-opt-aid',
      'visitor',
      expect.objectContaining({ path: '/', sameSite: 'lax', httpOnly: false })
    );
    expect(doubles.facades[0]?.destroy).toHaveBeenCalled();
  });

  it('refuses prerender, invalid selectors and unauthorized content before source work', async () => {
    const run = createServerOperation(
      options({ request: { mode: 'ssr', authorizeExperience: () => false } })
    );
    await expect(run(event(), input, { document: true, prerender: true })).rejects.toThrow(
      'prerender'
    );
    await expect(
      run(event(), { ...input, experience: { experienceId: '' } }, { document: true })
    ).rejects.toThrow();
    expect((await run(event(), input, { document: false })).contentErrorKind).toBe('authorization');
    expect(doubles.facades).toHaveLength(0);
  });

  it('does not infer consent from cookies and expires identity when persistence is denied', async () => {
    const requestEvent = event('stored-visitor');
    const result = await createServerOperation(options({ consent: { server: false } }))(
      requestEvent,
      input,
      { document: true }
    );
    expect(doubles.facades[0]?.profile).toBeUndefined();
    expect(doubles.facades[0]?.consent).toEqual({ events: false, persistence: false });
    expect(result.initialPageOwner).toBe('server');
    expect(requestEvent.cookies.set).not.toHaveBeenCalled();
    expect(requestEvent.cookies.delete).toHaveBeenCalledWith(
      'ctfl-opt-aid',
      expect.objectContaining({ path: '/', httpOnly: false })
    );
  });

  it('builds default page metadata from the candidate route while retaining repeated query values', async () => {
    await createServerOperation(options())(event(), input, { document: true });
    expect(doubles.fetch.mock.calls[0]?.[0].personalization.events).toEqual([
      {
        type: 'page',
        properties: {
          path: '/home',
          url: 'https://example.com/home?tag=a&tag=b',
          search: '?tag=a&tag=b',
          query: { tag: ['a', 'b'] },
          referrer: '',
        },
      },
    ]);
  });

  it('propagates application errors returned by hybrid resolution and retires the facade', async () => {
    const failure = new Error('resolver failed');
    doubles.transfer.mockResolvedValue({ error: failure });
    await expect(
      createServerOperation(options())(event(), input, { document: false })
    ).rejects.toBe(failure);
    expect(doubles.facades[0]?.destroy).toHaveBeenCalled();
  });

  it('keeps reads noncommitting on the real Node-to-Delivery wire with browser continuity', async () => {
    doubles.real = true;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(
        async () =>
          new globalThis.Response(
            JSON.stringify({ sys: { id: 'home', type: 'Experience' }, nodes: [], errors: [] }),
            { headers: { 'content-type': 'application/json' } }
          )
      );
    const run = createServerOperation(
      options({ delivery: { accessToken: 'private-token', fetch } })
    );
    const result = await run(
      event(),
      { ...input, operation: 'read', profileId: 'visitor' },
      { document: false }
    );
    expect(result.plan?.nodes).toEqual([]);
    const [url, init] = fetch.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(String(url)).toContain('home');
    expect(body.extensions.personalization).toMatchObject({
      profileId: 'visitor',
      preflight: true,
    });
    expect(body.extensions.personalization.events).toBeUndefined();
  });

  it('keeps primary transfer identity coherent when application composition changes the final cookie identity', async () => {
    const requestEvent = event('primary-visitor');
    const run = createServerOperation(
      options({
        request: {
          mode: 'ssr',
          authorizeExperience: () => true,
          composeRequest: (request) => {
            (request as unknown as { profile: { id: string } }).profile = { id: 'later-visitor' };
          },
        },
      })
    );
    const result = await run(requestEvent, input, { document: true });
    expect(result.handoff?.profileId).toBe('primary-visitor');
    expect(requestEvent.cookies.set).toHaveBeenCalledWith(
      'ctfl-opt-aid',
      'later-visitor',
      expect.anything()
    );
  });

  it.each(['resolve-options', 'composition', 'cookie'] as const)(
    'retires request ownership after %s application failure',
    async (stage) => {
      const failure = new Error(stage);
      const requestEvent = event('visitor');
      if (stage === 'cookie')
        vi.mocked(requestEvent.cookies.set).mockImplementation(() => {
          throw failure;
        });
      const run = createServerOperation(
        options({
          request: {
            mode: 'ssr',
            authorizeExperience: () => true,
            ...(stage === 'resolve-options'
              ? {
                  resolveOptions: () => {
                    throw failure;
                  },
                }
              : {}),
            ...(stage === 'composition'
              ? {
                  composeRequest: () => {
                    throw failure;
                  },
                }
              : {}),
          },
        })
      );
      await expect(run(requestEvent, input, { document: true })).rejects.toBe(failure);
      expect(doubles.facades[0]?.destroy).toHaveBeenCalled();
    }
  );

  it('lets authorization inspect untrusted options and protects configured metadata and debug values', async () => {
    const authorizeExperience = vi.fn<ServerBindingOptions['request']['authorizeExperience']>(
      () => true
    );
    const run = createServerOperation(
      options({
        request: {
          mode: 'ssr',
          authorizeExperience,
          resolveOptions: { metadata: { tenant: 'trusted' }, debug: false },
        },
      })
    );
    const resolveOptions = { metadata: { tenant: 'attacker', display: 'visible' }, debug: true };
    await run(event(), { ...input, resolveOptions }, { document: false });
    expect(authorizeExperience.mock.calls[0]?.[2]).toMatchObject({ resolveOptions });
    expect(doubles.transfer.mock.calls[0]?.[1]).toMatchObject({
      metadata: { tenant: 'trusted', display: 'visible' },
      debug: false,
    });
  });

  it('keeps the serialized result detached from application callback mutations', async () => {
    const run = createServerOperation(
      options({
        request: {
          mode: 'ssr',
          authorizeExperience: () => true,
          onResult: (_event, result) => {
            (result.experience as { experienceId: string }).experienceId = 'changed';
            (result as { contentError?: string }).contentError = 'injected';
          },
        },
      })
    );
    const result = await run(event(), input, { document: true });
    expect(result.experience).toEqual({ experienceId: 'home' });
    expect(result.contentError).toBeUndefined();
  });
});
