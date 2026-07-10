import {
  ContentfulViewDeliveryClient,
  type ContentfulViewDelivery,
} from '@contentful/experience-delivery';
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
  personalization?: {
    audienceIds?: string[];
    userTraits?: Record<string, unknown>;
    variantOverrides?: Record<string, string>;
  };
  config: ResolverConfig;
  context?: ResolveExperienceOptions['experience'];
} & ({ accessToken: string; preview?: boolean } | { client: ContentfulViewDeliveryClient });

export async function fetchExperience(
  options: FetchExperienceOptions
): Promise<PortableRenderPlan | null> {
  const { spaceId, environmentId, experienceId, locale, personalization, config, context } =
    options;

  const client =
    'client' in options
      ? options.client
      : new ContentfulViewDeliveryClient({
          token: options.accessToken,
          baseUrl: options.preview ? XPA_BASE_URL : XDN_BASE_URL,
        });

  // Fern response is structurally compatible with ExperiencePayload (superset)
  let payload: ExperiencePayload;

  if (personalization) {
    const request: ContentfulViewDelivery.GetExperienceWithOverridesViewRequest = {
      locale,
      extensions: {
        // Opt into sourceMap data automatically when personalization is requested
        sourceMap: {},
      },
    };
    payload = (await client.view.getExperienceWithOverrides(
      spaceId,
      environmentId,
      experienceId,
      request
    )) as unknown as ExperiencePayload;
  } else {
    payload = (await client.view.getExperience(spaceId, environmentId, experienceId, {
      locale,
    })) as unknown as ExperiencePayload;
  }

  if (!payload?.nodes?.length) return null;

  return resolveExperience(payload, config, { experience: context });
}
