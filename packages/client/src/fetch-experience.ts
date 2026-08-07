import type {
  ContentfulViewDelivery,
  ContentfulViewDeliveryClient,
} from '@contentful/experience-delivery';
import { createDebugLogger, resolveExperience } from '@contentful/experiences-sdk-core';
import type {
  ExperiencePayload,
  PortableRenderPlan,
  ResolverConfig,
} from '@contentful/experiences-sdk-core';
import { NEW_EXO_ENTITY_TYPES_HEADERS } from './alpha-feature.js';
import { createClient } from './create-client.js';
import { PREVIEW_HOST } from './hosts.js';

export type ExperienceOptions = {
  spaceId: string;
  environmentId: string;
  experienceId: string;
  locale?: string;
};

export type ClientOptions =
  | {
      accessToken: string;
      /**
       * Preview access token. Required when calling with `preview: true`.
       */
      previewToken?: string;
      /**
       * Flip between delivery (default) and preview at request time. When
       * `true`, `fetchExperience` uses `previewToken` and the preview host;
       * when `false` or unset, it uses `accessToken` and the delivery host.
       * Ignored when a pre-made `client` is passed instead of inline creds.
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

export type ResolveOptions = {
  config: ResolverConfig;
  /**
   * Arbitrary per-render metadata exposed to every resolver as
   * `ctx.experience.metadata` and readable at render time via the framework
   * adapter's `useExperience()` / `getExperience()`.
   */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on: logs the fetch (host, ids) and the raw
   * payload here, and threads through to `resolveExperience` (resolution steps
   * + `resolveData` timings) and the renderer (visible missing-component box,
   * debug fallback). A single boolean across fetch + resolve + render.
   */
  debug?: boolean;
};

export async function fetchExperience(
  experienceOptions: ExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan> {
  const { spaceId, environmentId, experienceId, locale } = experienceOptions;
  const { config, metadata, debug } = resolveOptions;
  const log = createDebugLogger(debug, 'client');

  let client: ContentfulViewDeliveryClient;
  if ('client' in clientOptions) {
    client = clientOptions.client;
    log.log('using caller-supplied delivery client');
  } else {
    const { accessToken, previewToken, preview, host } = clientOptions;
    if (preview && !previewToken) {
      throw new Error(
        'fetchExperience() called with preview: true but no previewToken was provided'
      );
    }
    const resolvedHost = host ?? (preview ? PREVIEW_HOST : undefined);
    client = createClient({
      accessToken: preview ? (previewToken as string) : accessToken,
      host: resolvedHost,
    });
    log.log('created delivery client', { preview: Boolean(preview), host: resolvedHost });
  }

  log.log('fetching experience', { spaceId, environmentId, experienceId, locale });

  // The alpha-feature header goes on the request as well as on clients built by
  // `createClient`, so a caller-supplied `{ client }` also gets the ExO entity
  // shapes this SDK reads.
  const response = await client.experience.get(
    spaceId,
    environmentId,
    experienceId,
    { locale },
    { headers: NEW_EXO_ENTITY_TYPES_HEADERS }
  );

  // `GetExperienceResponse` is a union of the shapes the endpoint can return;
  // the header above pins it to `HydratedExperienceView`, which is a structural
  // superset of `ExperiencePayload`.
  const payload = response as ContentfulViewDelivery.HydratedExperienceView as ExperiencePayload;

  log.lazy('received raw payload', () => payload);

  return resolveExperience(payload, config, { metadata, debug });
}
