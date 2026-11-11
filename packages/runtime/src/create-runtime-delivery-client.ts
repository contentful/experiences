import { ContentfulViewDeliveryClient } from '@contentful/experiences-client';

type RuntimeDeliveryClientBaseOptions = Omit<
  ContentfulViewDeliveryClient.Options,
  'token' | 'baseUrl' | 'spaceId' | 'environmentId'
>;

/** Identity the runtime already owns (`Config.spaceId`/`environmentId`),
 * threaded in separately so callers don't repeat it in `delivery`/`preview` config. */
export type RuntimeDeliveryClientIdentity = {
  spaceId: string;
  environmentId: string;
};

/** Configuration for a Delivery or Preview client owned by a runtime. */
export type DeliveryClientOptions = RuntimeDeliveryClientBaseOptions &
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

/**
 * Constructs a runtime-owned client, disabling generated auth for a tokenless proxy.
 * `defaultHeaders` sit beneath any caller-configured `headers`.
 */
export function createRuntimeDeliveryClient(
  options: DeliveryClientOptions,
  identity: RuntimeDeliveryClientIdentity,
  defaultHost?: NonNullable<ContentfulViewDeliveryClient.Options['baseUrl']>,
  defaultHeaders?: Record<string, string>
): ContentfulViewDeliveryClient {
  const { accessToken, host, ...configured } = options;
  const rest =
    defaultHeaders === undefined
      ? configured
      : { ...configured, headers: { ...defaultHeaders, ...configured.headers } };
  if (accessToken === undefined && host === undefined) {
    throw new Error(
      'Runtime delivery configuration requires accessToken unless an explicit proxy host is provided'
    );
  }

  const baseUrl = host ?? (rest.environment === undefined ? defaultHost : undefined);
  const clientOptions =
    accessToken === undefined
      ? { ...rest, ...identity, auth: rest.auth ?? false, baseUrl }
      : { ...rest, ...identity, token: accessToken, baseUrl };

  return new ContentfulViewDeliveryClient(
    clientOptions as unknown as ContentfulViewDeliveryClient.Options
  );
}
