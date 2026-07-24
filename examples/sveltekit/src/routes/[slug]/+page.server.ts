import { error } from '@sveltejs/kit';

import { NotFoundError, fetchExperience } from '@contentful/experiences-svelte';
import { env } from '$env/dynamic/private';
import { detectViewportFromUserAgent } from '$lib/detect-viewport.js';
import { experienceConfig } from '$lib/experience-config.js';

import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, url, request }) => {
  const previewMode =
    url.searchParams.get('preview') === 'true' || url.searchParams.get('preview') === '1';
  const initialViewportId = detectViewportFromUserAgent(request.headers.get('user-agent') ?? '');

  try {
    const experience = await fetchExperience(
      {
        spaceId: env.SPACE_ID,
        environmentId: env.ENVIRONMENT_ID || 'master',
        experienceId: params.slug,
      },
      {
        accessToken: env.CDA_TOKEN,
        previewToken: env.CPA_TOKEN,
        preview: previewMode,
      },
      {
        config: experienceConfig,
        context: { isPreview: previewMode, metadata: { slug: params.slug } },
      }
    );

    return { experience, previewMode, slug: params.slug, initialViewportId };
  } catch (err) {
    if (err instanceof NotFoundError) error(404, 'Experience not found');
    throw err;
  }
};
