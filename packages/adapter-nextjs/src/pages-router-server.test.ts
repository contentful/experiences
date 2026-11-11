import type { GetServerSidePropsContext } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  RequestRuntime,
  PortableRenderPlan,
  FetchExperienceOptions,
  FetchResolveOptions,
} from '@contentful/experiences-node';
import * as server from './server-request.js';
import { bindNextjsPagesRouterServerExperiences } from './pages-router-server.js';

const scope = { spaceId: 'space', environmentId: 'master' };
const plan: PortableRenderPlan = {
  nodes: [],
  debug: false,
  diagnostics: [],
  metadata: { server: new Error('server metadata') },
};

function setup(extraHeaders: Record<string, string | undefined> = {}) {
  const headers = new Map<string, string | number | readonly string[]>([
    ['Set-Cookie', ['application=kept']],
    ['Vary', 'Accept-Encoding'],
  ]);
  const context = {
    req: {
      url: '/_next/data/build/page.json?q=hello%20world',
      headers: {
        host: 'example.com',
        'x-forwarded-proto': 'https',
        cookie: 'ctfl-opt-aid=incoming',
        ...extraHeaders,
      },
      cookies: {},
    },
    res: {
      getHeader: (name: string) => headers.get(name),
      setHeader: (name: string, value: string | number | readonly string[]) =>
        headers.set(name, value),
    },
    resolvedUrl: '/page?q=hello%20world&_rsc=transport',
    locale: 'de-DE',
  } as unknown as GetServerSidePropsContext;
  const request = {
    isPreview: false,
    canPersistProfile: true,
    profile: { id: 'final' },
    fetchExperience: vi.fn(
      async (_options: FetchExperienceOptions, _resolve: FetchResolveOptions) => plan
    ),
    fetchExperienceForHandoff: vi.fn(async () => ({
      plan,
      handoff: { ...scope, cache: { scope: 'private-request' as const }, profileId: 'evaluated' },
    })),
    destroy: vi.fn(),
  };
  vi.spyOn(server, 'configureNextjsServerExperiences').mockReturnValue(
    scope as ReturnType<typeof server.configureNextjsServerExperiences>
  );
  const bind = vi
    .spyOn(server, 'bindNextjsExperiencesRequest')
    .mockReturnValue(request as unknown as RequestRuntime);
  const descriptor = {
    experienceId: 'home',
    personalization: { events: [{ type: 'page' as const }] },
  };
  const options = {
    origin: 'https://example.com',
    consent: { events: true, persistence: true },
    experience: descriptor,
    resolveOptions: { metadata: { host: true }, debug: false },
  };
  const factory = bindNextjsPagesRouterServerExperiences({
    ...scope,
    delivery: { accessToken: 'test' },
    config: { components: {} },
    consent: { server: options.consent },
    request: { experience: descriptor },
  });
  return { factory, context, headers, request, bind, options, descriptor };
}

afterEach(() => vi.restoreAllMocks());

describe('Pages native server response helper', () => {
  it('composes the raw primary on the same facade before final identity persistence', async () => {
    const { factory, context, headers, request, options, descriptor } = setup();
    const compose = vi.fn(async (facade, primary, receivedContext) => {
      expect(facade).toBe(request);
      expect(primary.plan).toBe(plan);
      expect(receivedContext.requestUrl).toBe('https://example.com/page?q=hello+world');
      expect(receivedContext.headers.get('host')).toBe('example.com');
      expect(receivedContext.cookies.get('ctfl-opt-aid')).toEqual({ value: 'incoming' });
      expect(request.destroy).not.toHaveBeenCalled();
      expect(headers.get('Set-Cookie')).toEqual(['application=kept']);
      request.profile = { id: 'after-composition' };
    });
    const data = await factory.request.loadExperience(context, {
      ...options,
      composeRequest: compose,
    });
    expect(compose).toHaveBeenCalledTimes(1);
    expect(request.fetchExperienceForHandoff).toHaveBeenCalledExactlyOnceWith(
      descriptor,
      { ...options.resolveOptions, config: { components: {} } },
      { routeKey: '/page?q=hello+world' }
    );
    expect(data.plan).toEqual({ ...plan, metadata: {} });
    expect(data).toEqual({
      requestId: expect.any(String),
      routeKey: '/page?q=hello+world',
      experience: { experienceId: 'home' },
      plan: { ...plan, metadata: {} },
      handoff: { ...scope, cache: { scope: 'private-request' }, profileId: 'evaluated' },
    });
    expect(headers.get('Set-Cookie')).toEqual([
      'application=kept',
      'ctfl-opt-aid=after-composition; Max-Age=31536000; Path=/; SameSite=Lax',
    ]);
    expect(headers.get('Cache-Control')).toBe('private, no-store');
    expect(request.destroy).toHaveBeenCalledTimes(1);
  });

  it('returns only routing inputs for marked speculative requests', async () => {
    const { factory, context, bind, options } = setup({ 'next-router-prefetch': '1' });
    expect(await factory.request.loadExperience(context, options)).toEqual({
      requestId: expect.any(String),
      routeKey: '/page?q=hello+world',
      experience: { experienceId: 'home' },
    });
    expect(bind).not.toHaveBeenCalled();
  });

  it('prepares a page and initial events for every native data request', async () => {
    const { factory, context, request, options } = setup({ 'x-nextjs-data': '1' });
    const experience = { experienceId: 'home' };
    const initialEvents = [{ type: 'track' as const, event: 'Action' }];
    const pagePayload = { properties: { title: 'Data navigation' } };
    const data = await factory.request.loadExperience(context, {
      ...options,
      experience,
      initialEvents,
      pagePayload,
    });
    expect(request.fetchExperienceForHandoff).toHaveBeenCalledExactlyOnceWith(
      {
        ...experience,
        personalization: { events: [...initialEvents, { type: 'page', ...pagePayload }] },
      },
      { ...options.resolveOptions, config: { components: {} } },
      { routeKey: '/page?q=hello+world' }
    );
    expect(request.fetchExperience).not.toHaveBeenCalled();
    expect(data.plan).toEqual({ ...plan, metadata: {} });
    expect(data.initialPagePayload).toEqual(pagePayload);
    expect(data.handoff).toEqual({
      ...scope,
      cache: { scope: 'private-request' },
      profileId: 'evaluated',
    });
    expect(request.destroy).toHaveBeenCalledTimes(1);
  });

  it('uses ordinary preview snapshots without synthesizing handoffs', async () => {
    const { factory, context, request, options, headers, descriptor } = setup({
      'x-nextjs-data': '1',
    });
    request.isPreview = true;
    const preview = await factory.request.loadExperience(context, { ...options, isPreview: true });
    expect(preview.plan).toEqual({ ...plan, metadata: {} });
    expect(preview.handoff).toBeUndefined();
    expect(request.fetchExperience).toHaveBeenCalledExactlyOnceWith(descriptor, {
      ...options.resolveOptions,
      config: { components: {} },
    });
    expect(request.fetchExperienceForHandoff).not.toHaveBeenCalled();
    expect(headers.get('Set-Cookie')).toEqual(['application=kept']);
  });

  it('uses the configured locale and resolves server consent with the native context', async () => {
    const { context, bind } = setup();
    const consent = vi.fn(() => ({ events: true, persistence: true }));
    const factory = bindNextjsPagesRouterServerExperiences({
      ...scope,
      delivery: { accessToken: 'server-secret' },
      config: { components: {} },
      locale: 'fr-FR',
      consent: { server: consent },
      request: { experience: { experienceId: 'bound' } },
    });
    await factory.request.loadExperience(context);
    expect(consent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        requestUrl: 'https://example.com/page?q=hello+world',
        routeKey: '/page?q=hello+world',
      })
    );
    expect(bind.mock.calls.at(-1)?.[1]).toMatchObject({
      locale: 'fr-FR',
      consent: { events: true, persistence: true },
    });
  });

  it('preserves explicit page-free intent and converts high-level day expiry at the response boundary', async () => {
    const { factory, context, request, options, headers } = setup({ 'x-nextjs-data': '1' });
    const experience = { experienceId: 'home', personalization: { events: [] } };
    await factory.request.loadExperience(context, {
      ...options,
      experience,
      cookie: { expires: 2.5, secure: true, sameSite: 'strict', path: '/page' },
    });
    expect(request.fetchExperienceForHandoff).toHaveBeenCalledExactlyOnceWith(
      experience,
      { ...options.resolveOptions, config: { components: {} } },
      { routeKey: '/page?q=hello+world' }
    );
    expect(headers.get('Set-Cookie')).toEqual([
      'application=kept',
      'ctfl-opt-aid=final; Max-Age=216000; Path=/page; Secure; SameSite=Strict',
    ]);
  });

  it('propagates thrown preparation and compose errors before cookie publication', async () => {
    const { factory, context, request, options, headers } = setup();
    const error = new TypeError('invalid event schema');
    request.fetchExperienceForHandoff.mockRejectedValue(error);
    await expect(factory.request.loadExperience(context, options)).rejects.toBe(error);
    expect(headers.get('Set-Cookie')).toEqual(['application=kept']);
    request.fetchExperienceForHandoff.mockResolvedValue({
      plan,
      handoff: { ...scope, cache: { scope: 'private-request' }, profileId: 'evaluated' },
    });
    const composeError = new Error('compose failed');
    await expect(
      factory.request.loadExperience(context, {
        ...options,
        composeRequest: () => {
          throw composeError;
        },
      })
    ).rejects.toBe(composeError);
    expect(headers.get('Set-Cookie')).toEqual(['application=kept']);
    expect(request.destroy).toHaveBeenCalledTimes(2);
  });

  it('projects native JSON props before mutating the identity response cookie', async () => {
    const { factory, context, request, options, headers } = setup();
    await expect(
      factory.request.loadExperience(context, {
        ...options,
        metadataKeys: ['server'],
      })
    ).rejects.toThrow('Non-JSON class instance');
    expect(headers.get('Set-Cookie')).toEqual(['application=kept']);
    expect(request.destroy).toHaveBeenCalledTimes(1);
  });
});
