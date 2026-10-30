import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import {
  NotFoundError,
  ServerExperienceRenderer,
  fetchDestinationSitemap,
  fetchExperience,
} from '@contentful/experiences-react';

import { experienceConfig } from '@/lib/experience-config';
import { buildPagePersonalization } from '@/lib/personalization';

interface PageProps {
  params: Promise<{ path?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function destinationConfig() {
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

// Enumerate every routable path in the Destination. An optional catch-all uses
// an empty `path` array for `/`.
export async function generateStaticParams() {
  const { spaceId, destinationId, accessToken } = destinationConfig();
  const paths: { path: string[] }[] = [];
  let pageNext: string | undefined;
  do {
    const sitemap = await fetchDestinationSitemap(
      { spaceId, destinationId },
      { accessToken },
      { pageNext }
    );
    for (const item of sitemap.items) {
      paths.push({ path: item.path.split('/').filter(Boolean) });
    }
    pageNext = sitemap.pages.next;
  } while (pageNext);
  return paths;
}

export default async function DestinationPage({ params, searchParams }: PageProps) {
  const { path: segments = [] } = await params;
  const sp = (await searchParams) ?? {};
  const path = `/${segments.join('/')}`;

  const debug = sp.debug === 'true' || sp.debug === '1';
  const personalizationEnabled = sp.personalization === 'true' || sp.personalization === '1';
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

  // The URL path is the Destination path. A Destination resolves to either a
  // plan or a redirect the app must follow. Preview is not supported on
  // Destinations, so no `previewToken` or `preview` flag is passed; use the
  // /experiences/[id] route for preview.
  let result;
  try {
    result = await fetchExperience(
      { spaceId, destinationId, path, personalization },
      { accessToken },
      resolveOptions
    );
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
