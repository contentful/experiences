'use client';

import {
  ExperienceRenderer,
  useLivePreview,
  type PortableRenderPlan,
  type PreviewSessionOptions,
} from '@contentful/experiences-react';

import { experienceConfig } from '@/lib/experience-config';

interface LivePreviewExperienceProps {
  initialPlan: PortableRenderPlan;
  previewSessionOptions?: PreviewSessionOptions;
  metadata?: Record<string, unknown>;
  debug?: boolean;
}

export function LivePreviewExperience({
  initialPlan,
  previewSessionOptions,
  metadata,
  debug,
}: LivePreviewExperienceProps) {
  const livePreview = useLivePreview({
    previewSessionOptions,
    initialPlan,
    resolveOptions: { config: experienceConfig, metadata, debug },
  });

  return (
    <ExperienceRenderer
      experience={livePreview.data}
      config={experienceConfig}
      metadata={metadata}
      debug={debug}
    />
  );
}
