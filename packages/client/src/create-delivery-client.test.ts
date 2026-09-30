import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { createClient, createRuntimeDeliveryClient } from './create-delivery-client.js';
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

describe('createRuntimeDeliveryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves token and host suppliers for direct API access', () => {
    const accessToken = async () => 'token-123';
    const host = () => 'https://delivery.example';

    createRuntimeDeliveryClient({ accessToken, host });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      token: accessToken,
      baseUrl: host,
    });
  });

  it('disables generated authentication when a proxy host owns the token', () => {
    createRuntimeDeliveryClient({ host: 'https://application.example/experience-proxy' });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      auth: false,
      baseUrl: 'https://application.example/experience-proxy',
    });
  });

  it('preserves a custom authentication provider in proxy mode', () => {
    const auth = vi.fn().mockResolvedValue({ headers: { 'x-proxy-auth': 'value' } });

    createRuntimeDeliveryClient({
      host: 'https://application.example/experience-proxy',
      auth,
    });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      auth,
      baseUrl: 'https://application.example/experience-proxy',
    });
  });

  it('uses the preview default only when host and generated environment are absent', () => {
    createRuntimeDeliveryClient({ accessToken: 'preview-token' }, PREVIEW_HOST);
    createRuntimeDeliveryClient(
      { accessToken: 'preview-token', environment: 'https://environment.example' },
      PREVIEW_HOST
    );

    expect(ContentfulViewDeliveryClient).toHaveBeenNthCalledWith(1, {
      token: 'preview-token',
      baseUrl: PREVIEW_HOST,
    });
    expect(ContentfulViewDeliveryClient).toHaveBeenNthCalledWith(2, {
      token: 'preview-token',
      environment: 'https://environment.example',
      baseUrl: undefined,
    });
  });

  it('rejects missing token and proxy host at runtime', () => {
    expect(() => createRuntimeDeliveryClient({} as never)).toThrow(
      'requires accessToken unless an explicit proxy host is provided'
    );
    expect(ContentfulViewDeliveryClient).not.toHaveBeenCalled();
  });
});
