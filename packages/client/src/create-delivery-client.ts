import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { createUserAgentHeaders, EXPERIENCES_CLIENT_SDK } from './user-agent.js';

/** Options for the legacy functional Delivery client constructor. */
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
  const { accessToken, host, headers, ...rest } = options;
  return new ContentfulViewDeliveryClient({
    ...rest,
    headers: { ...createUserAgentHeaders(EXPERIENCES_CLIENT_SDK), ...headers },
    token: accessToken,
    baseUrl: host,
  });
}
