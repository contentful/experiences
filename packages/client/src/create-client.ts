import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';

export type CreateClientOptions = {
  accessToken: string;
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
