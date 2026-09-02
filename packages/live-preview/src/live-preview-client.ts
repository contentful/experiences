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

export type LivePreviewClient = {
  getSnapshot(): ExperiencePayload | undefined;
  subscribe(listener: () => void): () => void;
};

export function createLivePreviewClient(
  options: LivePreviewOptions,
  initialData?: ExperiencePayload
): LivePreviewClient {
  const listeners = new Set<{ handler: () => void }>();
  const notifyListeners = (): void => {
    for (const { handler } of [...listeners]) handler();
  };

  let currentData = initialData;
  let unsubscribeFromSession: (() => void) | undefined;

  const updateData = (data: ExperiencePayload): void => {
    currentData = data;
    notifyListeners();
  };

  const closeSession = (): void => {
    unsubscribeFromSession?.();
    unsubscribeFromSession = undefined;
  };

  return {
    getSnapshot: () => currentData,
    subscribe(listener) {
      const subscription = { handler: listener };
      const isFirstSubscriber = listeners.size === 0;
      listeners.add(subscription);
      if (isFirstSubscriber) {
        try {
          unsubscribeFromSession = subscribeToPreviewSession(options, updateData);
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
  };
}
