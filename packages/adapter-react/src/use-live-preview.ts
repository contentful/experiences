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
  readonly error: Error | undefined;
}

export function useLivePreview(options: UseLivePreviewOptions): UseLivePreviewResult {
  const livePreview = useLivePreviewExperience({
    previewSessionOptions: options.previewSessionOptions,
    initialPayload: options.initialPayload,
  });

  const plan = useExperiencePlan({
    payload: livePreview.data,
    initialPlan: options.initialPlan,
    resolveOptions: options.resolveOptions,
  });

  return { data: plan.data, error: livePreview.error };
}
