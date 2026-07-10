import 'server-only';

import { fetchExperience } from '@contentful/experiences-react';
import type { PortableRenderPlan, ResolveExperienceOptions, Config } from '@contentful/experiences-react';

const spaceId = process.env.SPACE_ID ?? '';
const environmentId = process.env.ENVIRONMENT_ID ?? 'master';

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
    accessToken: process.env.CDA_TOKEN!,
    preview: options.preview,
    spaceId,
    environmentId,
    experienceId,
    locale: options.locale,
    context: options.context,
    config,
  });
}
