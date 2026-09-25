import { describe, expect, it, vi } from 'vitest';

const { mockCreateClient, mockFetchExperience, mockFetchPreviewSession, mockResolveExperience } =
  vi.hoisted(() => ({
    mockCreateClient: vi.fn((source) => ({ source })),
    mockFetchExperience: vi.fn().mockResolvedValue({ nodes: [], viewports: [] }),
    mockFetchPreviewSession: vi.fn().mockResolvedValue({ nodes: [], viewports: [] }),
    mockResolveExperience: vi.fn().mockResolvedValue({ nodes: [], viewports: [] }),
  }));

vi.mock('./create-client.js', () => ({ createClient: mockCreateClient }));
vi.mock('./fetch-experience.js', () => ({ fetchExperience: mockFetchExperience }));
vi.mock('./fetch-preview-session.js', () => ({
  fetchPreviewSessionWithClient: mockFetchPreviewSession,
}));
vi.mock('@contentful/experiences-sdk-core', () => ({ resolveExperience: mockResolveExperience }));

import { ContentfulExperiences } from './contentful-experiences.js';

describe('ContentfulExperiences', () => {
  it('constructs each configured client once and applies resolve defaults without mutating locale', async () => {
    const runtime = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'env',
      locale: 'en-US',
      resolverConfig: { components: {} },
      delivery: { accessToken: 'delivery' },
      preview: { accessToken: 'preview' },
      resolveDefaults: { metadata: { site: 'main', shared: 'default' }, debug: true },
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
    await runtime.fetchExperience({ experienceId: 'exp', locale: 'de-DE', withSourceMap: true });
    expect(mockFetchExperience).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'de-DE', withSourceMap: true }),
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
    await runtime.fetchPreviewSession({ sessionId: 'session' });
    expect(mockFetchPreviewSession).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space', environmentId: 'env' }),
      preview,
      expect.anything()
    );
    const withoutPreview = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'env',
      resolverConfig: { components: {} },
      delivery: { client: delivery },
    });
    expect(() => withoutPreview.fetchExperience({ experienceId: 'exp', preview: true })).toThrow(
      'fetchExperience()'
    );
    expect(() => withoutPreview.fetchPreviewSession({ sessionId: 'session' })).toThrow(
      'fetchPreviewSession()'
    );
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
});
