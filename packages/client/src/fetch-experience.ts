import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { resolveExperience } from '@contentful/experiences-core';
import type {
  ExperiencePayload,
  PortableRenderPlan,
  ResolveExperienceOptions,
  ResolverConfig,
} from '@contentful/experiences-core';

const DEFAULT_HOST = 'https://xdn.contentful.com';

export type ExperienceOptions = {
  spaceId: string;
  environmentId: string;
  experienceId: string;
  locale?: string;
};

export type ClientOptions =
  | { accessToken: string; host?: string }
  | { client: ContentfulViewDeliveryClient };

export type ResolveOptions = {
  config: ResolverConfig;
  context?: ResolveExperienceOptions['experience'];
};

export async function fetchExperience(
  experienceOptions: ExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan | null> {
  const { spaceId, environmentId, experienceId, locale } = experienceOptions;
  const { config, context } = resolveOptions;

  const client =
    'client' in clientOptions
      ? clientOptions.client
      : new ContentfulViewDeliveryClient({
          token: clientOptions.accessToken,
          baseUrl: clientOptions.host ?? DEFAULT_HOST,
        });

  // Response from the experience delivery client is structurally compatible with ExperiencePayload (superset)
  const payload = (await client.view.getExperience(spaceId, environmentId, experienceId, {
    locale,
  })) as unknown as ExperiencePayload;

  if (!payload?.nodes?.length) return null;

  return resolveExperience(payload, config, { experience: context });
}
