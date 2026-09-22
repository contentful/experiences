import { type Signal, afterNextRender, computed, effect, signal } from '@angular/core';

import {
  createLivePreviewClient,
  sendPreviewStatus,
  type LivePreviewResult,
  type PreviewSessionOptions,
} from '@contentful/experiences-live-preview';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

export type InjectLivePreviewExperienceOptions = {
  previewSessionOptions?: PreviewSessionOptions;
  initialPayload?: ExperiencePayload;
};

export interface InjectLivePreviewExperienceResult {
  readonly data: Signal<ExperiencePayload | undefined>;
  readonly error: Signal<Error | undefined>;
}

type ConnectionOptions = PreviewSessionOptions | undefined;

function areConnectionOptionsEqual(first: ConnectionOptions, second: ConnectionOptions): boolean {
  if (first === undefined || second === undefined) return first === second;

  return (
    first?.spaceId === second.spaceId &&
    first?.environmentId === second.environmentId &&
    first?.previewToken === second.previewToken &&
    first?.sessionId === second.sessionId &&
    first?.resourceResolution === second.resourceResolution &&
    first?.sessionHost === second.sessionHost &&
    first?.debug === second.debug
  );
}

export function injectLivePreviewExperience(
  getOptions: () => InjectLivePreviewExperienceOptions
): InjectLivePreviewExperienceResult {
  const browserReady = signal(false);
  const currentResult = signal<LivePreviewResult>({ data: undefined, error: undefined });
  const data = computed(() => currentResult().data ?? getOptions().initialPayload);
  const error = computed(() => currentResult().error);
  const connectionOptions = computed<ConnectionOptions>(() => getOptions().previewSessionOptions, {
    equal: areConnectionOptionsEqual,
  });

  afterNextRender(() => {
    browserReady.set(true);
  });

  effect((onCleanup) => {
    if (!browserReady()) return;

    const options = connectionOptions();
    currentResult.update((result) => ({ ...result, error: undefined }));
    if (options === undefined) {
      sendPreviewStatus('static');
      return;
    }

    const client = createLivePreviewClient(options);
    const unsubscribeStatus = client.subscribeStatus(sendPreviewStatus);
    currentResult.set(client.getResult());
    const unsubscribe = client.subscribe(() => {
      currentResult.set(client.getResult());
    });
    onCleanup(() => {
      unsubscribeStatus();
      unsubscribe();
    });
  });

  return { data, error };
}
