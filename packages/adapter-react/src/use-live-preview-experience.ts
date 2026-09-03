'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  createLivePreviewClient,
  sendPreviewStatus,
  type PreviewSessionOptions,
} from '@contentful/experiences-live-preview';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

export type UseLivePreviewExperienceOptions = {
  previewSessionOptions?: PreviewSessionOptions;
  initialPayload?: ExperiencePayload;
};

export interface UseLivePreviewExperienceResult {
  readonly data: ExperiencePayload | undefined;
}

export function useLivePreviewExperience(
  options: UseLivePreviewExperienceOptions
): UseLivePreviewExperienceResult {
  const { previewSessionOptions, initialPayload } = options;
  const client = useMemo(() => {
    if (previewSessionOptions === undefined) return undefined;

    return createLivePreviewClient(previewSessionOptions, initialPayload);
  }, [
    previewSessionOptions?.spaceId,
    previewSessionOptions?.environmentId,
    previewSessionOptions?.previewToken,
    previewSessionOptions?.sessionId,
    previewSessionOptions?.sessionHost,
    previewSessionOptions?.debug,
  ]);

  const emptySource = useMemo(
    () => ({
      getSnapshot: () => initialPayload,
      subscribe: () => () => undefined,
    }),
    [initialPayload]
  );
  const source = client ?? emptySource;
  const data = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);

  useEffect(() => {
    if (client === undefined) {
      sendPreviewStatus('static');
      return;
    }

    return client.subscribeStatus(sendPreviewStatus);
  }, [client]);

  return { data };
}
