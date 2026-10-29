import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockApiClient,
  mockCreateRuntimeDeliveryClient,
  mockFetchExperience,
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
    mockCreateRuntimeDeliveryClient: vi.fn((source) => ({ source })),
    mockFetchExperience: vi.fn().mockResolvedValue({ nodes: [] }),
    mockResolveExperience: vi.fn().mockResolvedValue({ nodes: [] }),
  };
});

vi.mock('./create-runtime-delivery-client.js', () => ({
  createRuntimeDeliveryClient: mockCreateRuntimeDeliveryClient,
}));
vi.mock('@contentful/experiences-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@contentful/experiences-client')>()),
  fetchExperience: mockFetchExperience,
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
  it('forwards per-fetch parameters to Delivery and Preview without retaining them', async () => {
    mockFetchExperience.mockClear();
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
        preview: true,
      },
      { config: { components: {} } }
    );
    await runtime.fetchExperience({ experienceId: 'exp' }, { config: { components: {} } });
    expect(mockFetchExperience.mock.calls.map(([options]) => options.parameters)).toEqual([
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
    mockCreateRuntimeDeliveryClient.mockClear();

    const runtime = createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      locale: 'en-US',
      delivery: { accessToken: 'delivery' },
      preview: { accessToken: 'preview' },
      resolveDefaults: { metadata: { site: 'main', shared: 'default' }, debug: true },
      eventBuilder: { channel: 'server' },
    });
    expect(mockCreateRuntimeDeliveryClient).toHaveBeenCalledTimes(2);
    expect(mockCreateRuntimeDeliveryClient).toHaveBeenNthCalledWith(
      1,
      { accessToken: 'delivery' },
      undefined,
      userAgentHeaders
    );
    expect(mockCreateRuntimeDeliveryClient).toHaveBeenNthCalledWith(
      2,
      { accessToken: 'preview' },
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
    expect(mockFetchExperience).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'de-DE',
        personalization,
        extensions: { sourceMap: {} },
      }),
      expect.objectContaining({ client: expect.anything() }),
      expect.objectContaining({
        config: { components: {} },
        metadata: { site: 'main', shared: 'default' },
        debug: true,
      })
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
  });

  it('uses delivery for destinations, preview for preview calls, and reports missing preview clients', async () => {
    mockCreateRuntimeDeliveryClient.mockClear();
    const delivery = { id: 'delivery' } as never;
    const preview = { id: 'preview' } as never;
    mockCreateRuntimeDeliveryClient.mockReturnValueOnce(delivery).mockReturnValueOnce(preview);
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
    expect(mockFetchExperience).toHaveBeenLastCalledWith(
      expect.objectContaining({ destinationId: 'dest' }),
      { client: delivery },
      expect.anything()
    );
    await runtime.fetchExperience(
      { experienceId: 'exp', preview: true },
      { config: { components: {} } }
    );
    expect(mockFetchExperience).toHaveBeenLastCalledWith(
      expect.objectContaining({ experienceId: 'exp' }),
      { client: preview },
      expect.anything()
    );
    runtime.destroy();
    const withoutPreview = createRuntime({
      spaceId: 'space',
      environmentId: 'env',
      delivery: { accessToken: 'delivery' },
      eventBuilder: { channel: 'server' },
    });
    expect(() =>
      withoutPreview.fetchExperience(
        { experienceId: 'exp', preview: true },
        { config: { components: {} } }
      )
    ).toThrow('fetchExperience()');
  });

  it('preserves an explicit generated-client environment for preview clients', () => {
    mockCreateRuntimeDeliveryClient.mockClear();

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

    expect(mockCreateRuntimeDeliveryClient).toHaveBeenCalledWith(
      {
        accessToken: 'preview',
        environment: 'https://preview-environment.example',
      },
      'https://preview.xdn.contentful.com',
      userAgentHeaders
    );
  });

  it('gives an explicit host precedence over generated-client environment', () => {
    mockCreateRuntimeDeliveryClient.mockClear();

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

    expect(mockCreateRuntimeDeliveryClient).toHaveBeenCalledWith(
      {
        accessToken: 'preview',
        environment: 'https://preview-environment.example',
        host: 'https://preview-host.example',
      },
      'https://preview.xdn.contentful.com',
      userAgentHeaders
    );
  });

  it('reports the leaf SDK and application in the user-agent header', () => {
    mockCreateRuntimeDeliveryClient.mockClear();

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

    expect(mockCreateRuntimeDeliveryClient).toHaveBeenCalledWith(expect.anything(), undefined, {
      'X-Contentful-User-Agent': expect.stringMatching(
        /^app my-site\/2\.1\.0; sdk experiences-node\/0\.6\.0; platform node\.js\//
      ),
    });
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

    expect(mockFetchExperience).toHaveBeenLastCalledWith(
      expect.objectContaining({ locale: 'de-DE' }),
      expect.anything(),
      expect.anything()
    );
    expect(runtime.eventBuilder.getLocale()).toBe('de-DE');
  });
});
