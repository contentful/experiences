import type { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { createClient } from './create-delivery-client.js';
import { createDebugLogger } from '@contentful/experiences-sdk-core';

export type ClientOptions =
  | {
      accessToken: string;
      /** Custom base URL for staging, a proxy, or a regional endpoint. */
      host?: string;
    }
  | { client: ContentfulViewDeliveryClient };

/**
 * Identity the generated delivery client now binds at construction time
 * (`@contentful/experience-delivery` 1.0.0-dev.13 — spaceId/environmentId
 * moved from per-call arguments to client options). Destination calls have
 * no environment, so `environmentId` is omitted for them.
 */
export type DeliveryClientIdentity = {
  spaceId: string;
  environmentId?: string;
};

/**
 * Resolve a `ClientOptions` union into a real delivery client. Shared by
 * `fetchExperience` and `fetchDestinationSitemap` — both accept the same
 * inline-creds-or-pre-made-client shape.
 */
export function resolveDeliveryClient(
  clientOptions: ClientOptions,
  identity: DeliveryClientIdentity,
  log: ReturnType<typeof createDebugLogger>
): ContentfulViewDeliveryClient {
  if ('client' in clientOptions) {
    log.log('using caller-supplied delivery client');
    return clientOptions.client;
  }

  const { accessToken, host } = clientOptions;
  const client = createClient({
    accessToken,
    host,
    spaceId: identity.spaceId,
    environmentId: identity.environmentId ?? 'master',
  });
  log.log('created delivery client', { host });
  return client;
}
