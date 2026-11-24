import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { PreviewSessionOptions } from '@contentful/experiences-live-preview';

import {
  injectExperiencePlan,
  type ExperiencePlanResolveOptions,
  type InjectExperiencePlanResult,
} from './inject-experience-plan.js';
import {
  injectLivePreviewExperience,
  type InjectLivePreviewExperienceResult,
} from './inject-live-preview-experience.js';
import { injectLivePreviewInspection } from './inject-live-preview-inspection.js';

export interface InjectLivePreviewOptions {
  previewSessionOptions?: PreviewSessionOptions;
  initialPayload?: ExperiencePayload;
  initialPlan?: PortableRenderPlan;
  inspection?: boolean;
  resolveOptions: ExperiencePlanResolveOptions;
}

export interface InjectLivePreviewResult {
  readonly data: InjectExperiencePlanResult['data'];
  readonly error: InjectLivePreviewExperienceResult['error'];
}

export function injectLivePreview(
  getOptions: () => InjectLivePreviewOptions
): InjectLivePreviewResult {
  const livePreview = injectLivePreviewExperience(() => {
    const { previewSessionOptions, initialPayload, inspection } = getOptions();
    return {
      previewSessionOptions: previewSessionOptions && {
        ...previewSessionOptions,
        sourceMap: inspection || previewSessionOptions.sourceMap,
      },
      initialPayload,
    };
  });

  const plan = injectExperiencePlan(() => {
    const { initialPlan, resolveOptions } = getOptions();
    return { payload: livePreview.data(), initialPlan, resolveOptions };
  });

  injectLivePreviewInspection(() => ({
    sourceMap: plan.data()?.sourceMap,
    enabled: getOptions().inspection,
  }));

  return { data: plan.data, error: livePreview.error };
}
