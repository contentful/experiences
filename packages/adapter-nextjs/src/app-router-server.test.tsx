import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperienceFetchError } from '@contentful/experiences-node';
import { ServerExperienceRenderer } from '@contentful/experiences-react/server';
import { NextRequest } from 'next/server.js';
import { AppRouterRequestRoot, AppRouterRequestAnalyticsRoot } from './app-router-client.js';
import { bindAppRouterServerExperiences } from './app-router-server.js';
import { ServerPreviewRefresh } from './server-preview-refresh.js';
import type { PreviewConfig } from './preview.js';

const doubles = vi.hoisted(() => ({
  headers: vi.fn(),
  cookies: vi.fn(),
  bind: vi.fn(),
  fetch: vi.fn(),
  transfer: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('next/headers.js', () => ({ headers: doubles.headers, cookies: doubles.cookies }));
// React's server dispatcher normally supplies this render-local memoization.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: (load: (...args: unknown[]) => unknown) => {
    const entries: { args: unknown[]; value: unknown }[] = [];
    return (...args: unknown[]) => {
      const cached = entries.find(
        (entry) =>
          entry.args.length === args.length &&
          entry.args.every((arg, index) => Object.is(arg, args[index]))
      );
      if (cached) return cached.value;
      const value = load(...args);
      entries.push({ args, value });
      return value;
    };
  },
}));
vi.mock('./server-request.js', () => ({
  configureServerExperiences: () => ({ spaceId: 'space', environmentId: 'master' }),
  bindExperiencesRequest: doubles.bind,
}));

const plan = { nodes: [], diagnostics: [], metadata: {}, debug: false };
const handoff = {
  spaceId: 'space',
  environmentId: 'master',
  cache: { scope: 'private-request' as const },
};
const config = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'secret' },
  config: { components: {} },
  consent: { server: { events: true, persistence: true } },
  request: { experience: { experienceId: 'home' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  doubles.headers.mockResolvedValue(
    new globalThis.Headers({ 'x-ctfl-exp-request-url': 'https://example.com/?q=a%20b' })
  );
  doubles.cookies.mockResolvedValue({ get: () => undefined });
  doubles.fetch.mockResolvedValue(plan);
  doubles.transfer.mockResolvedValue({ plan, handoff });
  doubles.bind.mockImplementation((_sdk, options) => ({
    isPreview: options.isPreview,
    fetchExperience: doubles.fetch,
    fetchExperienceForHandoff: doubles.transfer,
    destroy: doubles.destroy,
  }));
});

describe('App Router request family', () => {
  it('wires active managed preview from the primary and projects only browser options', async () => {
    doubles.headers.mockResolvedValue(
      new globalThis.Headers({
        rsc: '1',
        'x-ctfl-exp-request-url': 'https://example.com/?preview_session_id=session',
      })
    );
    const createClient = vi.fn<NonNullable<PreviewConfig['createClient']>>();
    const binding = bindAppRouterServerExperiences({
      ...config,
      browser: { delivery: { accessToken: 'browser-token' } },
      preview: {
        accessToken: 'preview',
        enabled: true,
        sessionHost: 'https://preview.example.com',
        resourceResolution: 'resolved',
        createClient,
      },
    });
    const root = await binding.request.ExperiencesRoot({});
    expect(root.props.result?.preview).toEqual({
      enabled: true,
      sessionHost: 'https://preview.example.com',
      resourceResolution: 'resolved',
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(doubles.bind.mock.calls[0]![1].preview).toEqual({
      sessionId: 'session',
      sessionHost: 'https://preview.example.com',
      resourceResolution: 'resolved',
    });
    expect(doubles.bind.mock.calls[0]![1].isPreview).toBe(true);
    expect(doubles.fetch).toHaveBeenCalledExactlyOnceWith(config.request.experience, {
      config: config.config,
    });
    expect(doubles.transfer).not.toHaveBeenCalled();
  });

  it('keeps middleware setup independent of content selection and client creation', async () => {
    const experience = vi.fn(() => ({ experienceId: 'home' }));
    const unrelated = vi.fn(() => {
      throw new Error('request policy must not run in middleware');
    });
    const createClient = vi.fn();
    for (const [enabled, search] of [
      [false, '?preview_session_id=session'],
      [true, ''],
      [true, '?preview_session_id=session'],
    ] as const) {
      const binding = bindAppRouterServerExperiences({
        ...config,
        preview: { accessToken: 'preview', enabled, createClient },
        request: {
          experience,
          resolveOptions: unrelated,
          pagePayload: unrelated,
          initialEvents: unrelated,
        },
      });
      await binding.requestHandler(new NextRequest('https://example.com/' + search));
      expect(doubles.bind.mock.calls.at(-1)![1].preview).toEqual(
        enabled && search ? expect.objectContaining({ sessionId: 'session' }) : undefined
      );
      expect(experience).not.toHaveBeenCalled();
    }
    expect(unrelated).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('explicit/static rendering reads no framework request state', async () => {
    const binding = bindAppRouterServerExperiences(config);
    const rendered = await binding.Experience({ experience: plan });
    expect(rendered.props.experience).toBe(plan);
    expect(doubles.headers).not.toHaveBeenCalled();
    expect(doubles.cookies).not.toHaveBeenCalled();
    expect(doubles.bind).not.toHaveBeenCalled();
  });

  it('shares request evaluation with the server renderer while retaining server metadata', async () => {
    const client = () => null;
    const raw = { ...plan, metadata: { server: new Error('server metadata') } };
    doubles.transfer.mockResolvedValue({ plan: raw, handoff });
    const composeRequest = vi.fn((request, primary, context) => {
      expect(request).toBe(doubles.bind.mock.results[0]!.value);
      expect(primary.plan).toBe(raw);
      expect(primary.handoff).toBe(handoff);
      expect(context.routeKey).toBe('/?q=a+b');
      expect(doubles.destroy).not.toHaveBeenCalled();
    });
    const binding = bindAppRouterServerExperiences(
      { ...config, request: { ...config.request, composeRequest } },
      { request: { ExperiencesRoot: client } }
    );
    const element = await binding.request.Experience({
      as: 'section',
      rootProps: { id: 'content' },
    });
    expect(element?.type).toBe(ServerExperienceRenderer);
    expect(element?.props).toMatchObject({
      experience: raw,
      as: 'section',
      rootProps: { id: 'content' },
    });
    expect(doubles.headers).toHaveBeenCalledTimes(1);
    expect(doubles.cookies).toHaveBeenCalledTimes(1);
    expect(doubles.transfer).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ experienceId: 'home' }),
      { config: config.config },
      { routeKey: '/?q=a+b' }
    );
    expect(doubles.fetch).not.toHaveBeenCalled();
    expect(doubles.bind.mock.calls[0]![1].preflight).toBe(true);
    expect(doubles.destroy).toHaveBeenCalledTimes(1);
  });

  it('uses shared cookie attributes and carries the resolved page payload to both roots', async () => {
    const pagePayload = { properties: { title: 'Host page', path: '/custom' } };
    const resolvePage = vi.fn(() => pagePayload);
    doubles.transfer.mockResolvedValue({
      error: new ExperienceFetchError('private delivery error', {
        spaceId: 'space',
        experienceId: 'home',
      }),
      handoff,
    });
    const client = () => null;
    const binding = bindAppRouterServerExperiences(
      {
        ...config,
        cookie: { expires: 7, path: '/scope' },
        request: { ...config.request, pagePayload: resolvePage },
      },
      {
        request: { ExperiencesRoot: client, ExperiencesAnalyticsRoot: client },
      }
    );
    const result = await binding.request.loadExperience();
    expect(result.initialPagePayload).toBe(pagePayload);
    expect(doubles.bind.mock.calls[0]![1]).not.toHaveProperty('anonymousIdCookieName');
    expect(doubles.transfer.mock.calls[0]![0].personalization.events).toEqual([
      { type: 'page', ...pagePayload },
    ]);
    const root = await binding.request.ExperiencesRoot({});
    const analyticsRoot = await binding.request.ExperiencesAnalyticsRoot({});
    expect(root.props.result).toEqual(analyticsRoot.props.result);
    expect(root.props.result).toMatchObject({
      requestId: result.requestId,
      initialPagePayload: pagePayload,
      handoff,
      contentError: 'Experience content unavailable.',
    });
    expect(root.props.result).not.toHaveProperty('error');
    expect(doubles.transfer).toHaveBeenCalledTimes(1);
    expect(resolvePage).toHaveBeenCalledTimes(1);
  });

  it('keeps callbacks on the explicit server renderer', async () => {
    const renderError = () => null;
    const renderUnknown = () => null;
    const mode = vi.fn(() => 'ssr' as const);
    const binding = bindAppRouterServerExperiences({
      ...config,
      request: { ...config.request, mode },
    });
    const rendered = await binding.Experience({ experience: plan, renderError, renderUnknown });
    expect(rendered.props).toMatchObject({ renderError, renderUnknown });
    const requestRendered = await binding.request.Experience({ renderError, renderUnknown });
    expect(requestRendered?.props).toMatchObject({ renderError, renderUnknown });
    expect((await binding.request.loadExperience()).initialPageOwner).toBe('server');
    expect(mode).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ routeKey: '/?q=a+b' }));
    expect(doubles.bind.mock.calls[0]![1].preflight).toBe(false);
    expect(doubles.fetch).toHaveBeenCalledOnce();
    expect(doubles.transfer).not.toHaveBeenCalled();
  });

  it.each([
    { headers: new globalThis.Headers({ 'next-router-prefetch': '1' }), injected: false },
    { headers: new globalThis.Headers({ 'next-router-prefetch': '1' }), injected: true },
    { headers: new globalThis.Headers({ rsc: '1', purpose: 'prefetch' }), injected: false },
    { headers: new globalThis.Headers({ rsc: '1', purpose: 'prefetch' }), injected: true },
  ])(
    'does no primary evaluation or composition for speculative requests ($injected, $headers)',
    async ({ headers, injected }) => {
      const incoming = new globalThis.Headers(headers);
      incoming.set('x-ctfl-exp-request-url', 'https://example.com/?q=a%20b');
      doubles.headers.mockResolvedValue(incoming);
      const composeRequest = vi.fn();
      const ClientExperience = vi.fn(() => null);
      const binding = bindAppRouterServerExperiences(
        {
          ...config,
          request: { ...config.request, composeRequest },
        },
        { request: injected ? { Experience: ClientExperience } : {} }
      );
      const result = await binding.request.loadExperience();
      expect(await binding.request.Experience({})).toBeNull();
      expect(ClientExperience).not.toHaveBeenCalled();
      expect(result.plan).toBeUndefined();
      expect(result.handoff).toBeUndefined();
      expect(doubles.bind).not.toHaveBeenCalled();
      expect(composeRequest).not.toHaveBeenCalled();
    }
  );

  it('evaluates RSC content once with the destination page and supplies its prepared handoff', async () => {
    doubles.headers.mockResolvedValue(
      new globalThis.Headers({ rsc: '1', 'x-ctfl-exp-request-url': 'https://example.com/?q=a%20b' })
    );
    const client = () => null;
    const composeRequest = vi.fn();
    const initialEvents = vi.fn();
    const pagePayload = { properties: { title: 'Server navigation' } };
    const binding = bindAppRouterServerExperiences(
      {
        ...config,
        request: { ...config.request, composeRequest, initialEvents, pagePayload },
      },
      { request: { ExperiencesRoot: client, ExperiencesAnalyticsRoot: client } }
    );
    const rendered = await binding.request.Experience({});
    expect(rendered?.props.experience).toBe(plan);
    const result = await binding.request.loadExperience();
    const analytics = await binding.request.ExperiencesAnalyticsRoot({});
    expect(analytics.props.result).not.toHaveProperty('plan');
    expect(analytics.props.result).not.toHaveProperty('error');
    expect(result.handoff).toEqual(handoff);
    expect(result.plan).toBe(plan);
    expect(result.initialPagePayload).toEqual(pagePayload);
    expect(doubles.transfer).toHaveBeenCalledExactlyOnceWith(
      {
        ...config.request.experience,
        personalization: { events: [{ type: 'page', ...pagePayload }] },
      },
      {
        config: config.config,
      },
      { routeKey: '/?q=a+b' }
    );
    expect(doubles.fetch).not.toHaveBeenCalled();
    expect(initialEvents).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ routeKey: '/?q=a+b' })
    );
    expect(composeRequest).toHaveBeenCalledExactlyOnceWith(
      doubles.bind.mock.results[0]!.value,
      expect.objectContaining({ plan, handoff, initialPagePayload: pagePayload }),
      expect.objectContaining({ routeKey: '/?q=a+b' })
    );
    expect(doubles.destroy).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('shares the primary (injected=%s)', async (injected) => {
    const ClientExperience = () => null;
    const browser = { delivery: { host: 'https://example.com/api/delivery' } };
    const cookie = { expires: 7, path: '/scope' };
    const binding = bindAppRouterServerExperiences(
      {
        ...config,
        browser,
        cookie,
        consent: { ...config.consent, clientDefaults: { consent: false } },
      },
      { request: injected ? { Experience: ClientExperience } : {} }
    );
    const root = await binding.request.ExperiencesRoot({ children: 'Content' });
    const presentation = await binding.request.Experience({ as: 'section' });
    const analytics = await binding.request.ExperiencesAnalyticsRoot({});
    expect(root.type).toBe(AppRouterRequestRoot);
    expect(analytics.type).toBe(AppRouterRequestAnalyticsRoot);
    expect(root.props).toMatchObject({
      spaceId: 'space',
      environmentId: 'master',
      browser,
      cookie,
      defaults: { consent: false },
    });
    expect(root.props).not.toHaveProperty('delivery');
    expect(presentation?.type).toBe(injected ? ClientExperience : ServerExperienceRenderer);
    expect(presentation?.props.as).toBe('section');
    if (injected) expect(presentation?.props.result).toBe(root.props.result);
    else expect(presentation?.props.experience).toEqual(root.props.result?.plan);
    expect(analytics.props.result).not.toHaveProperty('plan');
    if (injected) expect(root.props.children).toBe('Content');
    else
      expect(root.props.children).toMatchObject({
        props: {
          children: [{ type: ServerPreviewRefresh, props: {} }, 'Content'],
        },
      });
    expect(doubles.transfer).toHaveBeenCalledTimes(1);
    expect(doubles.destroy).toHaveBeenCalledTimes(1);
    expect((await binding.request.loadExperience()).plan).toBe(plan);
  });

  it('allows each root override independently and requires browser config only for a built-in root', async () => {
    const client = () => null;
    const binding = bindAppRouterServerExperiences(config, {
      request: { ExperiencesAnalyticsRoot: client },
    });
    const root = await binding.request.ExperiencesAnalyticsRoot({ children: 'Server content' });
    expect(root.type).toBe(client);
    expect(root.props.children).toBe('Server content');
    await expect(binding.request.ExperiencesRoot({})).rejects.toThrow(
      'requires browser configuration'
    );
  });

  it('projects browser credentials and inherited props into registered client roots', async () => {
    const client = () => null;
    const browser = { delivery: { accessToken: 'browser-token' } };
    const defaults = { consent: false };
    const cookie = { path: '/scope' };
    const binding = bindAppRouterServerExperiences(
      {
        ...config,
        browser,
        locale: 'de-DE',
        cookie,
        consent: { ...config.consent, clientDefaults: defaults },
      },
      { request: { ExperiencesRoot: client, ExperiencesAnalyticsRoot: client } }
    );
    for (const Root of [
      binding.request.ExperiencesRoot,
      binding.request.ExperiencesAnalyticsRoot,
    ]) {
      const root = await Root({});
      expect(root.props).toMatchObject({
        ...browser,
        spaceId: 'space',
        environmentId: 'master',
        locale: 'de-DE',
        defaults,
        cookie,
      });
      expect((root.props as { delivery?: unknown }).delivery).not.toBe(browser.delivery);
      expect(root.props).not.toHaveProperty('browser');
      expect(JSON.stringify(root.props)).not.toContain('secret');
    }
  });

  it('rejects functions in explicit browser config without projecting server credentials', async () => {
    const browser = { delivery: { accessToken: (() => 'browser-token') as unknown as string } };
    const binding = bindAppRouterServerExperiences({ ...config, browser });
    await expect(binding.request.ExperiencesRoot({})).rejects.toThrow('Non-JSON value');
  });

  it('preserves producer-returned content errors and their usable handoff', async () => {
    const error = new Error('resolver failed');
    doubles.transfer.mockResolvedValue({ error, handoff });
    const ClientExperience = () => null;
    const binding = bindAppRouterServerExperiences(config, {
      request: { Experience: ClientExperience },
    });
    const result = await binding.request.loadExperience();
    expect(result.error).toBe(error);
    expect(result.handoff).toEqual(handoff);
    expect(result.contentError).toBe('Experience content unavailable.');
    const presentation = await binding.request.Experience({});
    expect(presentation?.type).toBe(ClientExperience);
    expect(presentation?.props.result).toMatchObject({
      requestId: result.requestId,
      handoff,
      contentError: result.contentError,
    });
    expect(presentation?.props.result).not.toHaveProperty('error');
  });

  it.each([
    new TypeError('invalid replay'),
    Object.assign(new Error('redirect'), { digest: 'NEXT_REDIRECT' }),
  ])(
    'propagates thrown preparation/control-flow failure %s and destroys the facade',
    async (error) => {
      doubles.transfer.mockRejectedValue(error);
      const binding = bindAppRouterServerExperiences(config);
      await expect(binding.request.loadExperience()).rejects.toBe(error);
      expect(doubles.destroy).toHaveBeenCalledTimes(1);
    }
  );

  it('propagates composition exceptions without publishing a browser result', async () => {
    const error = new Error('host composition');
    const binding = bindAppRouterServerExperiences({
      ...config,
      request: {
        ...config.request,
        composeRequest: () => {
          throw error;
        },
      },
    });
    await expect(binding.request.loadExperience()).rejects.toBe(error);
    expect(doubles.destroy).toHaveBeenCalledTimes(1);
  });
});
