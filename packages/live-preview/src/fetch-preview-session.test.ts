import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@contentful/experiences-client';
import { PreviewSessionFetchError } from './errors.js';
import { fetchPreviewSession } from './fetch-preview-session.js';

const { mockClient, mockCreateClient, mockPlan, mockResolveExperience } = vi.hoisted(() => ({
  mockClient: { fetch: vi.fn() },
  mockCreateClient: vi.fn(),
  mockPlan: { viewports: [], nodes: [] },
  mockResolveExperience: vi.fn().mockResolvedValue({ viewports: [], nodes: [] }),
}));

vi.mock('@contentful/experiences-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@contentful/experiences-client')>()),
  createClient: mockCreateClient,
}));

vi.mock('@contentful/experiences-sdk-core', () => ({
  createDebugLogger: vi.fn(() => ({
    log: vi.fn(),
    lazy: vi.fn(),
    time: (_label: string, fn: () => Promise<unknown>) => fn(),
    enabled: false,
  })),
  resolveExperience: mockResolveExperience,
}));

const experienceOptions = {
  spaceId: 'space-1',
  environmentId: 'master',
  sessionId: 'session-1',
};

const resolveOptions = {
  config: { components: {} },
  metadata: { slug: 'home' },
  debug: true,
  initialViewportId: 'desktop',
};

const payload = {
  sys: { type: 'Experience' },
  viewports: [],
  nodes: [],
};

function response(body: unknown, status = 200): globalThis.Response {
  return new globalThis.Response(JSON.stringify(body), { status });
}

describe('fetchPreviewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue(mockClient);
    mockClient.fetch.mockResolvedValue(response(payload));
    mockResolveExperience.mockResolvedValue(mockPlan);
  });

  it('fetches the current Experience and resolves it', async () => {
    await expect(
      fetchPreviewSession(experienceOptions, { previewToken: 'preview-token' }, resolveOptions)
    ).resolves.toBe(mockPlan);

    expect(mockCreateClient).toHaveBeenCalledWith({
      accessToken: 'preview-token',
      host: 'https://preview.xdn.contentful.com',
    });
    expect(mockClient.fetch).toHaveBeenCalledWith(
      '/spaces/space-1/environments/master/preview_sessions/session-1/experience'
    );
    expect(mockResolveExperience).toHaveBeenCalledWith(payload, resolveOptions.config, {
      metadata: resolveOptions.metadata,
      debug: resolveOptions.debug,
      initialViewportId: resolveOptions.initialViewportId,
    });
  });

  it('uses the supplied host as the endpoint base URL', async () => {
    await fetchPreviewSession(
      experienceOptions,
      { previewToken: 'preview-token', host: 'https://session.example.test/base' },
      { config: { components: {} } }
    );

    expect(mockCreateClient).toHaveBeenCalledWith({
      accessToken: 'preview-token',
      host: 'https://session.example.test/base',
    });
    expect(mockClient.fetch).toHaveBeenCalledWith(
      '/spaces/space-1/environments/master/preview_sessions/session-1/experience'
    );
  });

  it('preserves NotFoundError for a missing session', async () => {
    mockClient.fetch.mockResolvedValue(response({ message: 'not found' }, 404));

    await expect(
      fetchPreviewSession(experienceOptions, { previewToken: 'preview-token' }, resolveOptions)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockResolveExperience).not.toHaveBeenCalled();
  });

  it('wraps HTTP failures in PreviewSessionFetchError', async () => {
    mockClient.fetch.mockResolvedValue(response({ message: 'unauthorized' }, 401));

    await expect(
      fetchPreviewSession(experienceOptions, { previewToken: 'preview-token' }, resolveOptions)
    ).rejects.toMatchObject({
      name: 'PreviewSessionFetchError',
      spaceId: 'space-1',
      environmentId: 'master',
      sessionId: 'session-1',
    });
  });

  it('wraps network failures in PreviewSessionFetchError', async () => {
    mockClient.fetch.mockRejectedValue(new Error('network failure'));

    await expect(
      fetchPreviewSession(experienceOptions, { previewToken: 'preview-token' }, resolveOptions)
    ).rejects.toBeInstanceOf(PreviewSessionFetchError);
  });

  it.each([
    new globalThis.Response('not json'),
    response({ sys: { type: 'Experience' }, nodes: [] }),
    response({ sys: { type: 'ExperienceFragment' }, viewports: [], nodes: [] }),
  ])('rejects a malformed Experience response', async (invalidResponse) => {
    mockClient.fetch.mockResolvedValue(invalidResponse);

    await expect(
      fetchPreviewSession(experienceOptions, { previewToken: 'preview-token' }, resolveOptions)
    ).rejects.toBeInstanceOf(PreviewSessionFetchError);
    expect(mockResolveExperience).not.toHaveBeenCalled();
  });
});
