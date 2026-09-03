import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { subscribeToPreviewSession } from './preview-session.js';

export type LivePreviewOptions = {
  spaceId: string;
  environmentId: string;
  previewToken?: string;
  sessionId?: string;
  sessionHost?: string;
  debug?: boolean;
};

export type LivePreviewStatus = 'live' | 'static';

export type LivePreviewClient = {
  getSnapshot(): ExperiencePayload | undefined;
  subscribe(listener: () => void): () => void;
  subscribeStatus(listener: (status: LivePreviewStatus) => void): () => void;
};

export function createLivePreviewClient(
  options: LivePreviewOptions,
  initialData?: ExperiencePayload
): LivePreviewClient {
  const listeners = new Set<{ handler: () => void }>();
  const statusListeners = new Set<{ handler: (status: LivePreviewStatus) => void }>();
  const notifyListeners = (): void => {
    for (const { handler } of [...listeners]) handler();
  };

  const hasLivePreviewOptions =
    options.sessionId !== undefined && options.previewToken !== undefined;
  let currentStatus: LivePreviewStatus | undefined = hasLivePreviewOptions ? undefined : 'static';
  let currentData = initialData;
  let unsubscribeFromSession: (() => void) | undefined;

  const updateData = (data: ExperiencePayload): void => {
    currentData = data;
    notifyListeners();
  };

  const updateStatus = (status: LivePreviewStatus): void => {
    if (currentStatus === status) return;
    currentStatus = status;
    for (const { handler } of [...statusListeners]) handler(status);
  };

  const closeSession = (): void => {
    unsubscribeFromSession?.();
    unsubscribeFromSession = undefined;
    if (hasLivePreviewOptions) currentStatus = undefined;
  };

  return {
    getSnapshot: () => currentData,
    subscribe(listener) {
      const subscription = { handler: listener };
      const isFirstSubscriber = listeners.size === 0;
      listeners.add(subscription);
      if (isFirstSubscriber) {
        try {
          unsubscribeFromSession = subscribeToPreviewSession(options, {
            onOpen: () => updateStatus('live'),
            onUpdate: updateData,
          });
        } catch (error: unknown) {
          listeners.delete(subscription);
          closeSession();
          throw error;
        }
      }

      return () => {
        if (!listeners.delete(subscription)) return;
        if (listeners.size === 0) closeSession();
      };
    },
    subscribeStatus(listener) {
      const subscription = { handler: listener };
      statusListeners.add(subscription);
      if (currentStatus !== undefined) listener(currentStatus);

      return () => {
        statusListeners.delete(subscription);
      };
    },
  };
}
