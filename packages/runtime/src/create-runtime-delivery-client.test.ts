import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentfulViewDeliveryClient, PREVIEW_HOST } from '@contentful/experiences-client';
import { createRuntimeDeliveryClient } from './create-runtime-delivery-client.js';

vi.mock('@contentful/experiences-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@contentful/experiences-client')>()),
  ContentfulViewDeliveryClient: vi.fn().mockImplementation((options) => ({ _options: options })),
}));

describe('createRuntimeDeliveryClient', () => {
  beforeEach(() => vi.clearAllMocks());

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
    createRuntimeDeliveryClient({ host: 'https://application.example/experience-proxy', auth });
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

  it('layers default headers beneath caller headers', () => {
    createRuntimeDeliveryClient(
      { accessToken: 'token-123', headers: { 'x-custom': 'value', 'x-shared': 'caller' } },
      undefined,
      { 'X-Contentful-User-Agent': 'sdk experiences-node/0.6.0;', 'x-shared': 'default' }
    );
    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      token: 'token-123',
      baseUrl: undefined,
      headers: {
        'X-Contentful-User-Agent': 'sdk experiences-node/0.6.0;',
        'x-custom': 'value',
        'x-shared': 'caller',
      },
    });
  });

  it('rejects missing token and proxy host at runtime', () => {
    expect(() => createRuntimeDeliveryClient({} as never)).toThrow(
      'requires accessToken unless an explicit proxy host is provided'
    );
    expect(ContentfulViewDeliveryClient).not.toHaveBeenCalled();
  });
});
