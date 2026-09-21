import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { PreviewSessionOptions } from '@contentful/experiences-live-preview';

import {
  useExperiencePlan,
  type ExperiencePlanResolveOptions,
} from './use-experience-plan.svelte.js';
import { useLivePreviewExperience } from './use-live-preview-experience.svelte.js';

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

export function useLivePreview(getOptions: () => UseLivePreviewOptions): UseLivePreviewResult {
  const livePreview = useLivePreviewExperience(() => {
    const { previewSessionOptions, initialPayload } = getOptions();
    return { previewSessionOptions, initialPayload };
  });

  const plan = useExperiencePlan(() => {
    const { initialPlan, resolveOptions } = getOptions();
    return { payload: livePreview.data, initialPlan, resolveOptions };
  });

  return {
    get data() {
      return plan.data;
    },
    get error() {
      return livePreview.error;
    },
  };
}
