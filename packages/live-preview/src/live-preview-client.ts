import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { subscribeToPreviewSession, type PreviewSessionOptions } from './preview-session.js';

export type LivePreviewStatus = 'live' | 'static';

export type LivePreviewResult = {
  readonly data: ExperiencePayload | undefined;
  readonly error: Error | undefined;
};

export type LivePreviewClient = {
  getResult(): LivePreviewResult;
  /** @deprecated Use getResult().data instead. */
  getSnapshot(): ExperiencePayload | undefined;
  subscribe(listener: () => void): () => void;
  subscribeStatus(listener: (status: LivePreviewStatus) => void): () => void;
};

export function createLivePreviewClient(
  previewSessionOptions: PreviewSessionOptions,
  initialPayload?: ExperiencePayload
): LivePreviewClient {
  const listeners = new Set<{ handler: () => void }>();
  const statusListeners = new Set<{ handler: (status: LivePreviewStatus) => void }>();
  const notifyListeners = (): void => {
    for (const { handler } of [...listeners]) handler();
  };

  const hasLivePreviewOptions =
    previewSessionOptions.sessionId !== undefined &&
    previewSessionOptions.previewToken !== undefined;
  let currentStatus: LivePreviewStatus | undefined = hasLivePreviewOptions ? undefined : 'static';
  let currentResult: LivePreviewResult = { data: initialPayload, error: undefined };
  let unsubscribeFromSession: (() => void) | undefined;

  const updateData = (data: ExperiencePayload): void => {
    currentResult = { ...currentResult, data };
    notifyListeners();
  };

  const updateError = (error: Error): void => {
    currentResult = { ...currentResult, error };
    updateStatus('static');
    notifyListeners();
  };

  const updateStatus = (status: LivePreviewStatus): void => {
    if (status === 'live' && currentResult.error !== undefined) {
      currentResult = { ...currentResult, error: undefined };
      notifyListeners();
    }
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
    getResult: () => currentResult,
    getSnapshot: () => currentResult.data,
    subscribe(listener) {
      const subscription = { handler: listener };
      const isFirstSubscriber = listeners.size === 0;
      listeners.add(subscription);
      if (isFirstSubscriber) {
        try {
          unsubscribeFromSession = subscribeToPreviewSession(previewSessionOptions, {
            onOpen: () => updateStatus('live'),
            onError: updateError,
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
