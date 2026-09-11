'use client';

import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { PreviewSessionOptions } from '@contentful/experiences-live-preview';

import { useLivePreviewExperience } from './use-live-preview-experience';
import { useExperiencePlan, type ExperiencePlanResolveOptions } from './use-experience-plan';

export interface UseLivePreviewOptions {
  previewSessionOptions?: PreviewSessionOptions;
  initialPayload?: ExperiencePayload;
  initialPlan?: PortableRenderPlan;
  resolveOptions: ExperiencePlanResolveOptions;
}

export interface UseLivePreviewResult {
  readonly data: PortableRenderPlan | undefined;
}

export function useLivePreview(options: UseLivePreviewOptions): UseLivePreviewResult {
  const livePreview = useLivePreviewExperience({
    previewSessionOptions: options.previewSessionOptions,
    initialPayload: options.initialPayload,
  });

  return useExperiencePlan({
    payload: livePreview.data,
    initialPlan: options.initialPlan,
    resolveOptions: options.resolveOptions,
  });
}
