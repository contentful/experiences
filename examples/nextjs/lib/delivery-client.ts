import 'server-only';

import { createExperienceClient, type ExperiencePayload } from '@contentful/experiences-react';

export interface FetchExperienceResult {
  payload: ExperiencePayload;
}

export async function fetchExperience(
  experienceId: string,
  options: { locale?: string; preview?: boolean } = {}
): Promise<FetchExperienceResult> {
  const client = createExperienceClient({
    spaceId: process.env.SPACE_ID!,
    environmentId: process.env.ENVIRONMENT_ID ?? 'master',
    accessToken: options.preview ? process.env.CPA_TOKEN! : process.env.CDA_TOKEN!,
    preview: options.preview ?? false,
  });

  const response = await client._inner.view.getExperience(
    client.spaceId,
    client.environmentId,
    experienceId,
    { locale: options.locale }
  );

  return { payload: response as ExperiencePayload };
}
