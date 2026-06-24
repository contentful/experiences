/**
 * Server-side fetch of an Experience via @contentful/experience-delivery.
 * Requires SPACE_ID and CDA_TOKEN in the environment (.env file).
 *
 * The delivery client's `GetExperienceViewResponse` is structurally
 * compatible with our `ExperiencePayload`, so we hand it straight to
 * `resolveExperience` without normalization.
 *
 * Env access goes through `$env/static/private` (SvelteKit's typed
 * server-only env import) instead of `process.env`. SvelteKit doesn't
 * auto-populate `process.env` from `.env` like Next.js does — it exposes
 * server-only vars via this module so they can never leak to the client
 * bundle. The values are inlined at build time.
 */

import { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import type { ExperiencePayload } from '@contentful/experiences-svelte';

import { CDA_TOKEN, ENVIRONMENT_ID, SPACE_ID } from '$env/static/private';

const experienceClient = new ContentfulViewDeliveryClient({ token: CDA_TOKEN });

export interface FetchExperienceResult {
  payload: ExperiencePayload;
}

export async function fetchExperience(
  experienceId: string,
  options: { locale?: string; preview?: boolean } = {}
): Promise<FetchExperienceResult> {
  const response = await experienceClient.view.getExperience(
    SPACE_ID,
    ENVIRONMENT_ID || 'master',
    experienceId,
    {
      locale: options.locale,
      preview: options.preview ? 'true' : undefined,
    }
  );

  return { payload: response };
}
