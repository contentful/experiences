import { describe, expect, it, vi } from 'vitest';

const { mockApiClient, mockCreateClient, mockFetchExperience, mockResolveExperience } = vi.hoisted(
  () => {
    const mockOptimizationClient = {
      experience: { upsertProfile: vi.fn() },
      insights: { sendBatchEvents: vi.fn() },
    };
    return {
      mockApiClient: vi.fn(function MockApiClient() {
        return mockOptimizationClient;
      }),
      mockCreateClient: vi.fn((source) => ({ source })),
      mockFetchExperience: vi.fn().mockResolvedValue({ nodes: [], viewports: [] }),
      mockResolveExperience: vi.fn().mockResolvedValue({ nodes: [], viewports: [] }),
    };
  }
);

vi.mock('./create-client.js', () => ({ createClient: mockCreateClient }));
vi.mock('./fetch-experience.js', () => ({ fetchExperience: mockFetchExperience }));
vi.mock('@contentful/experiences-sdk-core', () => ({ resolveExperience: mockResolveExperience }));
vi.mock('@contentful/optimization-api-client', () => ({ ApiClient: mockApiClient }));

import { ContentfulExperiences } from './contentful-experiences.js';

class DynamicLocaleExperiences extends ContentfulExperiences {
  currentLocale: string | undefined;

  constructor(locale: string) {
    super({
      spaceId: 'space',
      environmentId: 'env',
      locale,
      resolverConfig: { components: {} },
      delivery: { client: {} as never },
      eventBuilder: { channel: 'server' },
    });
    this.currentLocale = locale;
  }

  override get locale(): string | undefined {
    return this.currentLocale;
  }
}

describe('ContentfulExperiences', () => {
  it('constructs Optimization transport from the runtime Contentful identifiers', () => {
    mockApiClient.mockClear();

    new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'staging',
      resolverConfig: { components: {} },
      delivery: { client: {} as never },
      optimization: {
        experienceBaseUrl: 'https://experience.example',
        insightsBaseUrl: 'https://insights.example',
        enabledFeatures: ['location'],
        fetchOptions: { retries: 3 },
      },
      eventBuilder: { channel: 'server' },
    });

    expect(mockApiClient).toHaveBeenCalledWith({
      spaceId: 'space',
      environment: 'staging',
      fetchOptions: { retries: 3 },
      experience: {
        baseUrl: 'https://experience.example',
        enabledFeatures: ['location'],
      },
      insights: { baseUrl: 'https://insights.example' },
    });
  });

  it('constructs each configured client once and applies resolve defaults without mutating locale', async () => {
    const runtime = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'env',
      locale: 'en-US',
      resolverConfig: { components: {} },
      delivery: { accessToken: 'delivery' },
      preview: { accessToken: 'preview' },
      resolveDefaults: { metadata: { site: 'main', shared: 'default' }, debug: true },
      eventBuilder: { channel: 'server' },
    });
    expect(mockCreateClient).toHaveBeenCalledTimes(2);
    expect(mockCreateClient).toHaveBeenNthCalledWith(1, {
      accessToken: 'delivery',
      host: undefined,
    });
    expect(mockCreateClient).toHaveBeenNthCalledWith(2, {
      accessToken: 'preview',
      host: 'https://preview.xdn.contentful.com',
    });
    await runtime.resolveExperience(
      { sys: { type: 'Experience' }, nodes: [] },
      { metadata: { shared: 'call' } }
    );
    expect(mockResolveExperience).toHaveBeenCalledWith(
      expect.anything(),
      { components: {} },
      {
        metadata: { site: 'main', shared: 'call' },
        debug: true,
        initialViewportId: undefined,
      }
    );
    const personalization = {
      profileId: 'profile-1',
      events: [runtime.eventBuilder.buildPageView()],
    };
    await runtime.fetchExperience({
      experienceId: 'exp',
      locale: 'de-DE',
      personalization,
      extensions: { sourceMap: {} },
    });
    expect(mockFetchExperience).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'de-DE',
        personalization,
        extensions: { sourceMap: {} },
      }),
      expect.objectContaining({ client: expect.anything() }),
      expect.objectContaining({ config: { components: {} } })
    );
    expect(runtime.locale).toBe('en-US');
  });

  it('uses delivery for destinations, preview for preview calls, and reports missing preview clients', async () => {
    const delivery = { id: 'delivery' } as never;
    const preview = { id: 'preview' } as never;
    const runtime = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'env',
      resolverConfig: { components: {} },
      delivery: { client: delivery },
      preview: { client: preview },
      eventBuilder: { channel: 'server' },
    });
    await runtime.fetchByDestinationNode({ destinationId: 'dest', nodeId: 'node' });
    expect(mockFetchExperience).toHaveBeenLastCalledWith(
      expect.objectContaining({ destinationId: 'dest' }),
      { client: delivery },
      expect.anything()
    );
    await runtime.fetchExperience({ experienceId: 'exp', preview: true });
    expect(mockFetchExperience).toHaveBeenLastCalledWith(
      expect.objectContaining({ experienceId: 'exp' }),
      { client: preview },
      expect.anything()
    );
    const withoutPreview = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'env',
      resolverConfig: { components: {} },
      delivery: { client: delivery },
      eventBuilder: { channel: 'server' },
    });
    expect(() => withoutPreview.fetchExperience({ experienceId: 'exp', preview: true })).toThrow(
      'fetchExperience()'
    );
  });

  it('preserves an explicit generated-client environment for preview clients', () => {
    mockCreateClient.mockClear();

    new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'env',
      resolverConfig: { components: {} },
      delivery: { client: {} as never },
      preview: {
        accessToken: 'preview',
        environment: 'https://preview-environment.example',
      },
      eventBuilder: { channel: 'server' },
    });

    expect(mockCreateClient).toHaveBeenCalledWith({
      accessToken: 'preview',
      environment: 'https://preview-environment.example',
      host: undefined,
    });
  });

  it('gives an explicit host precedence over generated-client environment', () => {
    mockCreateClient.mockClear();

    new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'env',
      resolverConfig: { components: {} },
      delivery: { client: {} as never },
      preview: {
        accessToken: 'preview',
        environment: 'https://preview-environment.example',
        host: 'https://preview-host.example',
      },
      eventBuilder: { channel: 'server' },
    });

    expect(mockCreateClient).toHaveBeenCalledWith({
      accessToken: 'preview',
      environment: 'https://preview-environment.example',
      host: 'https://preview-host.example',
    });
  });

  it('creates a stable build-only EventBuilder with runtime locale defaults and caller overrides', () => {
    const runtime = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'env',
      locale: 'fr-FR',
      resolverConfig: { components: {} },
      delivery: { client: {} as never },
      eventBuilder: { channel: 'web', library: { version: 'test' }, getLocale: () => 'de-DE' },
    });
    expect(runtime.eventBuilder.channel).toBe('web');
    expect(runtime.eventBuilder.library).toMatchObject({
      name: '@contentful/experiences-client',
      version: 'test',
    });
    expect(runtime.eventBuilder.getLocale()).toBe('de-DE');
    expect(runtime.eventBuilder).toBe(runtime.eventBuilder);
  });

  it('reads locale dynamically for fetches and default EventBuilder locale', async () => {
    const runtime = new DynamicLocaleExperiences('en-US');

    runtime.currentLocale = 'de-DE';
    await runtime.fetchExperience({ experienceId: 'exp' });

    expect(mockFetchExperience).toHaveBeenLastCalledWith(
      expect.objectContaining({ locale: 'de-DE' }),
      expect.anything(),
      expect.anything()
    );
    expect(runtime.eventBuilder.getLocale()).toBe('de-DE');
  });
});
