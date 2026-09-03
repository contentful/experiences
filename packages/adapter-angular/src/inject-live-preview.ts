import { type Signal, afterNextRender, computed, effect, signal } from '@angular/core';

import {
  createLivePreviewClient,
  type LivePreviewOptions,
} from '@contentful/experiences-live-preview';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

export type InjectLivePreviewOptions = LivePreviewOptions & {
  initialData?: ExperiencePayload;
};

export interface InjectLivePreviewResult {
  readonly data: Signal<ExperiencePayload | undefined>;
}

type ConnectionOptions = Pick<
  LivePreviewOptions,
  'spaceId' | 'environmentId' | 'previewToken' | 'sessionId' | 'sessionHost' | 'debug'
>;

function areConnectionOptionsEqual(
  first: ConnectionOptions | undefined,
  second: ConnectionOptions
): boolean {
  return (
    first?.spaceId === second.spaceId &&
    first?.environmentId === second.environmentId &&
    first?.previewToken === second.previewToken &&
    first?.sessionId === second.sessionId &&
    first?.sessionHost === second.sessionHost &&
    first?.debug === second.debug
  );
}

export function injectLivePreview(
  getOptions: () => InjectLivePreviewOptions
): InjectLivePreviewResult {
  const browserReady = signal(false);
  const currentData = signal<ExperiencePayload | undefined>(undefined);
  const data = computed(() => currentData() ?? getOptions().initialData);
  const connectionOptions = computed<ConnectionOptions>(
    () => {
      const { spaceId, environmentId, previewToken, sessionId, sessionHost, debug } = getOptions();
      return { spaceId, environmentId, previewToken, sessionId, sessionHost, debug };
    },
    { equal: areConnectionOptionsEqual }
  );

  afterNextRender(() => {
    browserReady.set(true);
  });

  effect((onCleanup) => {
    if (!browserReady()) return;

    const client = createLivePreviewClient(connectionOptions());
    const unsubscribe = client.subscribe(() => {
      currentData.set(client.getSnapshot());
    });
    onCleanup(unsubscribe);
  });

  return { data };
}
