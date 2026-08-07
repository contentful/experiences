import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';

import { ALPHA_FEATURE_HEADER, NEW_EXO_ENTITY_TYPES } from './alpha-feature.js';

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
    token: accessToken,
    baseUrl: host,
    // Selects the ExO entity shapes this SDK reads (`component` /
    // `experienceTemplate` links). Set as a client default so direct
    // `client.experience.get(...)` calls get them too, not just
    // `fetchExperience`. A caller-supplied `headers` entry for the same key
    // wins, so a caller can pin a different alpha-feature set if they need to.
    headers: { [ALPHA_FEATURE_HEADER]: NEW_EXO_ENTITY_TYPES, ...headers },
  });
}
