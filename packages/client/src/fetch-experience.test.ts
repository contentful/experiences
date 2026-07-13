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
    mockGetExperience.mockResolvedValue(mockPayload);
  });

  describe('inline credentials', () => {
    it('constructs client without baseUrl when host is not provided', async () => {
      await fetchExperience(experienceOptions, { accessToken: 'token-123' }, resolveOptions);

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
        token: 'token-123',
        baseUrl: undefined,
      });
    });

    it('constructs client with provided host', async () => {
      await fetchExperience(
        experienceOptions,
        { accessToken: 'token-123', host: 'https://preview.xdn.contentful.com' },
        resolveOptions
      );

      expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
        token: 'token-123',
        baseUrl: 'https://preview.xdn.contentful.com',
      });
    });

    it('calls getExperience with spaceId, environmentId, experienceId, locale', async () => {
      await fetchExperience(
        { ...experienceOptions, locale: 'en-US' },
        { accessToken: 'token-123' },
        resolveOptions
      );

      expect(mockGetExperience).toHaveBeenCalledWith('space-1', 'master', 'exp-1', {
        locale: 'en-US',
      });
    });
  });

  describe('pre-created client', () => {
    it('uses provided client directly without constructing a new one', async () => {
      const client = new ContentfulViewDeliveryClient({ token: 'token-123' });
      vi.mocked(ContentfulViewDeliveryClient).mockClear();

      await fetchExperience(experienceOptions, { client }, resolveOptions);

      expect(ContentfulViewDeliveryClient).not.toHaveBeenCalled();
      expect(mockGetExperience).toHaveBeenCalledWith('space-1', 'master', 'exp-1', {
        locale: undefined,
      });
    });
  });

  describe('return value', () => {
    it('returns null when payload has no nodes', async () => {
      mockGetExperience.mockResolvedValue({ ...mockPayload, nodes: [] });

      const result = await fetchExperience(
        experienceOptions,
        { accessToken: 'token-123' },
        resolveOptions
      );

      expect(result).toBeNull();
    });

    it('returns resolved PortableRenderPlan on success', async () => {
      const result = await fetchExperience(
        experienceOptions,
        { accessToken: 'token-123' },
        resolveOptions
      );

      expect(result).toEqual(mockPlan);
    });
  });
});
