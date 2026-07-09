/**
 * Env access goes through `$env/static/private` (SvelteKit's typed
 * server-only env import) instead of `process.env`. SvelteKit doesn't
 * auto-populate `process.env` from `.env` like Next.js does — it exposes
 * server-only vars via this module so they can never leak to the client
 * bundle. The values are inlined at build time.
 */

import { createExperienceClient, type ExperiencePayload } from '@contentful/experiences-svelte';

import { CDA_TOKEN, CPA_TOKEN, ENVIRONMENT_ID, SPACE_ID } from '$env/static/private';

export interface FetchExperienceResult {
  payload: ExperiencePayload;
}

export async function fetchExperience(
  experienceId: string,
  options: { locale?: string; preview?: boolean } = {}
): Promise<FetchExperienceResult> {
  const client = createExperienceClient({
    spaceId: SPACE_ID,
    environmentId: ENVIRONMENT_ID || 'master',
    accessToken: options.preview ? CPA_TOKEN : CDA_TOKEN,
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
