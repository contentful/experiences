import { headers } from 'next/headers';

import {
  ServerExperienceRenderer,
  fetchExperience,
  fetchPreviewSession,
  type ExperienceParameters,
} from '@contentful/experiences-react';

import { LivePreviewExperience } from '@/components/LivePreviewExperience';
import { RuntimeParametersForm } from '@/components/RuntimeParametersForm';
import { experienceConfig } from '@/lib/experience-config';
import { buildPagePersonalization } from '@/lib/personalization';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExperiencePage({ params, searchParams }: PageProps) {
  const { slug: experienceId } = await params;
  const sp = (await searchParams) ?? {};

  const preview = typeof sp.preview === 'string' ? sp.preview : undefined;
  const debug = sp.debug === 'true' || sp.debug === '1';
  const personalizationEnabled = sp.personalization === 'true' || sp.personalization === '1';
  const locale = typeof sp.locale === 'string' ? sp.locale : 'en-US';
  const sessionId = typeof sp.preview_session_id === 'string' ? sp.preview_session_id : undefined;
  const spaceId = process.env.SPACE_ID ?? '';
  const environmentId = process.env.ENVIRONMENT_ID ?? 'master';
  const accessToken = process.env.CDA_TOKEN!;
  const previewToken = process.env.CPA_TOKEN;
  const previewSessionOptions = { spaceId, environmentId, previewToken, sessionId };
  const livePreview = sessionId !== undefined && previewToken !== undefined;
  const previewMode = preview === 'true' || preview === '1' || livePreview;
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
        path: `/${experienceId}`,
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
          parameters,
          personalization,
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
}
