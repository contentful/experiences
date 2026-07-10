import { error } from '@sveltejs/kit';

import { fetchExperiencePage } from '$lib/delivery-client.js';
import { detectViewportFromUserAgent } from '$lib/detect-viewport.js';
import { experienceConfig } from '$lib/experience-config.js';

import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, url, request }) => {
  const previewMode =
    url.searchParams.get('preview') === 'true' || url.searchParams.get('preview') === '1';
  const initialViewportId = detectViewportFromUserAgent(request.headers.get('user-agent') ?? '');

  const experience = await fetchExperiencePage(params.slug, experienceConfig, {
    preview: previewMode,
    context: { isPreview: previewMode, metadata: { slug: params.slug } },
  });
  if (!experience) error(404, 'Experience not found');

  return { experience, previewMode, slug: params.slug, initialViewportId };
};
