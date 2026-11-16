import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentfulViewDeliveryClient, PREVIEW_HOST } from '@contentful/experiences-client';
import { createDeliveryClient } from './create-delivery-client.js';

vi.mock('@contentful/experiences-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@contentful/experiences-client')>()),
  ContentfulViewDeliveryClient: vi.fn().mockImplementation((options) => ({ _options: options })),
}));

const identity = { spaceId: 'space-1', environmentId: 'master' };

describe('createDeliveryClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves token and host suppliers for direct API access', () => {
    const accessToken = async () => 'token-123';
    const host = () => 'https://delivery.example';
    createDeliveryClient({ accessToken, host }, identity);
    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      token: accessToken,
      baseUrl: host,
      ...identity,
    });
  });

  it('disables generated authentication when a proxy host owns the token', () => {
    createDeliveryClient({ host: 'https://application.example/experience-proxy' }, identity);
    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      auth: false,
      baseUrl: 'https://application.example/experience-proxy',
      ...identity,
    });
  });

  it('preserves a custom authentication provider in proxy mode', () => {
    const auth = vi.fn().mockResolvedValue({ headers: { 'x-proxy-auth': 'value' } });
    createDeliveryClient({ host: 'https://application.example/experience-proxy', auth }, identity);
    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      auth,
      baseUrl: 'https://application.example/experience-proxy',
      ...identity,
    });
  });

  it('uses the preview default only when host and generated environment are absent', () => {
    createDeliveryClient({ accessToken: 'preview-token' }, identity, PREVIEW_HOST);
    createDeliveryClient(
      { accessToken: 'preview-token', environment: 'https://environment.example' },
      identity,
      PREVIEW_HOST
    );
    expect(ContentfulViewDeliveryClient).toHaveBeenNthCalledWith(1, {
      token: 'preview-token',
      baseUrl: PREVIEW_HOST,
      ...identity,
    });
    expect(ContentfulViewDeliveryClient).toHaveBeenNthCalledWith(2, {
      token: 'preview-token',
      environment: 'https://environment.example',
      baseUrl: undefined,
      ...identity,
    });
  });

  it('layers default headers beneath caller headers', () => {
    createDeliveryClient(
      {
        accessToken: 'token-123',
        headers: { 'x-custom': 'value', 'x-shared': 'caller' },
      },
      identity,
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
      ...identity,
    });
  });

  it('rejects missing token and proxy host at runtime', () => {
    expect(() => createDeliveryClient({} as never, identity)).toThrow(
      'requires accessToken unless an explicit proxy host is provided'
    );
    expect(ContentfulViewDeliveryClient).not.toHaveBeenCalled();
  });
});
