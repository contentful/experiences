import { headers } from 'next/headers';
import { ServerExperienceRenderer, fetchExperience } from '@contentful/experiences-react';

import { LivePreviewExperience } from '@/components/LivePreviewExperience';
import { detectViewportFromUserAgent } from '@/lib/detect-viewport';
import { experienceConfig } from '@/lib/experience-config';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExperiencePage({ params, searchParams }: PageProps) {
  const { slug: experienceId } = await params;
  const sp = (await searchParams) ?? {};

  const preview = typeof sp.preview === 'string' ? sp.preview : undefined;
  const debug = sp.debug === 'true' || sp.debug === '1';
  const locale = typeof sp.locale === 'string' ? sp.locale : 'en-US';
  const sessionId = typeof sp.preview_session_id === 'string' ? sp.preview_session_id : undefined;
  const spaceId = process.env.SPACE_ID ?? '';
  const environmentId = process.env.ENVIRONMENT_ID ?? 'master';
  const previewToken = process.env.CPA_TOKEN;
  const previewSessionOptions = { spaceId, environmentId, previewToken, sessionId };
  const livePreview = Boolean(sessionId && previewToken);
  const previewMode = preview === 'true' || preview === '1' || livePreview;

  const userAgent = (await headers()).get('user-agent') ?? '';
  const initialViewportId = detectViewportFromUserAgent(userAgent);

  const experience = await fetchExperience(
    {
      spaceId,
      environmentId,
      experienceId,
      locale,
    },
    {
      accessToken: process.env.CDA_TOKEN!,
      previewToken,
      preview: previewMode,
    },
    {
      config: experienceConfig,
      metadata: { slug: experienceId, locale },
      debug,
      // Pre-resolve design against the UA-detected viewport (same seed the
      // renderer uses) so SSR paints correct design on first render.
      initialViewportId,
    }
  );

  if (livePreview) {
    return (
      <LivePreviewExperience
        initialPlan={experience}
        previewSessionOptions={previewSessionOptions}
        initialViewportId={initialViewportId}
        metadata={{ slug: experienceId, locale }}
        debug={debug}
      />
    );
  }

  return (
    <ServerExperienceRenderer
      experience={experience}
      config={experienceConfig}
      initialViewportId={initialViewportId}
      metadata={{ slug: experienceId, locale }}
      debug={debug}
    />
  );
}
