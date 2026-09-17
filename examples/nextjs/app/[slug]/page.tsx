import { ExperienceRenderer, fetchExperience } from '@contentful/experiences-react';

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
  const livePreview = Boolean(sessionId && previewToken);
  const previewMode = preview === 'true' || preview === '1' || livePreview;

  const experience = await fetchExperience(
    {
      spaceId,
      environmentId,
      experienceId,
    },
    {
      accessToken,
      previewToken,
      preview: previewMode,
    },
    {
      config: experienceConfig,
      debug,
    }
  );

  // Both render props are optional — the plan already carries what
  // `fetchExperience` was given. Bound here to show the override path:
  // `metadata` merges over the plan's, `debug` replaces it.
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
    <ExperienceRenderer
      experience={experience}
      config={experienceConfig}
      metadata={{ renderer: 'server' }}
      debug={debug}
    />
  );
}
