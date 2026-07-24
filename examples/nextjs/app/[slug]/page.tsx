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
      // Preview mode reads from the CPA endpoint, which needs a Content
      // Preview token — the CDA token is rejected by that host.
      accessToken:
        previewMode && process.env.CPA_TOKEN ? process.env.CPA_TOKEN : process.env.CDA_TOKEN!,
      host: previewMode ? 'https://preview.xdn.contentful.com' : 'https://xdn.contentful.com',
    },
    {
      config: experienceConfig,
      context: {
        isPreview: previewMode,
        metadata: { slug: experienceId, locale },
      },
    }
  );

  return (
    <ServerExperienceRenderer
      experience={experience}
      config={experienceConfig}
      initialViewportId={initialViewportId}
      context={{ isPreview: previewMode, metadata: { slug: experienceId, locale } }}
    />
  );
}
