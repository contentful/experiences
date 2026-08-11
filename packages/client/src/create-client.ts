import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';

export type CreateClientOptions = {
  accessToken: string;
  /**
   * Base URL for the delivery client. Defaults to `DELIVERY_HOST` when omitted.
   * Pass `PREVIEW_HOST` for preview mode, or any custom URL (staging, proxy,
   * per-region). Both constants are exported from this package.
   */
  host?: string;
} & Omit<ContentfulViewDeliveryClient.Options, 'token' | 'baseUrl'>;

export function createClient(options: CreateClientOptions): ContentfulViewDeliveryClient {
  const { accessToken, host, ...rest } = options;
  return new ContentfulViewDeliveryClient({
    ...rest,
    token: accessToken,
    baseUrl: host,
  });
}
