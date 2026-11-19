import { env } from '$env/dynamic/public';
import { bindSvelteKitClientExperiences } from '@contentful/experiences-svelte/kit/client';
import { createLivePreviewClient } from '@contentful/experiences-live-preview';
import { experienceConfig } from './experience-config.js';

// PUBLIC_* credentials are an explicit browser decision. Private CDA/CPA tokens
// never enter this module or the captured request result.
export const { request } = bindSvelteKitClientExperiences({
  config: experienceConfig,
  endpoint: '/_exo/primary',
  spaceId: env.PUBLIC_SPACE_ID ?? '',
  environmentId: env.PUBLIC_ENVIRONMENT_ID || 'master',
  delivery: { accessToken: env.PUBLIC_CDA_TOKEN ?? '' },
  preview:
    env.PUBLIC_LIVE_PREVIEW_ENABLED === 'true' && env.PUBLIC_CPA_TOKEN?.trim()
      ? { accessToken: env.PUBLIC_CPA_TOKEN, createClient: createLivePreviewClient }
      : undefined,
});
