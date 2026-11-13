import { ContentfulExperiences } from '@contentful/experiences-node';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { NotFoundError, ServerExperienceRenderer } from '@contentful/experiences-nextjs/server';

import { experienceConfig } from '@/lib/experience-config';
import { buildPagePersonalization } from '@/lib/personalization';

export type SearchParams = Record<string, string | string[] | undefined>;

export function destinationConfig() {
  const spaceId = process.env.SPACE_ID;
  const destinationId = process.env.DESTINATION_ID;
  const accessToken = process.env.CDA_TOKEN;
  if (!spaceId || !destinationId || !accessToken) {
    throw new Error(
      'SPACE_ID, DESTINATION_ID and CDA_TOKEN must be set. Copy .env.example to .env.local, fill them in, and run the bootstrap in examples/scripts.'
    );
  }
  return { spaceId, destinationId, accessToken };
}

export function flag(value: string | string[] | undefined) {
  return value === 'true' || value === '1';
}

/**
 * Fetches the Destination node at `segments` and renders it. Shared by the hub
 * at `/` (the home node, empty `segments`) and the `[...path]` catch-all.
 */
export async function renderDestinationPage(segments: string[], sp: SearchParams) {
  const path = `/${segments.join('/')}`;

  const debug = flag(sp.debug);
  const personalizationEnabled = flag(sp.personalization);
  const locale = typeof sp.locale === 'string' ? sp.locale : 'en-US';
  const { spaceId, destinationId, accessToken } = destinationConfig();

  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const host = requestHeaders.get('host') ?? 'localhost:3000';
  const personalization = personalizationEnabled
    ? buildPagePersonalization({
        origin: `${forwardedProto}://${host}`,
        path,
        locale,
        referrer: requestHeaders.get('referer') ?? '',
        searchParams: sp,
      })
    : undefined;

  const resolveOptions = {
    config: experienceConfig,
    metadata: { slug: segments.join('/'), locale },
    debug,
  };

  // The URL path is the Destination path. A Destination resolves to either an
  // Experience or a redirect the app must follow. Use the /experiences/[id]
  // route for Preview Sessions.
  let result;
  try {
    const sdk = new ContentfulExperiences({
      spaceId,
      environmentId: process.env.ENVIRONMENT_ID ?? 'master',
      delivery: { accessToken },
    });
    const request = sdk.forRequest({ locale });
    try {
      result = await request.fetchExperience(
        { destinationId, path, locale, personalization },
        resolveOptions
      );
    } finally {
      request.destroy();
    }
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  if ('redirect' in result) redirect(result.redirect.path);

  return (
    <ServerExperienceRenderer
      experience={result}
      config={experienceConfig}
      metadata={{ renderer: 'server' }}
      debug={debug}
    />
  );
}
