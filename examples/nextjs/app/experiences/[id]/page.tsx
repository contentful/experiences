import { ContentfulExperiences } from '@contentful/experiences-node';
import { headers } from 'next/headers';

import {
  ServerExperienceRenderer,
  type ExperienceParameters,
} from '@contentful/experiences-nextjs/server';

import { LivePreviewExperience } from '@/components/LivePreviewExperience';
import { RuntimeParametersForm } from '@/components/RuntimeParametersForm';
import { experienceConfig } from '@/lib/experience-config';
import { buildPagePersonalization } from '@/lib/personalization';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExperiencePage({ params, searchParams }: PageProps) {
  const { id: experienceId } = await params;
  const sp = (await searchParams) ?? {};

  const debug = sp.debug === 'true' || sp.debug === '1';
  const personalizationEnabled = sp.personalization === 'true' || sp.personalization === '1';
  const locale = typeof sp.locale === 'string' ? sp.locale : 'en-US';
  const sessionId =
    typeof sp.preview_session_id === 'string'
      ? sp.preview_session_id.trim() || undefined
      : undefined;
  const spaceId = process.env.SPACE_ID ?? '';
  const environmentId = process.env.ENVIRONMENT_ID ?? 'master';
  const accessToken = process.env.CDA_TOKEN!;
  const previewToken = process.env.CPA_TOKEN?.trim() || undefined;
  const sdk = new ContentfulExperiences({
    spaceId,
    environmentId,
    delivery: { accessToken },
    preview: previewToken ? { accessToken: previewToken } : undefined,
  });
  const request = sdk.forRequest({ preview: sessionId ? { sessionId } : undefined });
  try {
    const livePreview = request.isPreview;
    const parameterInput = typeof sp.parameters === 'string' ? sp.parameters : undefined;
    const showParameters =
      !livePreview && (sp.parameter_demo === 'true' || parameterInput !== undefined);
    let parameters: ExperienceParameters | undefined;
    if (!livePreview && parameterInput !== undefined) {
      try {
        // Check the form's JSON envelope only. Delivery validates names and values.
        const parsed: unknown = JSON.parse(parameterInput);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Expected a JSON object');
        }
        parameters = parsed as ExperienceParameters;
      } catch {
        return (
          <>
            <RuntimeParametersForm parameters={parameterInput} searchParams={sp} />
            <p role="alert">Parameters must be a JSON object. Correct the value and refetch.</p>
          </>
        );
      }
    }

    const requestHeaders = await headers();
    const forwardedProto = requestHeaders.get('x-forwarded-proto') ?? 'http';
    const host = requestHeaders.get('host') ?? 'localhost:3000';
    const personalization = personalizationEnabled
      ? buildPagePersonalization({
          origin: `${forwardedProto}://${host}`,
          path: `/experiences/${experienceId}`,
          locale,
          referrer: requestHeaders.get('referer') ?? '',
          searchParams: sp,
        })
      : undefined;

    const resolveOptions = {
      config: experienceConfig,
      metadata: { slug: experienceId, locale },
      debug,
    };
    const experience = await request.fetchExperience(
      {
        experienceId,
        // Preview Sessions own their locale and parameter values.
        ...(!request.isPreview ? { locale, parameters, personalization } : {}),
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
          experienceId={experienceId}
          metadata={{ slug: experienceId, locale }}
          debug={debug}
        />
      );
    }

    return (
      <>
        {showParameters && (
          <RuntimeParametersForm parameters={parameterInput ?? '{}'} searchParams={sp} />
        )}
        <ServerExperienceRenderer
          experience={experience}
          config={experienceConfig}
          metadata={{ renderer: 'server' }}
          debug={debug}
        />
      </>
    );
  } finally {
    request.destroy();
  }
}
