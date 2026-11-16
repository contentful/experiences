'use client';

import { createLivePreviewClient } from '@contentful/experiences-live-preview';
import { createExperiences, type PortableRenderPlan } from '@contentful/experiences-react/client';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

import { experienceConfig } from '@/lib/experience-config';

const { ExperiencesRoot, Experience } = createExperiences({ config: experienceConfig });

export function PreviewExperiencesRoot({
  spaceId,
  environmentId,
  accessToken,
  previewToken,
  children,
}: {
  spaceId: string;
  environmentId: string;
  accessToken: string;
  /** Explicitly browser-visible Preview API credential. */
  previewToken?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <ExperiencesRoot
      spaceId={spaceId}
      environmentId={environmentId}
      delivery={{ accessToken }}
      preview={
        previewToken?.trim()
          ? { accessToken: previewToken, createClient: createLivePreviewClient }
          : undefined
      }
      routeKey={`${pathname}${searchParams.size ? `?${searchParams}` : ''}`}
    >
      {children}
    </ExperiencesRoot>
  );
}

export function LivePreviewExperience({
  experienceId,
  initialPlan,
  metadata,
  debug,
}: {
  experienceId: string;
  initialPlan: PortableRenderPlan;
  metadata?: Record<string, unknown>;
  debug?: boolean;
}) {
  return (
    <Experience
      experienceId={experienceId}
      initialPlan={initialPlan}
      metadata={metadata}
      debug={debug}
    >
      {({ data, error }) => (
        <>
          {error && (
            <p role="status">Live preview is unavailable. Showing the last valid experience.</p>
          )}
          <Experience experience={data} metadata={metadata} debug={debug} />
        </>
      )}
    </Experience>
  );
}
