import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperienceFetchError } from '@contentful/experiences-node';
import {
  NextjsAppRouterRequestRoot,
  NextjsAppRouterRequestAnalyticsRoot,
} from './app-router-client.js';
import { bindNextjsAppRouterServerExperiences } from './app-router-server.js';

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
  cache: (load: (...args: unknown[]) => Promise<unknown>) => {
    let pending: Promise<unknown> | undefined;
    return (...args: unknown[]) => (pending ??= load(...args));
  },
}));
vi.mock('./server-request.js', () => ({
  configureNextjsServerExperiences: () => ({ spaceId: 'space', environmentId: 'master' }),
  bindNextjsExperiencesRequest: doubles.bind,
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
  it('explicit/static rendering reads no framework request state', async () => {
    const binding = bindNextjsAppRouterServerExperiences(config);
    const rendered = await binding.Experience({ experience: plan });
    expect(rendered.props.experience).toBe(plan);
    expect(doubles.headers).not.toHaveBeenCalled();
    expect(doubles.cookies).not.toHaveBeenCalled();
    expect(doubles.bind).not.toHaveBeenCalled();
  });

  it('reads opt-in request headers/cookies and supplies the actual transfer plan to the client presentation', async () => {
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
    const binding = bindNextjsAppRouterServerExperiences(
      { ...config, request: { ...config.request, composeRequest } },
      { request: { ExperiencesRoot: client, Experience: client } }
    );
    const element = await binding.request.Experience({
      as: 'section',
      rootProps: { id: 'content' },
    });
    expect(element?.props).toMatchObject({
      result: { experience: { experienceId: 'home' }, plan },
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
    const binding = bindNextjsAppRouterServerExperiences(
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
    const binding = bindNextjsAppRouterServerExperiences(config);
    const rendered = await binding.Experience({ experience: plan, renderError, renderUnknown });
    expect(rendered.props).toMatchObject({ renderError, renderUnknown });
  });

  it.each([
    new globalThis.Headers({ 'next-router-prefetch': '1' }),
    new globalThis.Headers({ rsc: '1' }),
  ])('does no hybrid initialization/content work for speculative/RSC requests', async (headers) => {
    const incoming = new globalThis.Headers(headers);
    incoming.set('x-ctfl-exp-request-url', 'https://example.com/?q=a%20b');
    doubles.headers.mockResolvedValue(incoming);
    const result = await bindNextjsAppRouterServerExperiences(config).request.loadExperience();
    expect(result.plan).toBeUndefined();
    expect(result.handoff).toBeUndefined();
    expect(doubles.bind).not.toHaveBeenCalled();
  });

  it('uses ordinary server-only RSC fetch without page intent or a synthesized transfer', async () => {
    doubles.headers.mockResolvedValue(
      new globalThis.Headers({ rsc: '1', 'x-ctfl-exp-request-url': 'https://example.com/?q=a%20b' })
    );
    const client = () => null;
    const binding = bindNextjsAppRouterServerExperiences(
      {
        ...config,
        request: { ...config.request, hydration: 'server-only' },
      },
      { request: { ExperiencesRoot: client, ExperiencesAnalyticsRoot: client } }
    );
    const rendered = await binding.request.Experience({});
    expect(rendered?.props.experience).toBe(plan);
    const result = await binding.request.loadExperience();
    const analytics = await binding.request.ExperiencesAnalyticsRoot({});
    expect(analytics.props.result).not.toHaveProperty('plan');
    expect(analytics.props.result).not.toHaveProperty('error');
    expect(result.handoff).toBeUndefined();
    expect(doubles.transfer).not.toHaveBeenCalled();
    expect(doubles.fetch.mock.calls[0]![0].personalization?.events).toBeUndefined();
    expect(doubles.destroy).toHaveBeenCalledTimes(1);
  });

  it('uses the built-in root with explicit browser transport and shares the primary with rendering', async () => {
    const client = () => null;
    const browser = { delivery: { host: 'https://example.com/api/delivery' } };
    const cookie = { expires: 7, path: '/scope' };
    const binding = bindNextjsAppRouterServerExperiences(
      {
        ...config,
        browser,
        cookie,
        consent: { ...config.consent, clientDefaults: { consent: false } },
      },
      { request: { Experience: client } }
    );
    const root = await binding.request.ExperiencesRoot({});
    const presentation = await binding.request.Experience({});
    const analytics = await binding.request.ExperiencesAnalyticsRoot({});
    expect(root.type).toBe(NextjsAppRouterRequestRoot);
    expect(analytics.type).toBe(NextjsAppRouterRequestAnalyticsRoot);
    expect(root.props).toMatchObject({
      spaceId: 'space',
      environmentId: 'master',
      browser,
      cookie,
      defaults: { consent: false },
    });
    expect(root.props).not.toHaveProperty('delivery');
    expect(root.props.result).toEqual(presentation?.props.result);
    expect(doubles.transfer).toHaveBeenCalledTimes(1);
  });

  it('allows each root override independently and requires browser config only for a built-in root', async () => {
    const client = () => null;
    const binding = bindNextjsAppRouterServerExperiences(config, {
      request: { ExperiencesAnalyticsRoot: client },
    });
    expect((await binding.request.ExperiencesAnalyticsRoot({})).type).toBe(client);
    await expect(binding.request.ExperiencesRoot({})).rejects.toThrow(
      'requires browser configuration'
    );
  });

  it('rejects functions in explicit browser config without projecting server credentials', async () => {
    const browser = { delivery: { accessToken: (() => 'browser-token') as unknown as string } };
    const binding = bindNextjsAppRouterServerExperiences({ ...config, browser });
    await expect(binding.request.ExperiencesRoot({})).rejects.toThrow('Non-JSON value');
  });

  it('preserves producer-returned content errors and their usable handoff', async () => {
    const error = new Error('resolver failed');
    doubles.transfer.mockResolvedValue({ error, handoff });
    const binding = bindNextjsAppRouterServerExperiences(config);
    const result = await binding.request.loadExperience();
    expect(result.error).toBe(error);
    expect(result.handoff).toEqual(handoff);
    expect(result.contentError).toBe('Experience content unavailable.');
  });

  it.each([
    new TypeError('invalid replay'),
    Object.assign(new Error('redirect'), { digest: 'NEXT_REDIRECT' }),
  ])(
    'propagates thrown preparation/control-flow failure %s and destroys the facade',
    async (error) => {
      doubles.transfer.mockRejectedValue(error);
      const binding = bindNextjsAppRouterServerExperiences(config);
      await expect(binding.request.loadExperience()).rejects.toBe(error);
      expect(doubles.destroy).toHaveBeenCalledTimes(1);
    }
  );

  it('propagates composition exceptions without publishing a browser result', async () => {
    const error = new Error('host composition');
    const binding = bindNextjsAppRouterServerExperiences({
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
