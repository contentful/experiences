import { error } from '@sveltejs/kit';

import { NotFoundError, fetchExperience } from '@contentful/experiences-svelte';
import { env } from '$env/dynamic/private';
import { detectViewportFromUserAgent } from '$lib/detect-viewport.js';
import { experienceConfig } from '$lib/experience-config.js';

import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, url, request }) => {
  const previewMode =
    url.searchParams.get('preview') === 'true' || url.searchParams.get('preview') === '1';
  const debug = url.searchParams.get('debug') === 'true' || url.searchParams.get('debug') === '1';
  const initialViewportId = detectViewportFromUserAgent(request.headers.get('user-agent') ?? '');
  const metadata = { slug: params.slug };

  // `$env/dynamic/private` types every var as `string | undefined`, because it
  // reads the real environment at runtime. Fail with something actionable
  // instead of handing `undefined` to the delivery API — same guard as the
  // Angular example's `server.ts`.
  const spaceId = env.SPACE_ID;
  const accessToken = env.CDA_TOKEN;
  if (!spaceId || !accessToken) {
    throw new Error(
      'SPACE_ID and CDA_TOKEN must be set. Copy .env.example to .env and fill them in.'
    );
  }

  try {
    const experience = await fetchExperience(
      {
        spaceId,
        environmentId: env.ENVIRONMENT_ID || 'master',
        experienceId: params.slug,
      },
      {
        accessToken,
        previewToken: env.CPA_TOKEN,
        preview: previewMode,
      },
      {
        config: experienceConfig,
        metadata,
        debug,
        initialViewportId,
      }
    );

    // The plan carries all of these. `debug` and `initialViewportId` are relayed
    // as well only so the page can demonstrate the renderer's override props.
    return { experience, previewMode, debug, initialViewportId };
  } catch (err) {
    if (err instanceof NotFoundError) error(404, 'Experience not found');
    throw err;
  }
};
