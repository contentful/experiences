'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  createLivePreviewClient,
  sendPreviewStatus,
  type LivePreviewClient,
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
    previewSessionOptions?.resourceResolution,
    previewSessionOptions?.sessionHost,
    previewSessionOptions?.debug,
  ]);

  const emptySource = useMemo<Pick<LivePreviewClient, 'getResult' | 'subscribe'>>(() => {
    const result: LivePreviewResult = { data: initialPayload, error: undefined };
    return {
      getResult: () => result,
      subscribe: () => () => undefined,
    };
  }, [initialPayload]);
  const source = client ?? emptySource;
  const result = useSyncExternalStore(source.subscribe, source.getResult, source.getResult);

  useEffect(() => {
    if (client === undefined) {
      sendPreviewStatus('static');
      return;
    }

    return client.subscribeStatus(sendPreviewStatus);
  }, [client]);

  return result;
}
