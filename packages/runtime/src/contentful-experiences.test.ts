import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockApiClient,
  mockCreateDeliveryClient,
  mockFetchExperience,
  mockFetchExperiencePayload,
  mockResolveExperience,
} = vi.hoisted(() => {
  const mockOptimizationClient = {
    experience: { upsertProfile: vi.fn() },
    insights: { sendBatchEvents: vi.fn() },
  };
  return {
    mockApiClient: vi.fn(function MockApiClient() {
      return mockOptimizationClient;
    }),
    mockCreateDeliveryClient: vi.fn((source) => ({ source })),
    mockFetchExperience: vi.fn().mockResolvedValue({ nodes: [] }),
    mockFetchExperiencePayload: vi.fn().mockResolvedValue({ nodes: [] }),
    mockResolveExperience: vi.fn().mockResolvedValue({ nodes: [] }),
  };
});

vi.mock('./create-delivery-client.js', () => ({
  createDeliveryClient: mockCreateDeliveryClient,
}));
vi.mock('@contentful/experiences-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@contentful/experiences-client')>()),
  fetchExperience: mockFetchExperience,
  fetchExperiencePayload: mockFetchExperiencePayload,
}));
vi.mock('@contentful/experiences-sdk-core', () => ({ resolveExperience: mockResolveExperience }));
vi.mock('@contentful/optimization-api-client', () => ({ ApiClient: mockApiClient }));

import { ContentfulExperiences } from './contentful-experiences.js';

const userAgentHeaders = {
  'X-Contentful-User-Agent': expect.stringMatching(/^sdk experiences-runtime\/0\.0\.0; /),
};

const runtimes: ContentfulExperiences[] = [];

function createRuntime(config: ConstructorParameters<typeof ContentfulExperiences>[0]) {
  const runtime = new ContentfulExperiences(config);
  runtimes.push(runtime);
  return runtime;
}

afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.destroy();
});

class DynamicLocaleExperiences extends ContentfulExperiences {
  currentLocale: string | undefined;

  constructor(locale: string) {
    super({
      spaceId: 'space',
      environmentId: 'env',
      locale,
      delivery: { accessToken: 'delivery' },
      eventBuilder: { channel: 'server' },
    });
    this.currentLocale = locale;
  }

  override get locale(): string | undefined {
    return this.currentLocale;
  }
}

describe('ContentfulExperiences', () => {
  it('looks up flags only from explicit caller data without transport or retained state', () => {
    const runtime = createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      delivery: { accessToken: 'delivery' },
      eventBuilder: { channel: 'server' },
    });
    const send = vi.spyOn(runtime.api.analytics, 'sendBatchEvents');
    const personalize = vi.spyOn(runtime.api.personalization, 'upsertProfile');
    const changes = [
      {
        type: 'Variable',
        key: 'flag',
        value: false,
        meta: { experienceId: 'experiment', variantIndex: 0 },
      },
    ];
    expect(runtime.getFlag('flag', changes)).toBe(false);
    expect(runtime.getFlag('flag')).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
    expect(personalize).not.toHaveBeenCalled();
  });

  it('builds fetch arguments once while preserving already-built events on refetch', async () => {
    mockFetchExperiencePayload.mockClear();
    const runtime = createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      delivery: { accessToken: 'delivery' },
      eventBuilder: { channel: 'server' },
    });
    const build = vi.spyOn(runtime.eventBuilder, 'buildIdentify');
    const options = {
      experienceId: 'experience',
      personalization: {
        preflight: true,
        events: [{ type: 'identify' as const, userId: 'visitor' }],
      },
    };
    await runtime.fetchExperience(options, { config: { components: {} } });
    const events = mockFetchExperiencePayload.mock.calls[0]![0].personalization.events;
    expect(events).toMatchObject([{ type: 'identify', userId: 'visitor', channel: 'server' }]);
    expect(events).toHaveLength(1);
    await runtime.fetchExperience(
      { ...options, personalization: { preflight: true, events } },
      { config: { components: {} } }
    );
    expect(mockFetchExperiencePayload.mock.calls[1]![0].personalization.events).toEqual(events);
    expect(mockFetchExperiencePayload.mock.calls[1]![0].personalization.preflight).toBe(true);
    expect(build).toHaveBeenCalledOnce();
    expect(options.personalization.events).toEqual([{ type: 'identify', userId: 'visitor' }]);
  });

  it('forwards per-fetch parameters to Delivery without retaining them', async () => {
    mockFetchExperiencePayload.mockClear();
    const runtime = createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      delivery: { accessToken: 'delivery' },
      preview: { accessToken: 'preview' },
      eventBuilder: { channel: 'server' },
    });
    const parameters = { featuredPosts: { limit: 6, order: '-fields.title' } };
    await runtime.fetchExperience(
      { experienceId: 'exp', parameters },
      { config: { components: {} } }
    );
    await runtime.fetchExperience(
      {
        experienceId: 'exp',
        parameters: { featuredPosts: { limit: 12, order: 'sys.createdAt' } },
      },
      { config: { components: {} } }
    );
    await runtime.fetchExperience({ experienceId: 'exp' }, { config: { components: {} } });
    expect(mockFetchExperiencePayload.mock.calls.map(([options]) => options.parameters)).toEqual([
      parameters,
      { featuredPosts: { limit: 12, order: 'sys.createdAt' } },
      undefined,
    ]);
  });

  it('constructs Optimization transport from the runtime Contentful identifiers', () => {
    mockApiClient.mockClear();

    createRuntime({
      spaceId: 'space',
      environmentId: 'staging',
      delivery: { accessToken: 'delivery' },
      optimization: {
        personalizationBaseUrl: 'https://personalization.example',
        analyticsBaseUrl: 'https://analytics.example',
        personalizationEnabledFeatures: ['location'],
        fetchOptions: { retries: 3 },
      },
      eventBuilder: { channel: 'server' },
    });

    expect(mockApiClient).toHaveBeenCalledWith({
      spaceId: 'space',
      environment: 'staging',
      fetchOptions: { retries: 3 },
      experience: {
        baseUrl: 'https://personalization.example',
        enabledFeatures: ['location'],
      },
      insights: { baseUrl: 'https://analytics.example' },
    });
  });

  it('constructs each configured client once and applies resolve defaults without mutating locale', async () => {
    mockCreateDeliveryClient.mockClear();

    const runtime = createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      locale: 'en-US',
      delivery: { accessToken: 'delivery' },
      preview: { accessToken: 'preview' },
      resolveDefaults: { metadata: { site: 'main', shared: 'default' }, debug: true },
      eventBuilder: { channel: 'server' },
    });
    expect(mockCreateDeliveryClient).toHaveBeenCalledTimes(2);
    expect(mockCreateDeliveryClient).toHaveBeenNthCalledWith(
      1,
      { accessToken: 'delivery' },
      { spaceId: 'space', environmentId: 'env' },
      undefined,
      userAgentHeaders
    );
    expect(mockCreateDeliveryClient).toHaveBeenNthCalledWith(
      2,
      { accessToken: 'preview' },
      { spaceId: 'space', environmentId: 'env' },
      'https://preview.xdn.contentful.com',
      userAgentHeaders
    );
    await runtime.resolveExperience(
      { sys: { type: 'Experience' }, nodes: [] },
      { config: { components: {} }, metadata: { shared: 'call' } }
    );
    expect(mockResolveExperience).toHaveBeenCalledWith(
      expect.anything(),
      { components: {} },
      {
        metadata: { site: 'main', shared: 'call' },
        debug: true,
        sourceMap: undefined,
      }
    );
    const personalization = {
      profileId: 'profile-1',
      events: [runtime.eventBuilder.buildPageView()],
    };
    await runtime.fetchExperience(
      {
        experienceId: 'exp',
        locale: 'de-DE',
        personalization,
        extensions: { sourceMap: {} },
      },
      { config: { components: {} } }
    );
    expect(mockFetchExperiencePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space',
        environmentId: 'env',
        experienceId: 'exp',
        locale: 'de-DE',
        personalization,
        extensions: { sourceMap: {} },
      }),
      expect.anything(),
      true
    );
    expect(mockResolveExperience).toHaveBeenLastCalledWith(
      expect.anything(),
      { components: {} },
      { metadata: { site: 'main', shared: 'default' }, debug: true }
    );
    expect(runtime.locale).toBe('en-US');
  });

  it('rejects missing per-call config before resolving or fetching', () => {
    const runtime = createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      delivery: { accessToken: 'delivery' },
      eventBuilder: { channel: 'server' },
    });
    const payload = { sys: { type: 'Experience' as const }, nodes: [] };
    mockResolveExperience.mockClear();
    mockFetchExperience.mockClear();
    mockFetchExperiencePayload.mockClear();

    const calls = [
      () => runtime.resolveExperience(payload, undefined as never),
      () => runtime.fetchExperience({ experienceId: 'exp' }, undefined as never),
      () =>
        runtime.fetchByDestinationNode(
          { destinationId: 'dest', nodeId: 'node' },
          undefined as never
        ),
      () =>
        runtime.fetchByDestinationPath(
          { destinationId: 'dest', path: '/page' },
          undefined as never
        ),
    ];
    for (const call of calls) {
      expect(call).toThrow('A resolver config is required in resolveOptions.config');
    }
    expect(mockResolveExperience).not.toHaveBeenCalled();
    expect(mockFetchExperience).not.toHaveBeenCalled();
    expect(mockFetchExperiencePayload).not.toHaveBeenCalled();
  });

  it('forwards personalization on destination node and path fetches', async () => {
    const delivery = { id: 'delivery' } as never;
    mockCreateDeliveryClient.mockReturnValueOnce(delivery);
    const runtime = createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      delivery: { accessToken: 'delivery' },
      eventBuilder: { channel: 'server' },
    });
    const personalization = { profileId: 'profile-1' };

    const options = { destinationId: 'dest', personalization };
    const resolveOptions = { config: { components: {} } };
    for (const { selector, fetch } of [
      {
        selector: { nodeId: 'node' },
        fetch: () => runtime.fetchByDestinationNode({ ...options, nodeId: 'node' }, resolveOptions),
      },
      {
        selector: { path: '/page' },
        fetch: () => runtime.fetchByDestinationPath({ ...options, path: '/page' }, resolveOptions),
      },
    ]) {
      await fetch();
      expect(mockFetchExperiencePayload).toHaveBeenLastCalledWith(
        { spaceId: 'space', ...options, ...selector, locale: undefined },
        delivery,
        undefined
      );
    }
  });

  it('builds destination event arguments once and returns redirects without resolving', async () => {
    const runtime = createRuntime({
      spaceId: 'space',
      environmentId: 'branch',
      locale: 'de-DE',
      delivery: { accessToken: 'token' },
      eventBuilder: { channel: 'server' },
    });
    const build = vi.spyOn(runtime.eventBuilder, 'buildPageView');
    const before = mockResolveExperience.mock.calls.length;
    mockFetchExperiencePayload.mockResolvedValueOnce({ redirect: { path: '/target' } });
    await expect(
      runtime.fetchExperience(
        { destinationId: 'dest', path: '/old', personalization: { events: [{ type: 'page' }] } },
        { config: { components: {} } }
      )
    ).resolves.toEqual({ redirect: { path: '/target' } });
    expect(build).toHaveBeenCalledOnce();
    expect(mockResolveExperience.mock.calls).toHaveLength(before);
    expect(mockFetchExperiencePayload).toHaveBeenLastCalledWith(
      expect.objectContaining({
        destinationId: 'dest',
        path: '/old',
        locale: 'de-DE',
        personalization: { events: [expect.objectContaining({ type: 'page' })] },
      }),
      expect.anything(),
      undefined
    );
    expect(mockFetchExperiencePayload.mock.lastCall?.[0]).not.toHaveProperty('environmentId');
  });

  it('uses Delivery for ordinary by-ID and destination fetches with Preview configured', async () => {
    mockCreateDeliveryClient.mockClear();
    const delivery = { id: 'delivery' } as never;
    const preview = { id: 'preview' } as never;
    mockCreateDeliveryClient.mockReturnValueOnce(delivery).mockReturnValueOnce(preview);
    const runtime = createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      delivery: { accessToken: 'delivery' },
      preview: { accessToken: 'preview' },
      eventBuilder: { channel: 'server' },
    });
    await runtime.fetchByDestinationNode(
      { destinationId: 'dest', nodeId: 'node' },
      { config: { components: {} } }
    );
    expect(mockFetchExperiencePayload).toHaveBeenLastCalledWith(
      expect.objectContaining({ destinationId: 'dest' }),
      delivery,
      undefined
    );
    await runtime.fetchExperience({ experienceId: 'exp' }, { config: { components: {} } });
    expect(mockFetchExperiencePayload).toHaveBeenLastCalledWith(
      expect.objectContaining({ experienceId: 'exp' }),
      delivery,
      undefined
    );
  });

  it('preserves an explicit generated-client environment for preview clients', () => {
    mockCreateDeliveryClient.mockClear();

    createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      delivery: { accessToken: 'delivery' },
      preview: {
        accessToken: 'preview',
        environment: 'https://preview-environment.example',
      },
      eventBuilder: { channel: 'server' },
    });

    expect(mockCreateDeliveryClient).toHaveBeenCalledWith(
      {
        accessToken: 'preview',
        environment: 'https://preview-environment.example',
      },
      { spaceId: 'space', environmentId: 'env' },
      'https://preview.xdn.contentful.com',
      userAgentHeaders
    );
  });

  it('gives an explicit host precedence over generated-client environment', () => {
    mockCreateDeliveryClient.mockClear();

    createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      delivery: { accessToken: 'delivery' },
      preview: {
        accessToken: 'preview',
        environment: 'https://preview-environment.example',
        host: 'https://preview-host.example',
      },
      eventBuilder: { channel: 'server' },
    });

    expect(mockCreateDeliveryClient).toHaveBeenCalledWith(
      {
        accessToken: 'preview',
        environment: 'https://preview-environment.example',
        host: 'https://preview-host.example',
      },
      { spaceId: 'space', environmentId: 'env' },
      'https://preview.xdn.contentful.com',
      userAgentHeaders
    );
  });

  it('reports the leaf SDK and application in the user-agent header', () => {
    mockCreateDeliveryClient.mockClear();

    createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      delivery: { accessToken: 'delivery' },
      eventBuilder: {
        channel: 'server',
        app: { name: 'my-site', version: '2.1.0' },
        library: { name: '@contentful/experiences-node', version: '0.6.0' },
      },
    });

    expect(mockCreateDeliveryClient).toHaveBeenCalledWith(
      expect.anything(),
      { spaceId: 'space', environmentId: 'env' },
      undefined,
      {
        'X-Contentful-User-Agent': expect.stringMatching(
          /^app my-site\/2\.1\.0; sdk experiences-node\/0\.6\.0; platform node\.js\//
        ),
      }
    );
  });

  it('creates a stable build-only EventBuilder with runtime locale defaults and caller overrides', () => {
    const runtime = createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      locale: 'fr-FR',
      delivery: { accessToken: 'delivery' },
      eventBuilder: { channel: 'web', library: { version: 'test' }, getLocale: () => 'de-DE' },
    });
    expect(runtime.eventBuilder.channel).toBe('web');
    expect(runtime.eventBuilder.library).toMatchObject({
      name: '@contentful/experiences-runtime',
      version: 'test',
    });
    expect(runtime.eventBuilder.getLocale()).toBe('de-DE');
    expect(runtime.eventBuilder).toBe(runtime.eventBuilder);
  });

  it('reads locale dynamically for fetches and default EventBuilder locale', async () => {
    const runtime = new DynamicLocaleExperiences('en-US');
    runtimes.push(runtime);

    runtime.currentLocale = 'de-DE';
    await runtime.fetchExperience({ experienceId: 'exp' }, { config: { components: {} } });

    expect(mockFetchExperiencePayload).toHaveBeenLastCalledWith(
      expect.objectContaining({ locale: 'de-DE' }),
      expect.anything(),
      undefined
    );
    expect(runtime.eventBuilder.getLocale()).toBe('de-DE');
  });
});
