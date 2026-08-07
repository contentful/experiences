import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { createClient } from './create-client.js';
import { NEW_EXO_ENTITY_TYPES_HEADERS } from './alpha-feature.js';
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
      headers: NEW_EXO_ENTITY_TYPES_HEADERS,
    });
  });

  it('omits baseUrl when host is not provided', () => {
    createClient({ accessToken: 'token-123' });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      token: 'token-123',
      baseUrl: undefined,
      headers: NEW_EXO_ENTITY_TYPES_HEADERS,
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
      headers: { ...NEW_EXO_ENTITY_TYPES_HEADERS, 'x-custom': 'value' },
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
      headers: NEW_EXO_ENTITY_TYPES_HEADERS,
    });
  });

  it('accepts DELIVERY_HOST as host and forwards it as baseUrl', () => {
    createClient({ accessToken: 'delivery-token', host: DELIVERY_HOST });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith({
      token: 'delivery-token',
      baseUrl: 'https://xdn.contentful.com',
      headers: NEW_EXO_ENTITY_TYPES_HEADERS,
    });
  });

  it('selects the ExO entity types this SDK reads by default', () => {
    createClient({ accessToken: 'token-123' });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'x-contentful-enable-alpha-feature': 'new-exo-entity-types' },
      })
    );
  });

  it('lets a caller-supplied alpha-feature header win over the default', () => {
    createClient({
      accessToken: 'token-123',
      headers: { 'x-contentful-enable-alpha-feature': 'something-else' },
    });

    expect(ContentfulViewDeliveryClient).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'x-contentful-enable-alpha-feature': 'something-else' },
      })
    );
  });
});
