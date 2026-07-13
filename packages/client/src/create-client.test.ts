import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { createClient } from './create-client.js';

vi.mock('@contentful/experience-delivery', () => ({
  ContentfulViewDeliveryClient: vi.fn().mockImplementation((options) => ({ _options: options })),
}));

describe('createClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps accessToken → token and passes host through as baseUrl', () => {
    createClient({ accessToken: 'token-123', host: 'https://preview.xdn.contentful.com' });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      token: 'token-123',
      baseUrl: 'https://preview.xdn.contentful.com',
    });
  });

  it('omits baseUrl when host is not provided', () => {
    createClient({ accessToken: 'token-123' });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
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
      headers: { 'x-custom': 'value' },
      timeoutInSeconds: 30,
      maxRetries: 5,
    });
  });

  it('returns a ContentfulViewDeliveryClient instance', () => {
    const client = createClient({ accessToken: 'token-123' });

    expect(client).toBeDefined();
    expect(ContentfulViewDeliveryClient).toHaveBeenCalledOnce();
  });
});
