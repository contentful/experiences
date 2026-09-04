'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';

import {
  createLivePreviewClient,
  sendPreviewStatus,
  type LivePreviewOptions,
} from '@contentful/experiences-live-preview';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

export type UseLivePreviewOptions = LivePreviewOptions & {
  initialData?: ExperiencePayload;
};

export interface UseLivePreviewResult {
  readonly data: ExperiencePayload | undefined;
}

export function useLivePreview(options: UseLivePreviewOptions): UseLivePreviewResult {
  const initialData = options.initialData;
  const client = useMemo(() => {
    return createLivePreviewClient(
      {
        spaceId: options.spaceId,
        environmentId: options.environmentId,
        previewToken: options.previewToken,
        sessionId: options.sessionId,
        sessionHost: options.sessionHost,
        debug: options.debug,
      },
      initialData
    );
  }, [
    options.spaceId,
    options.environmentId,
    options.previewToken,
    options.sessionId,
    options.sessionHost,
    options.debug,
  ]);

  const data = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => client.subscribeStatus(sendPreviewStatus), [client]);

  return { data };
}
