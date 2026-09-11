'use client';

import {
  ClientExperienceRenderer,
  useLivePreview,
  type PortableRenderPlan,
  type PreviewSessionOptions,
} from '@contentful/experiences-react';

import { experienceConfig } from '@/lib/experience-config';

interface LivePreviewExperienceProps {
  initialPlan: PortableRenderPlan;
  previewSessionOptions?: PreviewSessionOptions;
  initialViewportId?: string;
  metadata?: Record<string, unknown>;
  debug?: boolean;
}

export function LivePreviewExperience({
  initialPlan,
  previewSessionOptions,
  initialViewportId,
  metadata,
  debug,
}: LivePreviewExperienceProps) {
  const livePreview = useLivePreview({
    previewSessionOptions,
    initialPlan,
    resolveOptions: {
      config: experienceConfig,
      initialViewportId,
      metadata,
      debug,
    },
  });

  return (
    <ClientExperienceRenderer
      experience={livePreview.data}
      config={experienceConfig}
      initialViewportId={initialViewportId}
      metadata={metadata}
      debug={debug}
    />
  );
}
