import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { fetchExperience } from './fetch-experience.js';

const { mockGet, mockGetWithOverrides, mockPayload, mockPlan, mockSourceMap } = vi.hoisted(() => {
  const mockPayload = {
    sys: { id: 'exp-1' },
    viewports: [{ id: 'default', query: '*' }],
    nodes: [{ sys: { urn: 'urn:ctfl:component:hero' }, content: {}, design: {}, slots: {} }],
    errors: [],
  };

  const mockPlan = {
    viewports: mockPayload.viewports,
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

  return { mockGet, mockGetWithOverrides, mockPayload, mockPlan, mockSourceMap };
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

vi.mock('@contentful/experience-delivery', () => ({
  ContentfulViewDeliveryClient: vi.fn().mockImplementation(() => ({
    experience: {
      get: mockGet,
      getWithOverrides: mockGetWithOverrides,
    },
  })),
}));

const experienceOptions = {
  spaceId: 'space-1',
  environmentId: 'master',
  experienceId: 'exp-1',
};

const resolveOptions = {
  config: { components: {} },
};

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

      expect(mockGet).toHaveBeenCalledWith('space-1', 'master', 'exp-1', { locale: 'en-US' });
    });
  });

  describe('pre-created client', () => {
    it('uses provided client directly without constructing a new one', async () => {
      const client = new ContentfulViewDeliveryClient({ token: 'token-123' });
      vi.mocked(ContentfulViewDeliveryClient).mockClear();

      await fetchExperience(experienceOptions, { client }, resolveOptions);

      expect(ContentfulViewDeliveryClient).not.toHaveBeenCalled();
      expect(mockGet).toHaveBeenCalledWith('space-1', 'master', 'exp-1', { locale: undefined });
    });

    it('ignores the preview flag when a pre-made client is provided', async () => {
      const client = new ContentfulViewDeliveryClient({ token: 'token-123' });
      vi.mocked(ContentfulViewDeliveryClient).mockClear();

      await fetchExperience(experienceOptions, { client, preview: true }, resolveOptions);

      expect(ContentfulViewDeliveryClient).not.toHaveBeenCalled();
    });

    // The alpha-feature header that selects the ExO entity shapes this SDK reads
    // is sent by the delivery client itself as of 1.0.0-dev.7, so a
    // caller-supplied client is covered without us passing request options.
    it('sends no request options of its own', async () => {
      const client = new ContentfulViewDeliveryClient({ token: 'token-123' });

      await fetchExperience(experienceOptions, { client }, resolveOptions);

      expect(mockGet).toHaveBeenCalledWith('space-1', 'master', 'exp-1', { locale: undefined });
    });
  });

  describe('preview toggle', () => {
    it('uses accessToken and default host when preview is unset', async () => {
      await fetchExperience(
        experienceOptions,
        { accessToken: 'delivery-token', previewToken: 'preview-token' },
        resolveOptions
      );

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'delivery-token', baseUrl: undefined })
      );
    });

    it('uses accessToken and default host when preview is explicitly false', async () => {
      await fetchExperience(
        experienceOptions,
        {
          accessToken: 'delivery-token',
          previewToken: 'preview-token',
          preview: false,
        },
        resolveOptions
      );

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'delivery-token', baseUrl: undefined })
      );
    });

    it('uses previewToken and the preview host when preview is true', async () => {
      await fetchExperience(
        experienceOptions,
        {
          accessToken: 'delivery-token',
          previewToken: 'preview-token',
          preview: true,
        },
        resolveOptions
      );

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'preview-token',
          baseUrl: 'https://preview.xdn.contentful.com',
        })
      );
    });

    it('throws when preview is true but previewToken is missing', async () => {
      await expect(
        fetchExperience(
          experienceOptions,
          { accessToken: 'delivery-token', preview: true },
          resolveOptions
        )
      ).rejects.toThrow(
        'fetchExperience() called with preview: true but no previewToken was provided'
      );
    });

    it('uses an explicit custom host with the preview token when preview is true', async () => {
      await fetchExperience(
        experienceOptions,
        {
          accessToken: 'delivery-token',
          previewToken: 'preview-token',
          preview: true,
          host: 'https://preview-staging.example.com',
        },
        resolveOptions
      );

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'preview-token',
          baseUrl: 'https://preview-staging.example.com',
        })
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

    it('propagates NotFoundError from the delivery client to the caller', async () => {
      class MockNotFoundError extends Error {}
      mockGet.mockRejectedValue(new MockNotFoundError('experience not found'));

      await expect(
        fetchExperience(experienceOptions, { accessToken: 'token-123' }, resolveOptions)
      ).rejects.toThrow('experience not found');
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

  it('routes to getWithOverrides with the sourceMap extension when asked', async () => {
    await fetchExperience(
      { ...experienceOptions, locale: 'en-US', withSourceMap: true },
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockGetWithOverrides).toHaveBeenCalledWith('space-1', 'master', 'exp-1', {
      locale: 'en-US',
      extensions: { sourceMap: {} },
    });
  });

  it('forwards the response source map to resolveExperience', async () => {
    const { resolveExperience } = await import('@contentful/experiences-sdk-core');

    await fetchExperience(
      { ...experienceOptions, withSourceMap: true },
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(resolveExperience).toHaveBeenCalledWith(
      expect.anything(),
      resolveOptions.config,
      expect.objectContaining({ sourceMap: mockSourceMap })
    );
  });

  it('forwards no source map when the flag is off, even if the response carries one', async () => {
    // Guards against a stray `extensions.sourceMap` (a caller-supplied client
    // configured elsewhere, say) leaking onto the plan unasked.
    mockGet.mockResolvedValue({ ...mockPayload, extensions: { sourceMap: mockSourceMap } });
    const { resolveExperience } = await import('@contentful/experiences-sdk-core');

    await fetchExperience(experienceOptions, { accessToken: 'token-123' }, resolveOptions);

    expect(resolveExperience).toHaveBeenCalledWith(
      expect.anything(),
      resolveOptions.config,
      expect.objectContaining({ sourceMap: undefined })
    );
  });

  it('tolerates a requested source map the API did not return', async () => {
    mockGetWithOverrides.mockResolvedValue({ ...mockPayload, extensions: {} });
    const { resolveExperience } = await import('@contentful/experiences-sdk-core');

    await fetchExperience(
      { ...experienceOptions, withSourceMap: true },
      { accessToken: 'token-123' },
      resolveOptions
    );

    expect(resolveExperience).toHaveBeenCalledWith(
      expect.anything(),
      resolveOptions.config,
      expect.objectContaining({ sourceMap: undefined })
    );
  });

  it('hands the resolver the experience payload, with the source map routed separately', async () => {
    const { resolveExperience } = await import('@contentful/experiences-sdk-core');

    await fetchExperience(
      { ...experienceOptions, withSourceMap: true },
      { accessToken: 'token-123' },
      resolveOptions
    );

    // `extensions` stays on the object (the narrowing is type-level, not a copy),
    // but the resolver ignores it — what matters is that the source map reaches
    // the plan through the dedicated option rather than by accident.
    const [payloadArg] = vi.mocked(resolveExperience).mock.calls[0];
    expect(payloadArg.nodes).toEqual(mockPayload.nodes);
    expect(payloadArg.viewports).toEqual(mockPayload.viewports);
  });
});
