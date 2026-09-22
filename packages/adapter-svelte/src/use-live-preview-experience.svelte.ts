import {
  createLivePreviewClient,
  sendPreviewStatus,
  type LivePreviewResult,
  type PreviewSessionOptions,
} from '@contentful/experiences-live-preview';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

export type UseLivePreviewExperienceOptions = {
  previewSessionOptions?: PreviewSessionOptions;
  initialPayload?: ExperiencePayload;
};

export interface UseLivePreviewExperienceResult {
  readonly data: ExperiencePayload | undefined;
  readonly error: Error | undefined;
}

export function useLivePreviewExperience(
  getOptions: () => UseLivePreviewExperienceOptions
): UseLivePreviewExperienceResult {
  const initialPayload = getOptions().initialPayload;
  let result = $state<LivePreviewResult>({
    data: initialPayload,
    error: undefined,
  });

  $effect(() => {
    const { previewSessionOptions } = getOptions();
    result = { data: initialPayload, error: undefined };
    if (previewSessionOptions === undefined) {
      sendPreviewStatus('static');
      return;
    }

    const client = createLivePreviewClient(previewSessionOptions, initialPayload);
    const unsubscribeStatus = client.subscribeStatus(sendPreviewStatus);

    result = client.getResult();
    const unsubscribe = client.subscribe(() => {
      result = client.getResult();
    });

    return () => {
      unsubscribeStatus();
      unsubscribe();
    };
  });

  return {
    get data() {
      return result.data;
    },
    get error() {
      return result.error;
    },
  };
}
