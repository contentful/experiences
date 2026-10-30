import { error } from '@sveltejs/kit';

import {
  NotFoundError,
  fetchExperience,
  fetchPreviewSession,
} from '@contentful/experiences-svelte';
import { env } from '$env/dynamic/private';
import { experienceConfig } from '$lib/experience-config.js';
import { buildPagePersonalization } from '$lib/server/personalization.js';

import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, url, request }) => {
  const preview = url.searchParams.get('preview');
  const sessionId = url.searchParams.get('preview_session_id') ?? undefined;
  const previewToken = env.CPA_TOKEN;
  const debug = url.searchParams.get('debug') === 'true' || url.searchParams.get('debug') === '1';
  const metadata = { slug: params.slug };
  const personalizationParam = url.searchParams.get('personalization');
  const personalizationEnabled = personalizationParam === 'true' || personalizationParam === '1';
  const locale = url.searchParams.get('locale') ?? 'en-US';

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
  const livePreview = sessionId !== undefined && previewToken !== undefined;
  const previewMode = preview === 'true' || preview === '1' || livePreview;

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

  try {
    const resolveOptions = {
      config: experienceConfig,
      metadata,
      debug,
    };
    const experience = livePreview
      ? await fetchPreviewSession(
          { spaceId, environmentId, sessionId },
          { previewToken },
          resolveOptions
        )
      : await fetchExperience(
          {
            spaceId,
            environmentId,
            experienceId: params.slug,
            locale,
            personalization,
          },
          {
            accessToken,
            previewToken,
            preview: previewMode,
          },
          resolveOptions
        );

    return {
      experience,
      livePreview,
      previewSessionOptions,
      debug,
      metadata,
    };
  } catch (err) {
    if (err instanceof NotFoundError) error(404, 'Experience not found');
    throw err;
  }
};
