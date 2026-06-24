import { error } from '@sveltejs/kit';
import { resolveExperience } from '@contentful/experiences-svelte';

import { fetchExperience } from '$lib/delivery-client.js';
import { detectViewportFromUserAgent } from '$lib/detect-viewport.js';
import { experienceConfig } from '$lib/experience-config.js';

import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, url, request }) => {
  const previewMode =
    url.searchParams.get('preview') === 'true' || url.searchParams.get('preview') === '1';
  const initialViewportId = detectViewportFromUserAgent(request.headers.get('user-agent') ?? '');

  const { payload } = await fetchExperience(params.slug, { preview: previewMode });
  if (!payload.nodes.length) error(404, 'Experience not found');

  const experience = await resolveExperience(payload, experienceConfig, {
    experience: { isPreview: previewMode, metadata: { slug: params.slug } },
  });

  return { experience, previewMode, slug: params.slug, initialViewportId };
};
