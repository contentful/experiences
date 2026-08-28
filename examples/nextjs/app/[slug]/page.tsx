import { headers } from 'next/headers';
import { ServerExperienceRenderer, fetchExperience } from '@contentful/experiences-react';

import { detectViewportFromUserAgent } from '@/lib/detect-viewport';
import { experienceConfig } from '@/lib/experience-config';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExperiencePage({ params, searchParams }: PageProps) {
  const { slug: experienceId } = await params;
  const sp = (await searchParams) ?? {};

  const previewMode = sp.preview === 'true' || sp.preview === '1';
  const debug = sp.debug === 'true' || sp.debug === '1';
  const locale = typeof sp.locale === 'string' ? sp.locale : 'en-US';

  const userAgent = (await headers()).get('user-agent') ?? '';
  const initialViewportId = detectViewportFromUserAgent(userAgent);

  const experience = await fetchExperience(
    {
      spaceId: process.env.SPACE_ID ?? '',
      environmentId: process.env.ENVIRONMENT_ID ?? 'master',
      experienceId,
      locale,
    },
    {
      accessToken: process.env.CDA_TOKEN!,
      previewToken: process.env.CPA_TOKEN,
      preview: previewMode,
    },
    {
      config: experienceConfig,
      metadata: { slug: experienceId, locale },
      debug,
      initialViewportId,
    }
  );

  // All three render props are optional — the plan already carries what
  // `fetchExperience` was given. Shown here to make the override path visible:
  // `metadata` merges over the plan's (so the component sees `slug`, `locale`
  // *and* `renderer`), while `debug` and `initialViewportId` replace it.
  //
  // Passing the same `initialViewportId` the fetch used is a no-op, since the
  // renderer already defaults to the viewport design was pre-resolved against.
  // It earns its place when you want a *different* viewport — a preview pane
  // rendering one plan at two widths, say.
  return (
    <ServerExperienceRenderer
      experience={experience}
      config={experienceConfig}
      initialViewportId={initialViewportId}
      metadata={{ renderer: 'server' }}
      debug={debug}
    />
  );
}
