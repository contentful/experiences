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
  const accessToken = process.env.CDA_TOKEN!;
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
      accessToken,
      previewToken,
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
      metadata={{ renderer: 'server' }}
      debug={debug}
    />
  );
}
