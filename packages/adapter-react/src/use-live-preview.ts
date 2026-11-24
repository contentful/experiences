'use client';

import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { PreviewSessionOptions } from '@contentful/experiences-live-preview';

import { useLivePreviewInspection } from './use-live-preview-inspection.js';
import { useLivePreviewExperience } from './use-live-preview-experience.js';
import { useExperiencePlan, type ExperiencePlanResolveOptions } from './use-experience-plan.js';

export interface UseLivePreviewOptions {
  previewSessionOptions?: PreviewSessionOptions;
  initialPayload?: ExperiencePayload;
  initialPlan?: PortableRenderPlan;
  inspection?: boolean;
  resolveOptions: ExperiencePlanResolveOptions;
}

export interface UseLivePreviewResult {
  readonly data: PortableRenderPlan | undefined;
  readonly error: Error | undefined;
}

export function useLivePreview(options: UseLivePreviewOptions): UseLivePreviewResult {
  const livePreview = useLivePreviewExperience({
    previewSessionOptions: options.previewSessionOptions && {
      ...options.previewSessionOptions,
      sourceMap: options.inspection || options.previewSessionOptions.sourceMap,
    },
    initialPayload: options.initialPayload,
  });

  const plan = useExperiencePlan({
    payload: livePreview.data,
    initialPlan: options.initialPlan,
    resolveOptions: options.resolveOptions,
  });

  useLivePreviewInspection({ sourceMap: plan.data?.sourceMap, enabled: options.inspection });

  return { data: plan.data, error: livePreview.error };
}
