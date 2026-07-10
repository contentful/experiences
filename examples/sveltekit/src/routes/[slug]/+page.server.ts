import { error } from '@sveltejs/kit';

import { fetchExperience } from '@contentful/experiences-svelte';
import { CDA_TOKEN, ENVIRONMENT_ID, SPACE_ID } from '$env/static/private';
import { detectViewportFromUserAgent } from '$lib/detect-viewport.js';
import { experienceConfig } from '$lib/experience-config.js';

import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, url, request }) => {
  const previewMode =
    url.searchParams.get('preview') === 'true' || url.searchParams.get('preview') === '1';
  const initialViewportId = detectViewportFromUserAgent(request.headers.get('user-agent') ?? '');

  const experience = await fetchExperience({
    accessToken: CDA_TOKEN,
    preview: previewMode,
    spaceId: SPACE_ID,
    environmentId: ENVIRONMENT_ID || 'master',
    experienceId: params.slug,
    context: { isPreview: previewMode, metadata: { slug: params.slug } },
    config: experienceConfig,
  });
  if (!experience) error(404, 'Experience not found');

  return { experience, previewMode, slug: params.slug, initialViewportId };
};
