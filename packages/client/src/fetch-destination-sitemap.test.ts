import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContentfulViewDeliveryClient,
  ContentfulViewDelivery,
} from '@contentful/experience-delivery';
import { DestinationPreviewNotSupportedError, ExperienceFetchError } from './errors.js';
import { fetchDestinationSitemap } from './fetch-destination-sitemap.js';

const { mockSitemap, mockSitemapPage } = vi.hoisted(() => {
  const mockSitemapPage = {
    paths: {
      sys: { type: 'Array' as const },
      limit: 100,
      items: [
        {
          sys: { type: 'DestinationExperienceNode' },
          path: '/products',
          experienceUrn:
            'crn:contentful:::experience:spaces/$self/environments/$self/experiences/exp-1',
        },
        {
          sys: { type: 'DestinationExperienceNode' },
          path: '/about',
          experienceUrn:
            'crn:contentful:::experience:spaces/$self/environments/$self/experiences/exp-2',
        },
      ],
      pages: { next: 'next-cursor' },
    },
  };

  const mockSitemap = vi.fn().mockResolvedValue(mockSitemapPage);

  return { mockSitemap, mockSitemapPage };
});

vi.mock('@contentful/experiences-sdk-core', () => ({
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
      destination: {
        sitemap: mockSitemap,
      },
    })),
    ContentfulViewDelivery: { NotFoundError },
  };
});

const destinationOptions = {
  spaceId: 'space-1',
  destinationId: 'dest-1',
};

describe('fetchDestinationSitemap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSitemap.mockResolvedValue(mockSitemapPage);
  });

  it('calls client.destination.sitemap with spaceId and destinationId', async () => {
    await fetchDestinationSitemap(destinationOptions, { accessToken: 'token-123' });

    expect(mockSitemap).toHaveBeenCalledWith('space-1', 'dest-1', {
      limit: undefined,
      pageNext: undefined,
      pagePrev: undefined,
    });
  });

  it('passes pagination options through to client.destination.sitemap', async () => {
    await fetchDestinationSitemap(
      destinationOptions,
      { accessToken: 'token-123' },
      {
        limit: 50,
        pageNext: 'cursor-a',
      }
    );

    expect(mockSitemap).toHaveBeenCalledWith('space-1', 'dest-1', {
      limit: 50,
      pageNext: 'cursor-a',
      pagePrev: undefined,
    });
  });

  it('translates experienceUrn to experienceId and passes through path/type/limit/pages', async () => {
    const result = await fetchDestinationSitemap(destinationOptions, { accessToken: 'token-123' });

    expect(result).toEqual({
      items: [
        { path: '/products', experienceId: 'exp-1', type: 'DestinationExperienceNode' },
        { path: '/about', experienceId: 'exp-2', type: 'DestinationExperienceNode' },
      ],
      limit: 100,
      pages: { next: 'next-cursor' },
    });
  });

  it('uses the provided client directly without constructing a new one', async () => {
    const client = new ContentfulViewDeliveryClient({ token: 'token-123' });
    vi.mocked(ContentfulViewDeliveryClient).mockClear();

    await fetchDestinationSitemap(destinationOptions, { client });

    expect(ContentfulViewDeliveryClient).not.toHaveBeenCalled();
    expect(mockSitemap).toHaveBeenCalledWith('space-1', 'dest-1', {
      limit: undefined,
      pageNext: undefined,
      pagePrev: undefined,
    });
  });

  it('throws DestinationPreviewNotSupportedError when preview is true, before any network call', async () => {
    const rejection: unknown = await fetchDestinationSitemap(destinationOptions, {
      accessToken: 'delivery-token',
      previewToken: 'preview-token',
      preview: true,
    }).catch((e) => e);

    expect(rejection).toBeInstanceOf(DestinationPreviewNotSupportedError);
    const error = rejection as DestinationPreviewNotSupportedError;
    expect(error.spaceId).toBe('space-1');
    expect(error.destinationId).toBe('dest-1');
    expect(mockSitemap).not.toHaveBeenCalled();
    expect(ContentfulViewDeliveryClient).not.toHaveBeenCalled();
  });

  it('does not guard preview when a pre-made client is provided', async () => {
    const client = new ContentfulViewDeliveryClient({ token: 'preview-token' });
    vi.mocked(ContentfulViewDeliveryClient).mockClear();

    await fetchDestinationSitemap(destinationOptions, { client, preview: true });

    expect(mockSitemap).toHaveBeenCalledWith('space-1', 'dest-1', {
      limit: undefined,
      pageNext: undefined,
      pagePrev: undefined,
    });
  });

  it('propagates NotFoundError from the delivery client to the caller undisturbed', async () => {
    const notFound = new ContentfulViewDelivery.NotFoundError('destination not found');
    mockSitemap.mockRejectedValue(notFound);

    const rejection: unknown = await fetchDestinationSitemap(destinationOptions, {
      accessToken: 'token-123',
    }).catch((e) => e);

    expect(rejection).toBe(notFound);
  });

  it('wraps a non-NotFoundError fetch failure in ExperienceFetchError', async () => {
    const networkError = new Error('fetch failed: ECONNRESET');
    mockSitemap.mockRejectedValue(networkError);

    const rejection: unknown = await fetchDestinationSitemap(destinationOptions, {
      accessToken: 'token-123',
    }).catch((e) => e);

    expect(rejection).toBeInstanceOf(ExperienceFetchError);
    const error = rejection as ExperienceFetchError;
    expect(error.cause).toBe(networkError);
    expect(error.spaceId).toBe('space-1');
    expect(error.message).toContain('ECONNRESET');
  });
});
