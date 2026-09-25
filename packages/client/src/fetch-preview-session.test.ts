import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { PreviewSessionFetchError } from './errors.js';
import { fetchPreviewSession, fetchPreviewSessionWithClient } from './fetch-preview-session.js';

const { mockClient, mockCreateClient, mockResolveExperience } = vi.hoisted(() => ({
  mockClient: { fetch: vi.fn() },
  mockCreateClient: vi.fn(),
  mockResolveExperience: vi.fn().mockResolvedValue({ viewports: [], nodes: [] }),
}));

// Keep the fixture assignable to the retained-client API without constructing
// a real delivery client or widening the production helper's parameter type.
const retainedClient: ContentfulViewDeliveryClient = Object.assign(
  Object.create(ContentfulViewDeliveryClient.prototype),
  { fetch: mockClient.fetch }
);

vi.mock('./create-client.js', () => ({ createClient: mockCreateClient }));
vi.mock('@contentful/experiences-sdk-core', () => ({
  createDebugLogger: vi.fn(() => ({ log: vi.fn(), lazy: vi.fn() })),
  isExperiencePayload: (value: unknown) =>
    typeof value === 'object' &&
    value !== null &&
    (value as { sys?: { type?: string } }).sys?.type === 'Experience',
  resolveExperience: mockResolveExperience,
}));

const options = { spaceId: 'space-1', environmentId: 'master', sessionId: 'session-1' };
const resolveOptions = { config: { components: {} }, metadata: { slug: 'home' }, debug: true };
const payload = { sys: { type: 'Experience' }, nodes: [] };
type FetchResponseFixture = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

const response = (body: unknown, status = 200): FetchResponseFixture => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('fetchPreviewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue(retainedClient);
    mockClient.fetch.mockResolvedValue(response(payload));
  });

  it('preserves the free-function client creation and fetch contract', async () => {
    await fetchPreviewSession(options, { previewToken: 'preview-token' }, resolveOptions);
    expect(mockCreateClient).toHaveBeenCalledWith({
      accessToken: 'preview-token',
      host: 'https://preview.xdn.contentful.com',
    });
    expect(mockClient.fetch).toHaveBeenCalledWith(
      '/spaces/space-1/environments/master/preview_sessions/session-1/experience'
    );
    expect(mockResolveExperience).toHaveBeenCalledWith(payload, resolveOptions.config, {
      metadata: resolveOptions.metadata,
      debug: true,
      initialViewportId: undefined,
    });
  });

  it('encodes resource resolution and accepts a retained client', async () => {
    await fetchPreviewSessionWithClient(
      { ...options, resourceResolution: 'a+b/=' },
      retainedClient,
      resolveOptions
    );
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockClient.fetch).toHaveBeenCalledWith(
      '/spaces/space-1/environments/master/preview_sessions/session-1/experience?resource_resolution=a%2Bb%2F%3D'
    );
  });

  it('preserves a 404 and wraps other failures with the exported class', async () => {
    mockClient.fetch.mockResolvedValue(response({}, 404));
    await expect(
      fetchPreviewSessionWithClient(options, retainedClient, resolveOptions)
    ).rejects.toMatchObject({ name: 'NotFoundError' });
    mockClient.fetch.mockRejectedValue(new Error('offline'));
    await expect(
      fetchPreviewSessionWithClient(options, retainedClient, resolveOptions)
    ).rejects.toBeInstanceOf(PreviewSessionFetchError);
  });

  it('does not wrap resolver failures as transport errors', async () => {
    mockResolveExperience.mockRejectedValueOnce(new Error('resolver failure'));

    await expect(
      fetchPreviewSessionWithClient(options, retainedClient, resolveOptions)
    ).rejects.toThrow('resolver failure');
  });
});
