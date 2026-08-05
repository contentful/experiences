import { error } from '@sveltejs/kit';

import { NotFoundError, fetchExperience } from '@contentful/experiences-svelte';
import { CDA_TOKEN, ENVIRONMENT_ID, SPACE_ID } from '$env/static/private';
import { detectViewportFromUserAgent } from '$lib/detect-viewport.js';
import { experienceConfig } from '$lib/experience-config.js';

import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, url, request }) => {
  const previewMode =
    url.searchParams.get('preview') === 'true' || url.searchParams.get('preview') === '1';
  const debug = url.searchParams.get('debug') === 'true' || url.searchParams.get('debug') === '1';
  const initialViewportId = detectViewportFromUserAgent(request.headers.get('user-agent') ?? '');
  const metadata = { slug: params.slug };

  try {
    const experience = await fetchExperience(
      {
        spaceId: SPACE_ID,
        environmentId: ENVIRONMENT_ID || 'master',
        experienceId: params.slug,
      },
      {
        accessToken: CDA_TOKEN,
        host: previewMode ? 'https://preview.xdn.contentful.com' : 'https://xdn.contentful.com',
      },
      {
        config: experienceConfig,
        metadata,
        debug,
      }
    );

    return { experience, previewMode, debug, metadata, initialViewportId };
  } catch (err) {
    if (err instanceof NotFoundError) error(404, 'Experience not found');
    throw err;
  }
};
