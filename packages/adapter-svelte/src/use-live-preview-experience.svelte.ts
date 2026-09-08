import {
  createLivePreviewClient,
  type PreviewSessionOptions,
} from '@contentful/experiences-live-preview';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

export type UseLivePreviewExperienceOptions = {
  previewSessionOptions: PreviewSessionOptions;
  initialPayload?: ExperiencePayload;
};

export interface UseLivePreviewExperienceResult {
  readonly data: ExperiencePayload | undefined;
}

export function useLivePreviewExperience(
  getOptions: () => UseLivePreviewExperienceOptions
): UseLivePreviewExperienceResult {
  const initialPayload = getOptions().initialPayload;
  let data = $state<ExperiencePayload | undefined>(initialPayload);

  $effect(() => {
    const { previewSessionOptions } = getOptions();
    const client = createLivePreviewClient(previewSessionOptions, initialPayload);

    data = client.getSnapshot();
    const unsubscribe = client.subscribe(() => {
      data = client.getSnapshot();
    });

    return unsubscribe;
  });

  return {
    get data() {
      return data;
    },
  };
}
