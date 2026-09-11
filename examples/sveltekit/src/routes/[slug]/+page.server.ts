import { error } from '@sveltejs/kit';

import { NotFoundError, fetchExperience } from '@contentful/experiences-svelte';
import { env } from '$env/dynamic/private';
import { detectViewportFromUserAgent } from '$lib/detect-viewport.js';
import { experienceConfig } from '$lib/experience-config.js';

import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, url, request }) => {
  const preview = url.searchParams.get('preview');
  const sessionId = url.searchParams.get('preview_session_id') ?? undefined;
  const previewToken = env.CPA_TOKEN;
  const debug = url.searchParams.get('debug') === 'true' || url.searchParams.get('debug') === '1';
  const initialViewportId = detectViewportFromUserAgent(request.headers.get('user-agent') ?? '');
  const metadata = { slug: params.slug };

  // `$env/dynamic/private` types every var as `string | undefined`, because it
  // reads the real environment at runtime. Fail with something actionable
  // instead of handing `undefined` to the delivery API — same guard as the
  // Angular example's `server.ts`.
  const spaceId = env.SPACE_ID;
  const accessToken = env.CDA_TOKEN;
  const environmentId = env.ENVIRONMENT_ID || 'master';
  if (!spaceId || !accessToken) {
    throw new Error(
      'SPACE_ID and CDA_TOKEN must be set. Copy .env.example to .env and fill them in.'
    );
  }
  const previewSessionOptions = { spaceId, environmentId, previewToken, sessionId };
  const livePreview = Boolean(sessionId && previewToken);
  const previewMode = preview === 'true' || preview === '1' || livePreview;

  try {
    const experience = await fetchExperience(
      {
        spaceId,
        environmentId,
        experienceId: params.slug,
      },
      {
        accessToken,
        previewToken,
        preview: previewMode,
      },
      {
        config: experienceConfig,
        metadata,
        debug,
        initialViewportId,
      }
    );

    return {
      experience,
      livePreview,
      previewSessionOptions,
      debug,
      metadata,
      initialViewportId,
    };
  } catch (err) {
    if (err instanceof NotFoundError) error(404, 'Experience not found');
    throw err;
  }
};
