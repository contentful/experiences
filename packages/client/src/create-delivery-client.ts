import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';

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

type RuntimeDeliveryClientBaseOptions = Omit<
  ContentfulViewDeliveryClient.Options,
  'token' | 'baseUrl'
>;

/** Configuration for a Delivery or Preview client owned by a runtime. */
export type RuntimeDeliveryClientOptions = RuntimeDeliveryClientBaseOptions &
  (
    | {
        /** Bearer token or token supplier used for direct Delivery/Preview API access. */
        accessToken: ContentfulViewDeliveryClient.Options['token'];
        /** Optional endpoint override or endpoint supplier. */
        host?: ContentfulViewDeliveryClient.Options['baseUrl'];
      }
    | {
        accessToken?: never;
        /** Explicit proxy endpoint that owns upstream authentication. */
        host: NonNullable<ContentfulViewDeliveryClient.Options['baseUrl']>;
      }
  );

export function createClient(options: CreateClientOptions): ContentfulViewDeliveryClient {
  const { accessToken, host, ...rest } = options;
  return new ContentfulViewDeliveryClient({
    ...rest,
    token: accessToken,
    baseUrl: host,
  });
}

/** Constructs a runtime-owned client, disabling generated auth for a tokenless proxy. */
export function createRuntimeDeliveryClient(
  options: RuntimeDeliveryClientOptions,
  defaultHost?: NonNullable<ContentfulViewDeliveryClient.Options['baseUrl']>
): ContentfulViewDeliveryClient {
  const { accessToken, host, ...rest } = options;
  if (accessToken === undefined && host === undefined) {
    throw new Error(
      'Runtime delivery configuration requires accessToken unless an explicit proxy host is provided'
    );
  }

  const baseUrl = host ?? (rest.environment === undefined ? defaultHost : undefined);
  const clientOptions =
    accessToken === undefined
      ? { ...rest, auth: rest.auth ?? false, baseUrl }
      : { ...rest, token: accessToken, baseUrl };

  return new ContentfulViewDeliveryClient(
    clientOptions as unknown as ContentfulViewDeliveryClient.Options
  );
}
