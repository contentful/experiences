import type { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { createClient } from './create-delivery-client.js';
import { createDebugLogger } from '@contentful/experiences-sdk-core';
import { PREVIEW_HOST } from './hosts.js';

export type ClientOptions =
  | {
      accessToken: string;
      /**
       * Preview access token. Required when calling with `preview: true`.
       */
      previewToken?: string;
      /**
       * Flip between delivery (default) and preview at request time. When
       * `true`, uses `previewToken` and the preview host; when `false` or
       * unset, uses `accessToken` and the delivery host. Ignored when a
       * pre-made `client` is passed instead of inline creds.
       */
      preview?: boolean;
      /**
       * Custom base URL for the delivery client (staging, proxy, per-region).
       * Wins over the `preview`-derived default host — combine `host` with
       * `preview: true` to point preview mode at a non-prod endpoint.
       * Omit for the standard delivery / preview hosts.
       */
      host?: string;
    }
  | { client: ContentfulViewDeliveryClient };

/**
 * Resolve a `ClientOptions` union into a real delivery client. Shared by
 * `fetchExperience` and `fetchDestinationSitemap` — both accept the same
 * inline-creds-or-pre-made-client shape.
 */
export function resolveDeliveryClient(
  clientOptions: ClientOptions,
  log: ReturnType<typeof createDebugLogger>,
  callerName: string
): ContentfulViewDeliveryClient {
  if ('client' in clientOptions) {
    log.log('using caller-supplied delivery client');
    return clientOptions.client;
  }

  const { accessToken, previewToken, preview, host } = clientOptions;
  if (preview && !previewToken) {
    throw new Error(
      `${callerName}() called with preview: true but no previewToken was provided`
    );
  }
  const resolvedHost = host ?? (preview ? PREVIEW_HOST : undefined);
  const client = createClient({
    accessToken: preview ? (previewToken as string) : accessToken,
    host: resolvedHost,
  });
  log.log('created delivery client', { preview: Boolean(preview), host: resolvedHost });
  return client;
}
