import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { PreviewSessionOptions } from '@contentful/experiences-live-preview';

import {
  useExperiencePlan,
  type ExperiencePlanResolveOptions,
} from './use-experience-plan.svelte.js';
import { useLivePreviewExperience } from './use-live-preview-experience.svelte.js';
import { useLivePreviewInspection } from './use-live-preview-inspection.svelte.js';

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

export function useLivePreview(getOptions: () => UseLivePreviewOptions): UseLivePreviewResult {
  const initialPayload = getOptions().initialPayload;
  const previewSessionOptions = $derived(getOptions().previewSessionOptions);
  const sourceMap = $derived(getOptions().inspection || previewSessionOptions?.sourceMap);
  const livePreview = useLivePreviewExperience(() => ({
    previewSessionOptions: previewSessionOptions && { ...previewSessionOptions, sourceMap },
    initialPayload,
  }));

  const plan = useExperiencePlan(() => {
    const { initialPlan, resolveOptions } = getOptions();
    return { payload: livePreview.data, initialPlan, resolveOptions };
  });

  useLivePreviewInspection(() => ({
    sourceMap: plan.data?.sourceMap,
    enabled: getOptions().inspection,
  }));

  return {
    get data() {
      return plan.data;
    },
    get error() {
      return livePreview.error;
    },
  };
}
