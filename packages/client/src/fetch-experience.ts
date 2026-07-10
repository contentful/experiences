import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { resolveExperience } from '@contentful/experiences-core';
import type {
  ExperiencePayload,
  PortableRenderPlan,
  ResolveExperienceOptions,
  ResolverConfig,
} from '@contentful/experiences-core';

const XDN_BASE_URL = 'https://xdn.contentful.com';
const XPA_BASE_URL = 'https://preview.xdn.contentful.com';

export type FetchExperienceOptions = {
  spaceId: string;
  environmentId: string;
  experienceId: string;
  locale?: string;
  config: ResolverConfig;
  context?: ResolveExperienceOptions['experience'];
} & ({ accessToken: string; preview?: boolean } | { client: ContentfulViewDeliveryClient });

export async function fetchExperience(
  options: FetchExperienceOptions
): Promise<PortableRenderPlan | null> {
  const { spaceId, environmentId, experienceId, locale, config, context } = options;

  const client =
    'client' in options
      ? options.client
      : new ContentfulViewDeliveryClient({
          token: options.accessToken,
          baseUrl: options.preview ? XPA_BASE_URL : XDN_BASE_URL,
        });

  // Response from the experience delivery client is structurally compatible with ExperiencePayload (superset)
  const payload = (await client.view.getExperience(spaceId, environmentId, experienceId, {
    locale,
  })) as unknown as ExperiencePayload;

  if (!payload?.nodes?.length) return null;

  return resolveExperience(payload, config, { experience: context });
}
