'use client';

import { createLivePreviewClient } from '@contentful/experiences-live-preview';
import { createExperiences, type PortableRenderPlan } from '@contentful/experiences-nextjs/client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { experienceConfig } from '@/lib/experience-config';

const { ExperiencesRoot, Experience, ExperienceRenderer } = createExperiences({
  config: experienceConfig,
});

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

interface LivePreviewExperienceProps {
  experienceId: string;
  initialPlan: PortableRenderPlan;
  metadata?: Record<string, unknown>;
  debug?: boolean;
}

export function LivePreviewExperience(props: LivePreviewExperienceProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The layout's Suspense fallback can render the server plan before the SDK root.
  // Start managed preview only after hydration, when that root is available.
  return mounted ? (
    <ManagedLivePreviewExperience {...props} />
  ) : (
    <ExperienceRenderer
      experience={props.initialPlan}
      metadata={props.metadata}
      debug={props.debug}
    />
  );
}

function ManagedLivePreviewExperience({
  experienceId,
  initialPlan,
  metadata,
  debug,
}: LivePreviewExperienceProps) {
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
