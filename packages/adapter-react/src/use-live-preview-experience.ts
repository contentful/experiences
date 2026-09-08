'use client';

import { useMemo, useSyncExternalStore } from 'react';

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
  options: UseLivePreviewExperienceOptions
): UseLivePreviewExperienceResult {
  const { previewSessionOptions, initialPayload } = options;
  const client = useMemo(() => {
    return createLivePreviewClient(previewSessionOptions, initialPayload);
  }, [
    previewSessionOptions.spaceId,
    previewSessionOptions.environmentId,
    previewSessionOptions.previewToken,
    previewSessionOptions.sessionId,
    previewSessionOptions.sessionHost,
    previewSessionOptions.debug,
  ]);

  const data = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  return { data };
}
