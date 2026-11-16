import { error, redirect } from '@sveltejs/kit';

import { NotFoundError, fetchExperience } from '@contentful/experiences-svelte';
import { env } from '$env/dynamic/private';
import { experienceConfig } from '$lib/experience-config.js';
import { buildPagePersonalization } from '$lib/server/personalization.js';

import type { PageServerLoad } from './$types.js';

function destinationConfig() {
  const spaceId = env.SPACE_ID;
  const destinationId = env.DESTINATION_ID;
  const accessToken = env.CDA_TOKEN;
  if (!spaceId || !destinationId || !accessToken) {
    throw new Error(
      'SPACE_ID, DESTINATION_ID and CDA_TOKEN must be set. Copy .env.example to .env, fill them in, and run the bootstrap in examples/scripts.'
    );
  }
  return { spaceId, destinationId, accessToken };
}

// Not prerendered: the load reads `?personalization` and `?debug`, and SvelteKit
// rejects `url.searchParams` on prerendered pages. See the README for how to
// enumerate paths with `fetchDestinationSitemap` in a fully static build.
export const load: PageServerLoad = async ({ params, url, request }) => {
  const debug = url.searchParams.get('debug') === 'true' || url.searchParams.get('debug') === '1';
  const personalizationParam = url.searchParams.get('personalization');
  const personalizationEnabled = personalizationParam === 'true' || personalizationParam === '1';
  const locale = url.searchParams.get('locale') ?? 'en-US';
  const { spaceId, destinationId, accessToken } = destinationConfig();
  const path = `/${params.path}`;
  const metadata = { slug: params.path };

  // Only send a page event when `?personalization=true` is explicitly present.
  const personalization = personalizationEnabled
    ? buildPagePersonalization({
        origin: url.origin,
        path: url.pathname,
        locale,
        referrer: request.headers.get('referer') ?? '',
        searchParams: Object.fromEntries(
          [...new Set(url.searchParams.keys())].map((key) => {
            const values = url.searchParams.getAll(key);
            return [key, values.length === 1 ? values[0] : values];
          })
        ),
      })
    : undefined;

  // The URL path is the Destination path. A Destination resolves to either an
  // Experience or a redirect the app must follow. Use the /experiences/[id]
  // route for Preview Sessions.
  try {
    const result = await fetchExperience(
      { spaceId, destinationId, path, personalization },
      { accessToken },
      { config: experienceConfig, metadata, debug }
    );
    if ('redirect' in result) redirect(307, result.redirect.path);
    return { experience: result, debug };
  } catch (err) {
    if (err instanceof NotFoundError) error(404, 'Not found');
    throw err;
  }
};
