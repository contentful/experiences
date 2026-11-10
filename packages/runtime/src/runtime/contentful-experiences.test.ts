import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateOptimizationClient,
  mockCreateDeliveryClient,
  mockFetchExperience,
  mockFetchExperiencePayload,
  mockResolveExperience,
} = vi.hoisted(() => {
  const mockOptimizationClient = {
    personalization: { upsertProfile: vi.fn() },
    analytics: { sendBatchEvents: vi.fn() },
  };
  return {
    mockCreateOptimizationClient: vi.fn(function MockOptimizationClient() {
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
vi.mock('./create-optimization-client.js', () => ({
  createOptimizationClient: mockCreateOptimizationClient,
}));

import { ContentfulExperiences } from './contentful-experiences.js';

const userAgentHeaders = {
  'X-Contentful-User-Agent': expect.stringMatching(/^sdk experiences-runtime\/0\.0\.0; /),
};

const runtimes: ContentfulExperiences[] = [];

function createRuntime(
  config: Partial<ConstructorParameters<typeof ContentfulExperiences>[0]> = {}
) {
  const runtime = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'env',
    delivery: { accessToken: 'delivery' },
    eventBuilder: { channel: 'server' },
    ...config,
  });
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
    const runtime = createRuntime();
    const builders = [
      vi.spyOn(runtime.eventBuilder, 'buildIdentify'),
      vi.spyOn(runtime.eventBuilder, 'buildTrack'),
      vi.spyOn(runtime.eventBuilder, 'buildPageView'),
    ];
    const options = {
      experienceId: 'experience',
      personalization: {
        events: [
          { type: 'identify' as const, userId: 'visitor' },
          { type: 'track' as const, event: 'opened' },
          { type: 'page' as const },
        ],
      },
    };
    await runtime.fetchExperience(options, { config: { components: {} } });
    const events = mockFetchExperiencePayload.mock.calls[0]![0].personalization.events;
    expect(events).toMatchObject([
      { type: 'identify', userId: 'visitor', channel: 'server' },
      { type: 'track', event: 'opened', channel: 'server' },
      { type: 'page', channel: 'server' },
    ]);
    await runtime.fetchExperience(
      { ...options, personalization: { events } },
      { config: { components: {} } }
    );
    expect(mockFetchExperiencePayload.mock.calls[1]![0].personalization.events).toEqual(events);
    for (const builder of builders) expect(builder).toHaveBeenCalledOnce();
    expect(options.personalization.events).toEqual([
      { type: 'identify', userId: 'visitor' },
      { type: 'track', event: 'opened' },
      { type: 'page' },
    ]);
  });

  it('forwards per-fetch parameters to Delivery and Preview without retaining them', async () => {
    mockFetchExperiencePayload.mockClear();
    const runtime = createRuntime({
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
    expect(mockFetchExperiencePayload.mock.calls.map(([options]) => options.parameters)).toEqual([
      parameters,
      { featuredPosts: { limit: 12, order: 'sys.createdAt' } },
      undefined,
    ]);
  });

  it('constructs Optimization transport from the runtime Contentful identifiers', () => {
    mockCreateOptimizationClient.mockClear();

    createRuntime({
      environmentId: 'staging',
      optimization: {
        personalizationBaseUrl: 'https://personalization.example',
        analyticsBaseUrl: 'https://analytics.example',
        personalizationEnabledFeatures: ['location'],
        fetchOptions: { retries: 3 },
      },
      eventBuilder: { channel: 'server' },
    });

    expect(mockCreateOptimizationClient).toHaveBeenCalledWith({
      spaceId: 'space',
      environmentId: 'staging',
      locale: undefined,
      fetchOptions: { retries: 3 },
      personalizationBaseUrl: 'https://personalization.example',
      personalizationEnabledFeatures: ['location'],
      analyticsBaseUrl: 'https://analytics.example',
    });
  });

  it('constructs each configured client once and applies resolve defaults without mutating locale', async () => {
    mockCreateDeliveryClient.mockClear();

    const runtime = createRuntime({
      locale: 'en-US',
      preview: { accessToken: 'preview' },
      resolveDefaults: { metadata: { site: 'main', shared: 'default' }, debug: true },
      eventBuilder: { channel: 'server' },
    });
    expect(mockCreateDeliveryClient).toHaveBeenCalledTimes(2);
    expect(mockCreateDeliveryClient).toHaveBeenNthCalledWith(
      1,
      { accessToken: 'delivery' },
      undefined,
      userAgentHeaders
    );
    expect(mockCreateDeliveryClient).toHaveBeenNthCalledWith(
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
    const runtime = createRuntime();
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
    const runtime = createRuntime();
    const personalization = { profileId: 'profile-1' };

    await runtime.fetchByDestinationNode(
      { destinationId: 'dest', nodeId: 'node', personalization },
      { config: { components: {} } }
    );
    expect(mockFetchExperience).toHaveBeenLastCalledWith(
      { spaceId: 'space', destinationId: 'dest', nodeId: 'node', personalization },
      { client: delivery },
      expect.anything()
    );

    await runtime.fetchByDestinationPath(
      { destinationId: 'dest', path: '/page', personalization },
      { config: { components: {} } }
    );
    expect(mockFetchExperience).toHaveBeenLastCalledWith(
      { spaceId: 'space', destinationId: 'dest', path: '/page', personalization },
      { client: delivery },
      expect.anything()
    );
  });

  it('uses delivery for destinations, preview for preview calls, and reports missing preview clients', async () => {
    mockCreateDeliveryClient.mockClear();
    const delivery = { id: 'delivery' } as never;
    const preview = { id: 'preview' } as never;
    mockCreateDeliveryClient.mockReturnValueOnce(delivery).mockReturnValueOnce(preview);
    const runtime = createRuntime({
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
    expect(mockFetchExperiencePayload).toHaveBeenLastCalledWith(
      expect.objectContaining({ experienceId: 'exp' }),
      preview,
      undefined
    );
    runtime.destroy();
    const withoutPreview = createRuntime();
    expect(() =>
      withoutPreview.fetchExperience(
        { experienceId: 'exp', preview: true },
        { config: { components: {} } }
      )
    ).toThrow('fetchExperience()');
  });

  it.each([undefined, 'https://preview-host.example'])(
    'preserves generated preview environment and explicit host (%s)',
    (host) => {
      mockCreateDeliveryClient.mockClear();
      const preview = {
        accessToken: 'preview',
        environment: 'https://preview-environment.example',
        ...(host === undefined ? {} : { host }),
      };
      createRuntime({ preview });
      expect(mockCreateDeliveryClient).toHaveBeenCalledWith(
        preview,
        'https://preview.xdn.contentful.com',
        userAgentHeaders
      );
    }
  );

  it('reports the leaf SDK and application in the user-agent header', () => {
    mockCreateDeliveryClient.mockClear();

    createRuntime({
      eventBuilder: {
        channel: 'server',
        app: { name: 'my-site', version: '2.1.0' },
        library: { name: '@contentful/experiences-node', version: '0.6.0' },
      },
    });

    expect(mockCreateDeliveryClient).toHaveBeenCalledWith(expect.anything(), undefined, {
      'X-Contentful-User-Agent': expect.stringMatching(
        /^app my-site\/2\.1\.0; sdk experiences-node\/0\.6\.0; platform node\.js\//
      ),
    });
  });

  it('creates a stable build-only EventBuilder with runtime locale defaults and caller overrides', () => {
    const runtime = createRuntime({
      locale: 'fr-FR',
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
