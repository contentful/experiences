import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { fetchExperience } from './fetch-experience.js';

const { mockGetExperience, mockPayload, mockPlan } = vi.hoisted(() => {
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

  const mockGetExperience = vi.fn().mockResolvedValue(mockPayload);

  return { mockGetExperience, mockPayload, mockPlan };
});

vi.mock('@contentful/experiences-core', () => ({
  resolveExperience: vi.fn().mockResolvedValue(mockPlan),
}));

vi.mock('@contentful/experience-delivery', () => ({
  ContentfulViewDeliveryClient: vi.fn().mockImplementation(() => ({
    view: {
      getExperience: mockGetExperience,
    },
  })),
}));

const baseOptions = {
  spaceId: 'space-1',
  environmentId: 'master',
  experienceId: 'exp-1',
  config: { components: {} },
};

describe('fetchExperience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetExperience.mockResolvedValue(mockPayload);
  });

  describe('inline credentials', () => {
    it('constructs client with XDN base URL by default', async () => {
      await fetchExperience({ ...baseOptions, accessToken: 'token-123' });

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
        token: 'token-123',
        baseUrl: 'https://xdn.contentful.com',
      });
    });

    it('constructs client with XPA base URL when preview is true', async () => {
      await fetchExperience({ ...baseOptions, accessToken: 'token-123', preview: true });

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
        token: 'token-123',
        baseUrl: 'https://preview.xdn.contentful.com',
      });
    });

    it('calls getExperience with spaceId, environmentId, experienceId, locale', async () => {
      await fetchExperience({ ...baseOptions, accessToken: 'token-123', locale: 'en-US' });

      expect(mockGetExperience).toHaveBeenCalledWith('space-1', 'master', 'exp-1', {
        locale: 'en-US',
      });
    });
  });

  describe('pre-created client', () => {
    it('uses provided client directly without constructing a new one', async () => {
      const client = new ContentfulViewDeliveryClient({ token: 'token-123' });
      vi.mocked(ContentfulViewDeliveryClient).mockClear();

      await fetchExperience({ ...baseOptions, client });

      expect(ContentfulViewDeliveryClient).not.toHaveBeenCalled();
      expect(mockGetExperience).toHaveBeenCalledWith('space-1', 'master', 'exp-1', {
        locale: undefined,
      });
    });
  });

  describe('return value', () => {
    it('returns null when payload has no nodes', async () => {
      mockGetExperience.mockResolvedValue({ ...mockPayload, nodes: [] });

      const result = await fetchExperience({ ...baseOptions, accessToken: 'token-123' });

      expect(result).toBeNull();
    });

    it('returns resolved PortableRenderPlan on success', async () => {
      const result = await fetchExperience({ ...baseOptions, accessToken: 'token-123' });

      expect(result).toEqual(mockPlan);
    });
  });
});
