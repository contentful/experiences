/**
 * Server-side fetch of an Experience via @contentful/experience-delivery.
 * Requires SPACE_ID and CDA_TOKEN in the environment.
 *
 * The delivery client's `GetExperienceViewResponse` is structurally
 * compatible with our `ExperiencePayload`, so we hand it straight to
 * `resolveExperience` without normalization.
 */

import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import type { ExperiencePayload } from '@contentful/experiences-svelte';

const experienceClient = new ContentfulViewDeliveryClient({ token: process.env.CDA_TOKEN! });

export interface FetchExperienceResult {
  payload: ExperiencePayload;
}

export async function fetchExperience(
  experienceId: string,
  options: { locale?: string; preview?: boolean } = {}
): Promise<FetchExperienceResult> {
  const spaceId = process.env.SPACE_ID || '';
  const environmentId = process.env.ENVIRONMENT_ID ?? 'master';

  const response = await experienceClient.view.getExperience(spaceId, environmentId, experienceId, {
    locale: options.locale,
    preview: options.preview ? 'true' : undefined,
  });

  return { payload: response };
}
