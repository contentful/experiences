import { createDebugLogger, type ExperiencePayload } from '@contentful/experiences-sdk-core';
import { createWebSocketConnection, type WebSocketCloseEvent } from './websocket.js';

const DEFAULT_SESSION_HOST = 'wss://live-preview-session-api.cloudflare.contentful.org';
const RETRY_DELAYS_MS: readonly number[] = [100, 500, 1000];

export type PreviewSessionOptions = {
  spaceId: string;
  environmentId: string;
  previewToken?: string;
  sessionId?: string;
  sessionHost?: string;
  debug?: boolean;
};

type SessionMessage =
  | { kind: 'next'; payload: ExperiencePayload }
  | { kind: 'error' }
  | { kind: 'unknown' }
  | { kind: 'invalid' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isExperiencePayload(value: unknown): value is ExperiencePayload {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.viewports)) {
    return false;
  }

  if (!isRecord(value.sys) || Array.isArray(value.sys)) return false;
  return value.sys.type === 'Experience' || value.sys.type === 'ExperienceFragment';
}

function isErrorPayload(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.sys) || Array.isArray(value.sys)) return false;
  return value.sys.type === 'Error' && typeof value.sys.id === 'string';
}

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

function buildWebSocketUrl(
  options: PreviewSessionOptions,
  sessionId: string,
  previewToken: string
): string {
  const url = new globalThis.URL(options.sessionHost ?? DEFAULT_SESSION_HOST);

  const basePath = url.pathname.replace(/\/+$/, '');
  const route = [
    'spaces',
    encodeURIComponent(options.spaceId),
    'environments',
    encodeURIComponent(options.environmentId),
    'preview_sessions',
    encodeURIComponent(sessionId),
    'subscribe',
  ].join('/');
  url.pathname = `${basePath}/${route}`;
  url.searchParams.set('access_token', previewToken);
  url.hash = '';

  return url.toString();
}

function isSessionEnded(event: WebSocketCloseEvent): boolean {
  if (event.code !== 1000) return false;
  const reason = event.reason.trim().toLowerCase();
  return reason === 'deleted' || reason === 'expired';
}

export function subscribeToPreviewSession(
  options: PreviewSessionOptions,
  onUpdate: (experience: ExperiencePayload) => void
): () => void {
  const log = createDebugLogger(options.debug, 'live-preview');
  const { sessionId, previewToken } = options;
  if (sessionId === undefined || previewToken === undefined) return () => undefined;

  const connection = createWebSocketConnection({
    url: buildWebSocketUrl(options, sessionId, previewToken),
    retry: (failureCount, event) => failureCount < RETRY_DELAYS_MS.length && !isSessionEnded(event),
    retryDelay: (retryAttempt) =>
      RETRY_DELAYS_MS[retryAttempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 0,
  });

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
    unsubscribe();
    connection.close();
  };
}
