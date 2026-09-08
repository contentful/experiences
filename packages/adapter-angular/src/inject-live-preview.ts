import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { PreviewSessionOptions } from '@contentful/experiences-live-preview';

import {
  injectExperiencePlan,
  type ExperiencePlanResolveOptions,
  type InjectExperiencePlanResult,
} from './inject-experience-plan.js';
import { injectLivePreviewExperience } from './inject-live-preview-experience.js';

export interface InjectLivePreviewOptions {
  previewSessionOptions?: PreviewSessionOptions;
  initialPayload?: ExperiencePayload;
  initialPlan?: PortableRenderPlan;
  resolveOptions: ExperiencePlanResolveOptions;
}

export interface InjectLivePreviewResult {
  readonly data: InjectExperiencePlanResult['data'];
}

export function injectLivePreview(
  getOptions: () => InjectLivePreviewOptions
): InjectLivePreviewResult {
  const livePreview = injectLivePreviewExperience(() => {
    const { previewSessionOptions, initialPayload } = getOptions();
    return { previewSessionOptions, initialPayload };
  });

  return injectExperiencePlan(() => {
    const { initialPlan, resolveOptions } = getOptions();
    return { payload: livePreview.data(), initialPlan, resolveOptions };
  });
}
