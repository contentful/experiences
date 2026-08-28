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
      // `metadata` is opaque to the SDK: it reaches `resolveData` hooks as
      // `ctx.experience.metadata` and components as `useExperience().metadata`.
      metadata: { slug: experienceId, locale },
      debug,
      // Pre-resolve design against the UA-detected viewport so SSR paints
      // correct design on first render.
      initialViewportId,
    }
  );

  // `metadata`, `debug`, and the viewport all ride along on the resolved plan,
  // so the renderer only needs `config` — component references cannot travel on
  // the plan across the RSC boundary, so that one stays a prop.
  return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
}
