import { fetchExperience } from '@contentful/experiences-svelte';
import type { PortableRenderPlan, ResolveExperienceOptions, Config } from '@contentful/experiences-svelte';

import { CDA_TOKEN, ENVIRONMENT_ID, SPACE_ID } from '$env/static/private';

export async function fetchExperiencePage(
  experienceId: string,
  config: Config,
  options: {
    locale?: string;
    preview?: boolean;
    context?: ResolveExperienceOptions['experience'];
  } = {},
): Promise<PortableRenderPlan | null> {
  return fetchExperience({
    accessToken: CDA_TOKEN,
    preview: options.preview,
    spaceId: SPACE_ID,
    environmentId: ENVIRONMENT_ID || 'master',
    experienceId,
    locale: options.locale,
    context: options.context,
    config,
  });
}
