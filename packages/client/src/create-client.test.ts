import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { createClient } from './create-client.js';
import { DELIVERY_HOST, PREVIEW_HOST } from './hosts.js';

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

  it('accepts PREVIEW_HOST as host and forwards it as baseUrl', () => {
    createClient({ accessToken: 'preview-token', host: PREVIEW_HOST });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      token: 'preview-token',
      baseUrl: 'https://preview.xdn.contentful.com',
    });
  });

  it('accepts DELIVERY_HOST as host and forwards it as baseUrl', () => {
    createClient({ accessToken: 'delivery-token', host: DELIVERY_HOST });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      token: 'delivery-token',
      baseUrl: 'https://xdn.contentful.com',
    });
  });

  // The delivery client sets `x-contentful-enable-alpha-feature` itself as of
  // 1.0.0-dev.7, so we deliberately send no headers of our own. Re-adding one
  // here would also be futile: the client re-applies its own default *after*
  // client-level `headers`, so only per-request `headers` can override it.
  it('sets no headers of its own', () => {
    createClient({ accessToken: 'token-123' });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith(
      expect.not.objectContaining({ headers: expect.anything() })
    );
  });
});
