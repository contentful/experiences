import {
  ServerExperienceRenderer,
  fetchExperience,
  fetchPreviewSession,
} from '@contentful/experiences-react';

import { LivePreviewExperience } from '@/components/LivePreviewExperience';
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
  const accessToken = process.env.CDA_TOKEN!;
  const previewToken = process.env.CPA_TOKEN;
  const previewSessionOptions = { spaceId, environmentId, previewToken, sessionId };
  const livePreview = sessionId !== undefined && previewToken !== undefined;
  const previewMode = preview === 'true' || preview === '1' || livePreview;

  const resolveOptions = {
    config: experienceConfig,
    metadata: { slug: experienceId, locale },
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
          experienceId,
          locale,
        },
        {
          accessToken,
          previewToken,
          preview: previewMode,
        },
        resolveOptions
      );

  // Both render props are optional — the plan already carries what the fetch
  // was given. They are shown here to make the override path visible:
  // `metadata` merges over the plan's, while `debug` replaces it.
  if (livePreview) {
    return (
      <LivePreviewExperience
        initialPlan={experience}
        previewSessionOptions={previewSessionOptions}
        metadata={{ slug: experienceId, locale }}
        debug={debug}
      />
    );
  }

  return (
    <ServerExperienceRenderer
      experience={experience}
      config={experienceConfig}
      metadata={{ renderer: 'server' }}
      debug={debug}
    />
  );
}
