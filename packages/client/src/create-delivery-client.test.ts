import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { createClient } from './create-delivery-client.js';

const userAgentHeaders = {
  'X-Contentful-User-Agent': expect.stringMatching(/^sdk experiences-client\/0\.0\.0; platform /),
};

vi.mock('@contentful/experience-delivery', () => ({
  ContentfulViewDeliveryClient: vi.fn().mockImplementation((options) => ({ _options: options })),
}));

describe('createClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps accessToken → token and passes host through as baseUrl', () => {
    const client = createClient({
      accessToken: 'token-123',
      host: 'https://preview.xdn.contentful.com',
    });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      headers: userAgentHeaders,
      token: 'token-123',
      baseUrl: 'https://preview.xdn.contentful.com',
    });
    expect(client).toBe(vi.mocked(ContentfulViewDeliveryClient).mock.results[0]?.value);
  });

  it('omits baseUrl when host is not provided', () => {
    createClient({ accessToken: 'token-123' });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      headers: userAgentHeaders,
      token: 'token-123',
      baseUrl: undefined,
    });
  });

  it('passes through additional client options', () => {
    createClient({
      accessToken: 'token-123',
      host: 'https://xdn.contentful.com',
      headers: { 'x-custom': 'value' },
      timeoutInSeconds: 30,
      maxRetries: 5,
    });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      token: 'token-123',
      baseUrl: 'https://xdn.contentful.com',
      headers: { ...userAgentHeaders, 'x-custom': 'value' },
      timeoutInSeconds: 30,
      maxRetries: 5,
    });
  });

  it('lets caller headers override the user-agent header', () => {
    createClient({
      accessToken: 'token-123',
      headers: { 'X-Contentful-User-Agent': 'custom' },
    });

    expect(vi.mocked(ContentfulViewDeliveryClient).mock.calls[0]?.[0].headers).toEqual({
      'X-Contentful-User-Agent': 'custom',
    });
  });
});
