import {
  createDebugLogger,
  isExperiencePayload,
  isRecord,
  type ExperiencePayload,
} from '@contentful/experiences-sdk-core';
import { isErrorPayload } from './experience-payload.js';
import { createWebSocketConnection, type WebSocketCloseEvent } from './websocket.js';
import { previewSessionSubscribeUrl } from './preview-session-url.js';
import { LivePreviewConnectionError } from './errors.js';

const RETRY_DELAYS_MS: readonly number[] = [100, 500, 1000];

export type PreviewSessionOptions = {
  spaceId: string;
  environmentId: string;
  previewToken?: string;
  sessionId?: string;
  /**
   * Opaque encoded resource-resolution value for referenced spaces.
   */
  resourceResolution?: string;
  /**
   * Custom WebSocket URL for Preview Session subscriptions (staging, proxy, per-region).
   * Omit to use the production Preview Session WebSocket host.
   */
  sessionHost?: string;
  debug?: boolean;
};

type SessionMessage =
  | { kind: 'next'; payload: ExperiencePayload }
  | { kind: 'error' }
  | { kind: 'unknown' }
  | { kind: 'invalid' };

type PreviewSessionHandlers = {
  onUpdate: (experience: ExperiencePayload) => void;
  onOpen?: () => void;
  onError?: (error: LivePreviewConnectionError) => void;
};

function parseMessage(data: unknown): SessionMessage {
  let message: unknown = data;

  if (typeof data === 'string') {
    try {
      message = JSON.parse(data);
    } catch {
      return { kind: 'invalid' };
    }
  }

  if (!isRecord(message) || typeof message.type !== 'string') {
    return { kind: 'invalid' };
  }

  if (message.type === 'next') {
    return isExperiencePayload(message.data)
      ? { kind: 'next', payload: message.data }
      : { kind: 'invalid' };
  }

  if (message.type === 'error') {
    return isErrorPayload(message.data) ? { kind: 'error' } : { kind: 'invalid' };
  }

  return { kind: 'unknown' };
}

function isSessionEnded(event: WebSocketCloseEvent): boolean {
  if (event.code !== 1000) return false;
  const reason = event.reason.trim().toLowerCase();
  return reason === 'deleted' || reason === 'expired';
}

export function subscribeToPreviewSession(
  options: PreviewSessionOptions,
  handlers: PreviewSessionHandlers
): () => void {
  const log = createDebugLogger(options.debug, 'live-preview');
  const { sessionId, previewToken } = options;
  const { onError, onOpen, onUpdate } = handlers;
  if (sessionId === undefined || previewToken === undefined) return () => undefined;

  const connection = createWebSocketConnection({
    url: previewSessionSubscribeUrl({ ...options, sessionId, previewToken }),
    retry: (failureCount, event) => {
      const sessionEnded = isSessionEnded(event);
      const hasExhaustedRetries = failureCount >= RETRY_DELAYS_MS.length;
      const shouldRetry = !hasExhaustedRetries && !sessionEnded;
      if (hasExhaustedRetries || sessionEnded) {
        onError?.(new LivePreviewConnectionError());
      }
      return shouldRetry;
    },
    retryDelay: (retryAttempt) =>
      RETRY_DELAYS_MS[retryAttempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 0,
    onFailure: () => onError?.(new LivePreviewConnectionError()),
  });

  const unsubscribeFromOpen = onOpen ? connection.onopen(() => onOpen()) : undefined;
  const unsubscribe = connection.onmessage((event) => {
    const message = parseMessage(event.data);

    if (message.kind === 'unknown') return;
    if (message.kind === 'error') {
      log.log('Preview Session returned an error');
      return;
    }
    if (message.kind === 'invalid') {
      log.log('ignored invalid Preview Session message');
      return;
    }

    onUpdate(message.payload);
  });

  return () => {
    unsubscribeFromOpen?.();
    unsubscribe();
    connection.close();
  };
}
