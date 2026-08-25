import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContentfulViewDeliveryClient,
  ContentfulViewDelivery,
} from '@contentful/experience-delivery';
import { ExperienceFetchError } from './errors.js';
import { fetchExperience } from './fetch-experience.js';

const { mockGet, mockPayload, mockPlan } = vi.hoisted(() => {
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

  const mockGet = vi.fn().mockResolvedValue(mockPayload);

  return { mockGet, mockPayload, mockPlan };
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

describe('fetchExperience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockPayload);
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
