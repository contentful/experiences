import {
  createLivePreviewClient,
  type LivePreviewOptions,
} from '@contentful/experiences-live-preview';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

export type UseLivePreviewOptions = LivePreviewOptions & {
  initialData?: ExperiencePayload;
};

export interface UseLivePreviewResult {
  readonly data: ExperiencePayload | undefined;
}

export function useLivePreview(getOptions: () => UseLivePreviewOptions): UseLivePreviewResult {
  const initialData = getOptions().initialData;
  let data = $state<ExperiencePayload | undefined>(initialData);

  $effect(() => {
    const { spaceId, environmentId, previewToken, sessionId, sessionHost, debug } = getOptions();
    const client = createLivePreviewClient(
      { spaceId, environmentId, previewToken, sessionId, sessionHost, debug },
      initialData
    );

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
