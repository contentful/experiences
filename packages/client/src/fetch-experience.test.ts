import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContentfulViewDeliveryClient,
  ContentfulViewDelivery,
} from '@contentful/experience-delivery';
import { ExperienceFetchError } from './errors.js';
import {
  fetchDestinationPayload,
  fetchExperience,
  isDestinationRedirect,
  type PersonalizationOptions,
} from './fetch-experience.js';

const {
  mockGet,
  mockGetWithOverrides,
  mockResolveByNodeId,
  mockResolveByNodeIdWithOverrides,
  mockResolveByPath,
  mockResolveByPathWithOverrides,
  mockPayload,
  mockDestinationExperience,
  mockPlan,
  mockSourceMap,
} = vi.hoisted(() => {
  const mockPayload = {
    sys: { id: 'exp-1' },
    nodes: [{ sys: { urn: 'urn:ctfl:component:hero' }, content: {}, design: {}, slots: {} }],
    errors: [],
  };

  const mockDestinationExperience = {
    sys: { id: 'exp-2' },
    nodes: [{ sys: { urn: 'urn:ctfl:component:hero' }, content: {}, design: {}, slots: {} }],
    errors: [],
  };

  const mockPlan = {
    nodes: [],
  };

  const mockSourceMap = {
    version: 1,
    variants: [],
    spaces: ['space-1'],
    environments: ['master'],
    locales: ['en-US'],
    entries: [{ entry: 'ref' }],
    assets: [],
    layers: [],
    dataAssemblies: [],
    nodes: { 'node-1': { field: 'title' } },
  };

  const mockGet = vi.fn().mockResolvedValue(mockPayload);
  const mockGetWithOverrides = vi
    .fn()
    .mockResolvedValue({ ...mockPayload, extensions: { sourceMap: mockSourceMap } });
  const mockResolveByNodeId = vi
    .fn()
    .mockResolvedValue({ experiences: [{ path: '/', experience: mockDestinationExperience }] });
  const mockResolveByNodeIdWithOverrides = vi
    .fn()
    .mockResolvedValue({ experiences: [{ path: '/', experience: mockDestinationExperience }] });
  const mockResolveByPath = vi
    .fn()
    .mockResolvedValue({ experiences: [{ path: '/', experience: mockDestinationExperience }] });
  const mockResolveByPathWithOverrides = vi
    .fn()
    .mockResolvedValue({ experiences: [{ path: '/', experience: mockDestinationExperience }] });

  return {
    mockGet,
    mockGetWithOverrides,
    mockResolveByNodeId,
    mockResolveByNodeIdWithOverrides,
    mockResolveByPath,
    mockResolveByPathWithOverrides,
    mockPayload,
    mockDestinationExperience,
    mockPlan,
    mockSourceMap,
  };
});

vi.mock('@contentful/experiences-sdk-core', () => ({
  resolveExperience: vi.fn().mockResolvedValue(mockPlan),
  createDebugLogger: vi.fn(() => ({
    log: vi.fn(),
    lazy: vi.fn(),
    time: (_label: string, fn: () => Promise<unknown>) => fn(),
    enabled: false,
  })),
}));

vi.mock('@contentful/experience-delivery', () => {
  class NotFoundError extends Error {}
  return {
    ContentfulViewDeliveryClient: vi.fn().mockImplementation(() => ({
      experience: {
        get: mockGet,
        getWithOverrides: mockGetWithOverrides,
      },
      destination: {
        resolveByNodeId: mockResolveByNodeId,
        resolveByNodeIdWithOverrides: mockResolveByNodeIdWithOverrides,
        resolveByPath: mockResolveByPath,
        resolveByPathWithOverrides: mockResolveByPathWithOverrides,
      },
    })),
    // Real package exposes `NotFoundError` under the `ContentfulViewDelivery`
    // namespace export, not top-level — mirror that shape here.
    ContentfulViewDelivery: { NotFoundError },
  };
});

const experienceOptions = {
  spaceId: 'space-1',
  environmentId: 'master',
  experienceId: 'exp-1',
};

const resolveOptions = {
  config: { components: {} },
};

const personalization = {
  profileId: 'profile-1',
  events: [
    {
      type: 'page',
      channel: 'server',
      context: { library: { name: 'test', version: '1.0.0' }, campaign: {} },
      messageId: 'page-message-1',
      timestamp: '2026-10-09T00:00:00.000Z',
      originalTimestamp: '2026-10-09T00:00:00.000Z',
      sentAt: '2026-10-09T00:00:00.000Z',
      properties: {
        path: '/',
        query: { utm: ['a', 'b'], q: 'x y' },
        referrer: '',
        search: '',
        url: '/',
        title: 'Home',
      },
    },
  ],
} satisfies PersonalizationOptions;

describe('fetchExperience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockPayload);
    mockGetWithOverrides.mockResolvedValue({
      ...mockPayload,
      extensions: { sourceMap: mockSourceMap },
    });
  });

  describe('inline credentials', () => {
    it('constructs client without baseUrl when host is not provided', async () => {
      await fetchExperience(experienceOptions, { accessToken: 'token-123' }, resolveOptions);

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'token-123', baseUrl: undefined })
      );
    });

    it('constructs client with provided host', async () => {
      await fetchExperience(
        experienceOptions,
        { accessToken: 'token-123', host: 'https://preview.xdn.contentful.com' },
        resolveOptions
      );

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'token-123',
          baseUrl: 'https://preview.xdn.contentful.com',
        })
      );
    });

    it('calls experience.get with spaceId, environmentId, experienceId, locale', async () => {
      await fetchExperience(
        { ...experienceOptions, locale: 'en-US' },
        { accessToken: 'token-123' },
        resolveOptions
      );

      expect(mockGet).toHaveBeenCalledWith('exp-1', { locale: 'en-US' });
    });
  });

  describe('pre-created client', () => {
    it('uses provided client directly without constructing a new one', async () => {
      const client = new ContentfulViewDeliveryClient({
        token: 'token-123',
        spaceId: 'space-1',
        environmentId: 'master',
      });
      vi.mocked(ContentfulViewDeliveryClient).mockClear();

      await fetchExperience(experienceOptions, { client }, resolveOptions);

      expect(ContentfulViewDeliveryClient).not.toHaveBeenCalled();
      expect(mockGet).toHaveBeenCalledWith('exp-1', { locale: undefined });
    });
  });

  describe('delivery configuration', () => {
    it('uses accessToken and default host', async () => {
      await fetchExperience(experienceOptions, { accessToken: 'delivery-token' }, resolveOptions);

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'delivery-token', baseUrl: undefined })
      );
    });

    it('uses an explicit custom host with the delivery token when preview is unset', async () => {
      await fetchExperience(
        experienceOptions,
        {
          accessToken: 'delivery-token',
          host: 'https://delivery-staging.example.com',
        },
        resolveOptions
      );

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'delivery-token',
          baseUrl: 'https://delivery-staging.example.com',
        })
      );
    });
  });

  describe('return value', () => {
    it('passes empty-nodes payloads through to the resolver', async () => {
      const emptyPayload = { ...mockPayload, nodes: [] };
      mockGet.mockResolvedValue(emptyPayload);
      const { resolveExperience } = await import('@contentful/experiences-sdk-core');

      const result = await fetchExperience(
        experienceOptions,
        { accessToken: 'token-123' },
        resolveOptions
      );

      expect(resolveExperience).toHaveBeenCalledWith(
        emptyPayload,
        resolveOptions.config,
        expect.anything()
      );
      expect(result).toEqual(mockPlan);
    });

    it('forwards flattened metadata + debug to resolveExperience', async () => {
      const { resolveExperience } = await import('@contentful/experiences-sdk-core');

      await fetchExperience(
        experienceOptions,
        { accessToken: 'token-123' },
        { config: resolveOptions.config, metadata: { slug: 'home' }, debug: true }
      );

      expect(resolveExperience).toHaveBeenCalledWith(mockPayload, resolveOptions.config, {
        metadata: { slug: 'home' },
        debug: true,
      });
    });

    it('returns resolved PortableRenderPlan on success', async () => {
      const result = await fetchExperience(
        experienceOptions,
        { accessToken: 'token-123' },
        resolveOptions
      );

      expect(result).toEqual(mockPlan);
    });

    it('propagates NotFoundError from the delivery client to the caller undisturbed', async () => {
      // Uses the mocked module's own `ContentfulViewDelivery.NotFoundError`
      // (imported above from '@contentful/experience-delivery', which
      // `vi.mock` redirects to the same class) — not a local look-alike — so
      // the `instanceof` check in `fetch-experience.ts` is exercised against
      // the real reference it checks against, not a class that merely has
      // the same name.
      const notFound = new ContentfulViewDelivery.NotFoundError('experience not found');
      mockGet.mockRejectedValue(notFound);

      const rejection: unknown = await fetchExperience(
        experienceOptions,
        { accessToken: 'token-123' },
        resolveOptions
      ).catch((e) => e);

      expect(rejection).toBe(notFound);
    });

    it('wraps a non-NotFoundError fetch failure in ExperienceFetchError', async () => {
      const networkError = new Error('fetch failed: ECONNRESET');
      mockGet.mockRejectedValue(networkError);

      const rejection: unknown = await fetchExperience(
        experienceOptions,
        { accessToken: 'token-123' },
        resolveOptions
      ).catch((e) => e);

      expect(rejection).toBeInstanceOf(ExperienceFetchError);
      const error = rejection as ExperienceFetchError;
      expect(error.cause).toBe(networkError);
      expect(error.spaceId).toBe('space-1');
      expect(error.environmentId).toBe('master');
      expect(error.experienceId).toBe('exp-1');
      expect(error.message).toContain('ECONNRESET');
    });
  });
});

describe('fetchExperience — source map', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockPayload);
    mockGetWithOverrides.mockResolvedValue({
      ...mockPayload,
      extensions: { sourceMap: mockSourceMap },
    });
  });

  it('uses the plain GET and requests no source map by default', async () => {
    await fetchExperience(experienceOptions, { accessToken: 'token-123' }, resolveOptions);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGetWithOverrides).not.toHaveBeenCalled();
  });

  it.each([{}, { sourceMap: undefined }])(
    'uses the plain GET when no extension value is defined',
    async (extensions) => {
      await fetchExperience(
        { ...experienceOptions, extensions },
        { accessToken: 'token-123' },
        resolveOptions
      );

      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGetWithOverrides).not.toHaveBeenCalled();
    }
  );

  it('routes to getWithOverrides with the sourceMap extension when asked', async () => {
    await fetchExperience(
      { ...experienceOptions, locale: 'en-US', extensions: { sourceMap: {} } },
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockGetWithOverrides).toHaveBeenCalledWith('exp-1', {
      locale: 'en-US',
      extensions: { sourceMap: {} },
    });
  });

  it('hands the resolver the response with its source map, for the payload fallback', async () => {
    const { resolveExperience } = await import('@contentful/experiences-sdk-core');

    await fetchExperience(
      { ...experienceOptions, extensions: { sourceMap: {} } },
      { accessToken: 'token-123' },
      resolveOptions
    );

    const [payloadArg, , optionsArg] = vi.mocked(resolveExperience).mock.calls[0]!;
    expect(payloadArg.extensions?.sourceMap).toBe(mockSourceMap);
    expect(optionsArg).not.toHaveProperty('sourceMap');
  });

  it('hands the resolver the experience payload, with the source map routed separately', async () => {
    const { resolveExperience } = await import('@contentful/experiences-sdk-core');

    await fetchExperience(
      { ...experienceOptions, extensions: { sourceMap: {} } },
      { accessToken: 'token-123' },
      resolveOptions
    );

    const [payloadArg] = vi.mocked(resolveExperience).mock.calls[0]!;
    expect(payloadArg.nodes).toEqual(mockPayload.nodes);
  });
});

describe('fetchExperience — personalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockPayload);
    mockGetWithOverrides.mockResolvedValue(mockPayload);
  });

  it('rejects invalid personalization with a TypeError before calling Delivery', async () => {
    const rejection: unknown = await fetchExperience(
      {
        ...experienceOptions,
        personalization: { profileId: 123 } as unknown as PersonalizationOptions,
      },
      { accessToken: 'token-123' },
      resolveOptions
    ).catch((error) => error);

    expect(rejection).toBeInstanceOf(TypeError);
    expect(rejection).toMatchObject({
      message: 'Invalid Experience personalization options',
      cause: expect.anything(),
    });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockGetWithOverrides).not.toHaveBeenCalled();
  });

  it('wraps a personalized Delivery failure in ExperienceFetchError with its cause', async () => {
    const networkError = new Error('fetch failed: ECONNRESET');
    mockGetWithOverrides.mockRejectedValueOnce(networkError);

    const rejection: unknown = await fetchExperience(
      { ...experienceOptions, personalization },
      { accessToken: 'token-123' },
      resolveOptions
    ).catch((error) => error);

    expect(rejection).toBeInstanceOf(ExperienceFetchError);
    expect((rejection as ExperienceFetchError).cause).toBe(networkError);
  });

  it('preserves NotFoundError from a personalized Delivery request', async () => {
    const notFound = new ContentfulViewDelivery.NotFoundError('experience not found');
    mockGetWithOverrides.mockRejectedValueOnce(notFound);

    const rejection: unknown = await fetchExperience(
      { ...experienceOptions, personalization },
      { accessToken: 'token-123' },
      resolveOptions
    ).catch((error) => error);

    expect(rejection).toBe(notFound);
  });

  it('forwards personalization and source-map extensions together', async () => {
    await fetchExperience(
      { ...experienceOptions, personalization, extensions: { sourceMap: {} } },
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(mockGetWithOverrides).toHaveBeenCalledWith('exp-1', {
      locale: undefined,
      extensions: {
        personalization: { ...personalization, preflight: false },
        sourceMap: {},
      },
    });
  });
});

describe('fetchExperience — destinationId + nodeId', () => {
  const destinationOptions = {
    spaceId: 'space-1',
    destinationId: 'dest-1',
    nodeId: 'node-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveByNodeId.mockResolvedValue({
      experiences: [{ path: '/', experience: mockDestinationExperience }],
    });
  });

  it('calls client.destination.resolveByNodeId with spaceId, destinationId, nodeId', async () => {
    await fetchExperience(destinationOptions, { accessToken: 'token-123' }, resolveOptions);

    expect(mockResolveByNodeId).toHaveBeenCalledWith('dest-1', 'node-1');
    expect(mockResolveByNodeIdWithOverrides).not.toHaveBeenCalled();
  });

  it('resolves the first hydrated experience through resolveExperience and returns the plan', async () => {
    const { resolveExperience } = await import('@contentful/experiences-sdk-core');

    const result = await fetchExperience(
      destinationOptions,
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(resolveExperience).toHaveBeenCalledWith(
      mockDestinationExperience,
      resolveOptions.config,
      expect.anything()
    );
    expect(result).toEqual(mockPlan);
  });

  it('returns a redirect as a discriminated result, not a thrown error', async () => {
    mockResolveByNodeId.mockResolvedValue({ redirect: { path: '/new-path' } });
    const { resolveExperience } = await import('@contentful/experiences-sdk-core');

    const result = await fetchExperience(
      destinationOptions,
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(result).toEqual({ redirect: { path: '/new-path' } });
    expect(resolveExperience).not.toHaveBeenCalled();
  });

  it('propagates NotFoundError from the delivery client to the caller undisturbed', async () => {
    const notFound = new ContentfulViewDelivery.NotFoundError('destination not found');
    mockResolveByNodeId.mockRejectedValue(notFound);

    const rejection: unknown = await fetchExperience(
      destinationOptions,
      { accessToken: 'token-123' },
      resolveOptions
    ).catch((e) => e);

    expect(rejection).toBe(notFound);
  });

  it('wraps a non-NotFoundError resolution failure in ExperienceFetchError', async () => {
    const networkError = new Error('fetch failed: ECONNRESET');
    mockResolveByNodeId.mockRejectedValue(networkError);

    const rejection: unknown = await fetchExperience(
      destinationOptions,
      { accessToken: 'token-123' },
      resolveOptions
    ).catch((e) => e);

    expect(rejection).toBeInstanceOf(ExperienceFetchError);
    const error = rejection as ExperienceFetchError;
    expect(error.cause).toBe(networkError);
    expect(error.spaceId).toBe('space-1');
    expect(error.environmentId).toBeUndefined();
    expect(error.message).toContain('ECONNRESET');
  });

  it('throws ExperienceFetchError when the response has zero experiences and no redirect', async () => {
    mockResolveByNodeId.mockResolvedValue({ experiences: [] });

    const rejection: unknown = await fetchExperience(
      destinationOptions,
      { accessToken: 'token-123' },
      resolveOptions
    ).catch((e) => e);

    expect(rejection).toBeInstanceOf(ExperienceFetchError);
    expect((rejection as ExperienceFetchError).message).toContain('zero Experiences');
  });

  it('rejects extensions on destination-shaped options at compile time', () => {
    // @ts-expect-error — extensions is not a member of ByDestinationNodeIdExperienceOptions,
    // and TS cannot fall back to ByIdExperienceOptions here because destinationOptions'
    // required destinationId/nodeId aren't part of that member either — a real compile error.
    void fetchExperience(
      { ...destinationOptions, extensions: { sourceMap: {} } },
      { accessToken: 'token-123' },
      resolveOptions
    );
  });

  it('rejects mixing experienceId with destinationId at compile time', () => {
    // @ts-expect-error — experienceId and destinationId/nodeId belong to different
    // members of the ExperienceOptions union; no combination of extra keys satisfies both.
    void fetchExperience(
      { ...destinationOptions, experienceId: 'exp-1' },
      { accessToken: 'token-123' },
      resolveOptions
    );
  });
});

describe('fetchExperience — destinationId + path', () => {
  const destinationOptions = {
    spaceId: 'space-1',
    destinationId: 'dest-1',
    path: '/products',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveByPath.mockResolvedValue({
      experiences: [{ path: '/products', experience: mockDestinationExperience }],
    });
  });

  it('calls client.destination.resolveByPath with spaceId, destinationId, { path }', async () => {
    await fetchExperience(destinationOptions, { accessToken: 'token-123' }, resolveOptions);

    expect(mockResolveByPath).toHaveBeenCalledWith('dest-1', { path: '/products' });
    expect(mockResolveByPathWithOverrides).not.toHaveBeenCalled();
  });

  it('resolves the first hydrated experience through resolveExperience and returns the plan', async () => {
    const { resolveExperience } = await import('@contentful/experiences-sdk-core');

    const result = await fetchExperience(
      destinationOptions,
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(resolveExperience).toHaveBeenCalledWith(
      mockDestinationExperience,
      resolveOptions.config,
      expect.anything()
    );
    expect(result).toEqual(mockPlan);
  });

  it('returns a redirect as a discriminated result, not a thrown error', async () => {
    mockResolveByPath.mockResolvedValue({ redirect: { path: '/canonical-path' } });
    const { resolveExperience } = await import('@contentful/experiences-sdk-core');

    const result = await fetchExperience(
      destinationOptions,
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(result).toEqual({ redirect: { path: '/canonical-path' } });
    expect(resolveExperience).not.toHaveBeenCalled();
  });

  it('propagates NotFoundError from the delivery client to the caller undisturbed', async () => {
    const notFound = new ContentfulViewDelivery.NotFoundError('destination not found');
    mockResolveByPath.mockRejectedValue(notFound);

    const rejection: unknown = await fetchExperience(
      destinationOptions,
      { accessToken: 'token-123' },
      resolveOptions
    ).catch((e) => e);

    expect(rejection).toBe(notFound);
  });

  it('wraps a non-NotFoundError resolution failure in ExperienceFetchError', async () => {
    const networkError = new Error('fetch failed: ECONNRESET');
    mockResolveByPath.mockRejectedValue(networkError);

    const rejection: unknown = await fetchExperience(
      destinationOptions,
      { accessToken: 'token-123' },
      resolveOptions
    ).catch((e) => e);

    expect(rejection).toBeInstanceOf(ExperienceFetchError);
    const error = rejection as ExperienceFetchError;
    expect(error.cause).toBe(networkError);
    expect(error.spaceId).toBe('space-1');
    expect(error.environmentId).toBeUndefined();
    expect(error.message).toContain('ECONNRESET');
  });

  it('throws ExperienceFetchError when the response has zero experiences and no redirect', async () => {
    mockResolveByPath.mockResolvedValue({ experiences: [] });

    const rejection: unknown = await fetchExperience(
      destinationOptions,
      { accessToken: 'token-123' },
      resolveOptions
    ).catch((e) => e);

    expect(rejection).toBeInstanceOf(ExperienceFetchError);
    expect((rejection as ExperienceFetchError).message).toContain('zero Experiences');
  });

  it('rejects extensions on destination-shaped options at compile time', () => {
    // @ts-expect-error — extensions is not a member of ByDestinationPathExperienceOptions,
    // and TS cannot fall back to ByIdExperienceOptions here because destinationOptions'
    // required destinationId/path aren't part of that member either — a real compile error.
    void fetchExperience(
      { ...destinationOptions, extensions: { sourceMap: {} } },
      { accessToken: 'token-123' },
      resolveOptions
    );
  });

  it('rejects mixing experienceId with destinationId at compile time', () => {
    // @ts-expect-error — experienceId and destinationId/path belong to different
    // members of the ExperienceOptions union; no combination of extra keys satisfies both.
    void fetchExperience(
      { ...destinationOptions, experienceId: 'exp-1' },
      { accessToken: 'token-123' },
      resolveOptions
    );
  });
});

describe('fetchExperience — destination personalization', () => {
  const nodeOptions = { spaceId: 'space-1', destinationId: 'dest-1', nodeId: 'node-1' };
  const pathOptions = { spaceId: 'space-1', destinationId: 'dest-1', path: '/products' };
  const destinationResponse = {
    experiences: [{ path: '/', experience: mockDestinationExperience }],
  };
  const expectedExtensions = {
    personalization: { ...personalization, preflight: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveByNodeId.mockResolvedValue(destinationResponse);
    mockResolveByNodeIdWithOverrides.mockResolvedValue(destinationResponse);
    mockResolveByPath.mockResolvedValue(destinationResponse);
    mockResolveByPathWithOverrides.mockResolvedValue(destinationResponse);
  });

  it('routes node id to resolveByNodeIdWithOverrides with the personalization extension', async () => {
    await fetchExperience(
      { ...nodeOptions, personalization },
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(mockResolveByNodeId).not.toHaveBeenCalled();
    expect(mockResolveByNodeIdWithOverrides).toHaveBeenCalledWith('dest-1', 'node-1', {
      extensions: expectedExtensions,
    });
  });

  it('passes the personalization extension to resolveByPathWithOverrides', async () => {
    await fetchExperience(
      { ...pathOptions, personalization },
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(mockResolveByPath).not.toHaveBeenCalled();
    expect(mockResolveByPathWithOverrides).toHaveBeenCalledWith('dest-1', {
      path: '/products',
      extensions: expectedExtensions,
    });
  });

  it('rejects invalid personalization with a TypeError before calling Delivery', async () => {
    const rejection: unknown = await fetchExperience(
      {
        ...pathOptions,
        personalization: { profileId: 123 } as unknown as PersonalizationOptions,
      },
      { accessToken: 'token-123' },
      resolveOptions
    ).catch((error) => error);

    expect(rejection).toBeInstanceOf(TypeError);
    expect(mockResolveByPath).not.toHaveBeenCalled();
    expect(mockResolveByPathWithOverrides).not.toHaveBeenCalled();
  });

  it('returns a redirect unchanged for a personalized request', async () => {
    mockResolveByPathWithOverrides.mockResolvedValue({ redirect: { path: '/new-path' } });

    const result = await fetchExperience(
      { ...pathOptions, personalization: { profileId: 'profile-1' } },
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(result).toEqual({ redirect: { path: '/new-path' } });
  });
});

describe('fetchDestinationPayload', () => {
  const client = new ContentfulViewDeliveryClient({
    token: 'token-123',
    spaceId: 'space-1',
    environmentId: '',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveByPath.mockResolvedValue({
      experiences: [{ path: '/products', experience: mockDestinationExperience }],
    });
    mockResolveByNodeId.mockResolvedValue({
      experiences: [{ path: '/products', experience: mockDestinationExperience }],
    });
  });

  it('returns the hydrated payload, retaining the resolved Experience id, without resolving', async () => {
    const { resolveExperience } = await import('@contentful/experiences-sdk-core');
    const payload = await fetchDestinationPayload(
      { spaceId: 'space-1', destinationId: 'dest-1', path: '/products' },
      client
    );
    expect(payload).toBe(mockDestinationExperience);
    expect(isDestinationRedirect(payload)).toBe(false);
    expect((payload as { sys?: { id?: string } }).sys?.id).toBe('exp-2');
    expect(resolveExperience).not.toHaveBeenCalled();
  });

  it('distinguishes node and path selectors on the wire', async () => {
    await fetchDestinationPayload(
      { spaceId: 'space-1', destinationId: 'dest-1', nodeId: 'node-1' },
      client
    );
    expect(mockResolveByNodeId).toHaveBeenCalledWith('dest-1', 'node-1');
    expect(mockResolveByPath).not.toHaveBeenCalled();
  });

  it('returns redirects as values and propagates NotFoundError', async () => {
    mockResolveByPath.mockResolvedValueOnce({ redirect: { path: '/next' } });
    const redirect = await fetchDestinationPayload(
      { spaceId: 'space-1', destinationId: 'dest-1', path: '/old' },
      client
    );
    expect(isDestinationRedirect(redirect)).toBe(true);
    expect(redirect).toEqual({ redirect: { path: '/next' } });

    const notFound = new ContentfulViewDelivery.NotFoundError('missing');
    mockResolveByNodeId.mockRejectedValueOnce(notFound);
    await expect(
      fetchDestinationPayload(
        { spaceId: 'space-1', destinationId: 'dest-1', nodeId: 'missing' },
        client
      )
    ).rejects.toBe(notFound);
  });
});

describe('isDestinationRedirect', () => {
  it('accepts only a redirect record with a string path', () => {
    expect(isDestinationRedirect({ redirect: { path: '/a' } })).toBe(true);
    expect(isDestinationRedirect({ redirect: {} })).toBe(false);
    expect(isDestinationRedirect({ redirect: null })).toBe(false);
    expect(isDestinationRedirect({ nodes: [] })).toBe(false);
    expect(isDestinationRedirect(null)).toBe(false);
  });
});
