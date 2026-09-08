import { type Signal, afterNextRender, computed, effect, signal } from '@angular/core';

import {
  createLivePreviewClient,
  type PreviewSessionOptions,
} from '@contentful/experiences-live-preview';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

export type InjectLivePreviewExperienceOptions = {
  previewSessionOptions?: PreviewSessionOptions;
  initialPayload?: ExperiencePayload;
};

export interface InjectLivePreviewExperienceResult {
  readonly data: Signal<ExperiencePayload | undefined>;
}

type ConnectionOptions = PreviewSessionOptions | undefined;

function areConnectionOptionsEqual(first: ConnectionOptions, second: ConnectionOptions): boolean {
  if (first === undefined || second === undefined) return first === second;

  return (
    first?.spaceId === second.spaceId &&
    first?.environmentId === second.environmentId &&
    first?.previewToken === second.previewToken &&
    first?.sessionId === second.sessionId &&
    first?.sessionHost === second.sessionHost &&
    first?.debug === second.debug
  );
}

export function injectLivePreviewExperience(
  getOptions: () => InjectLivePreviewExperienceOptions
): InjectLivePreviewExperienceResult {
  const browserReady = signal(false);
  const currentData = signal<ExperiencePayload | undefined>(undefined);
  const data = computed(() => currentData() ?? getOptions().initialPayload);
  const connectionOptions = computed<ConnectionOptions>(() => getOptions().previewSessionOptions, {
    equal: areConnectionOptionsEqual,
  });

  afterNextRender(() => {
    browserReady.set(true);
  });

  effect((onCleanup) => {
    if (!browserReady()) return;

    const options = connectionOptions();
    if (options === undefined) return;

    const client = createLivePreviewClient(options);
    const unsubscribe = client.subscribe(() => {
      currentData.set(client.getSnapshot());
    });
    onCleanup(unsubscribe);
  });

  return { data };
}
