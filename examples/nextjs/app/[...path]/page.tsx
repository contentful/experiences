import { fetchDestinationSitemap } from '@contentful/experiences-react';

import {
  destinationConfig,
  renderDestinationPage,
  type SearchParams,
} from '@/lib/destination-page';

interface PageProps {
  params: Promise<{ path: string[] }>;
  searchParams?: Promise<SearchParams>;
}

// Enumerate every routable path in the Destination. `/` (the home node) is
// served by `app/page.tsx`, so it is skipped here.
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
      const segments = item.path.split('/').filter(Boolean);
      if (segments.length > 0) paths.push({ path: segments });
    }
    pageNext = sitemap.pages.next;
  } while (pageNext);
  return paths;
}

export default async function DestinationPage({ params, searchParams }: PageProps) {
  const { path } = await params;
  return renderDestinationPage(path, (await searchParams) ?? {});
}
