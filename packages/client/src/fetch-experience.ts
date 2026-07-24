import type { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import type {
  ExperiencePayload,
  PortableRenderPlan,
  ResolveExperienceOptions,
  ResolverConfig,
} from '@contentful/experiences-sdk-core';
import { createClient } from './create-client.js';

const PREVIEW_HOST = 'https://preview.xdn.contentful.com';

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
  context?: ResolveExperienceOptions['experience'];
};

export async function fetchExperience(
  experienceOptions: ExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan> {
  const { spaceId, environmentId, experienceId, locale } = experienceOptions;
  const { config, context } = resolveOptions;

  let client: ContentfulViewDeliveryClient;
  if ('client' in clientOptions) {
    client = clientOptions.client;
  } else {
    const { accessToken, previewToken, preview, host } = clientOptions;
    if (preview && !previewToken) {
      throw new Error(
        'fetchExperience() called with preview: true but no previewToken was provided'
      );
    }
    client = createClient({
      accessToken: preview ? (previewToken as string) : accessToken,
      host: host ?? (preview ? PREVIEW_HOST : undefined),
    });
  }

  // Response from the experience delivery client is structurally compatible with ExperiencePayload (superset)
  const payload = (await client.view.getExperience(spaceId, environmentId, experienceId, {
    locale,
  })) as unknown as ExperiencePayload;

  return resolveExperience(payload, config, { experience: context });
}
