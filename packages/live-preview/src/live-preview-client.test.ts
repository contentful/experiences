import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLivePreviewClient } from './index';
import {
  FakeWebSocket,
  resetSockets,
  runSocketRetries,
  sockets,
} from './test-fixtures/fake-websocket';

const payload = (title: string): ExperiencePayload => ({
  nodes: [
    {
      component: {
        sys: {
          linkType: 'Contentful:Component',
          type: 'ResourceLink',
          urn: 'crn:contentful:::experience:components/hero',
        },
      },
      contentProperties: { title },
    },
  ],
  sys: { type: 'Experience' },
  viewports: [
    {
      displayName: 'Default',
      id: 'default',
      previewSize: '1024px',
      query: '*',
    },
  ],
});

const message = (type: string, data: unknown): string => JSON.stringify({ data, type });

function setBrowser(): void {
  vi.stubGlobal('WebSocket', FakeWebSocket);
}

function sourceOptions(sessionId?: string, overrides: { previewToken?: string } = {}) {
  return {
    environmentId: 'environment-id',
    previewToken: 'preview-token',
    sessionHost: 'wss://preview-session.example.test',
    sessionId,
    spaceId: 'space-id',
    ...overrides,
  };
}

async function waitForSnapshot(source: ReturnType<typeof createLivePreviewClient>): Promise<void> {
  await vi.waitFor(() => {
    expect(source.getSnapshot()).toBeDefined();
  });
}

beforeEach(() => {
  resetSockets();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createLivePreviewClient', () => {
  it('returns initial raw data without opening a socket until subscribed', () => {
    setBrowser();
    const initialData = payload('initial');
    const source = createLivePreviewClient(sourceOptions('session-id'), initialData);

    expect(source.getSnapshot()).toBe(initialData);
    expect(sockets).toHaveLength(0);
  });

  it('does not open a socket until subscribed', () => {
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));

    expect(source.getSnapshot()).toBeUndefined();
    expect(sockets).toHaveLength(0);
  });

  it('does not connect when the session id is omitted', () => {
    setBrowser();
    const source = createLivePreviewClient(sourceOptions());

    const unsubscribe = source.subscribe(vi.fn());

    expect(sockets).toHaveLength(0);
    unsubscribe();
  });

  it('does not connect when the preview token is omitted', () => {
    setBrowser();
    const source = createLivePreviewClient(
      sourceOptions('session-id', { previewToken: undefined })
    );

    const unsubscribe = source.subscribe(vi.fn());

    expect(sockets).toHaveLength(0);
    unsubscribe();
  });

  it('uses the production Session origin when sessionHost is omitted', () => {
    setBrowser();
    const source = createLivePreviewClient({
      ...sourceOptions('session-id'),
      sessionHost: undefined,
    });
    const unsubscribe = source.subscribe(vi.fn());

    expect(sockets[0]?.url).toContain(
      'wss://live-preview-session-api.cloudflare.contentful.org/spaces/space-id'
    );
    unsubscribe();
  });

  it('uses the explicit WebSocket session host', () => {
    setBrowser();
    const source = createLivePreviewClient({
      ...sourceOptions('session-id'),
      sessionHost: 'wss://preview-session.example.test/base',
    });
    const unsubscribe = source.subscribe(vi.fn());

    expect(sockets[0]?.url).toBe(
      'wss://preview-session.example.test/base/spaces/space-id/environments/environment-id/preview_sessions/session-id/subscribe?access_token=preview-token'
    );
    unsubscribe();
  });

  it('returns the raw data from a valid next message', async () => {
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);
    const socket = sockets[0];
    const expected = payload('hello');

    socket?.emitMessage(message('next', expected));
    await waitForSnapshot(source);

    expect(source.getSnapshot()).toEqual(expected);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('retains the last data for unknown, invalid, and error messages', async () => {
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));
    const unsubscribe = source.subscribe(vi.fn());
    const socket = sockets[0];

    socket?.emitMessage(message('next', payload('valid')));
    await waitForSnapshot(source);
    const validData = source.getSnapshot();

    socket?.emitMessage(message('unknown', {}));
    socket?.emitMessage('{not-json');
    socket?.emitMessage(message('error', { sys: { type: 'Error', id: 'ServerError' } }));
    socket?.emitMessage(message('error', null));
    socket?.emitMessage(message('next', { ...payload('invalid-nodes'), nodes: 'not-an-array' }));
    socket?.emitMessage(message('next', { ...payload('invalid-sys'), sys: null }));

    await Promise.resolve();
    expect(source.getSnapshot()).toBe(validData);
    expect(sockets).toHaveLength(1);
    unsubscribe();
  });

  it('returns complete ExperienceFragment data', async () => {
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);
    const socket = sockets[0];
    const expected = {
      ...payload('fragment'),
      sys: { type: 'ExperienceFragment' },
    };

    socket?.emitMessage(message('next', expected));
    await waitForSnapshot(source);

    expect(source.getSnapshot()).toEqual(expected);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('returns each valid next message in order', () => {
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);
    const socket = sockets[0];
    const first = payload('first');
    const second = payload('second');

    socket?.emitMessage(message('next', first));
    socket?.emitMessage(message('next', second));

    expect(source.getSnapshot()).toEqual(second);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('retries transport closure at most three times and then stops', () => {
    vi.useFakeTimers();
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));
    const unsubscribe = source.subscribe(vi.fn());

    runSocketRetries(3);

    expect(sockets).toHaveLength(4);
    sockets.at(-1)?.emitClose();
    vi.runOnlyPendingTimers();
    expect(sockets).toHaveLength(4);
    unsubscribe();
  });

  it('does not retry after the session is deleted or expired', () => {
    vi.useFakeTimers();
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));
    const unsubscribe = source.subscribe(vi.fn());

    sockets[0]?.emitClose(1000, 'expired');
    vi.runAllTimers();

    expect(sockets).toHaveLength(1);
    unsubscribe();
  });

  it('propagates socket construction failures without logging a credential-bearing URL', () => {
    setBrowser();
    const credentialError = new Error(
      'failed to construct wss://preview-session.example.test?access_token=preview-token'
    );
    class ThrowingWebSocket {
      constructor() {
        throw credentialError;
      }
    }
    vi.stubGlobal('WebSocket', ThrowingWebSocket);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const source = createLivePreviewClient({ ...sourceOptions('session-id'), debug: true });
    expect(() => source.subscribe(vi.fn())).toThrow(credentialError);

    expect(JSON.stringify(log.mock.calls)).not.toContain('preview-token');
  });

  it('closes an open socket after the last unsubscribe', () => {
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));
    const unsubscribe = source.subscribe(vi.fn());
    const socket = sockets[0];

    unsubscribe();

    expect(socket?.close).toHaveBeenCalledTimes(1);
  });

  it('keeps a shared socket open until the last subscriber unsubscribes', () => {
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));
    const firstUnsubscribe = source.subscribe(vi.fn());
    const secondUnsubscribe = source.subscribe(vi.fn());
    const socket = sockets[0];

    firstUnsubscribe();
    expect(socket?.close).not.toHaveBeenCalled();

    secondUnsubscribe();
    expect(socket?.close).toHaveBeenCalledTimes(1);
  });

  it('keeps a shared socket open until duplicate subscriptions unsubscribe', () => {
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));
    const listener = vi.fn();
    const firstUnsubscribe = source.subscribe(listener);
    const secondUnsubscribe = source.subscribe(listener);
    const socket = sockets[0];

    firstUnsubscribe();
    expect(socket?.close).not.toHaveBeenCalled();

    secondUnsubscribe();
    expect(socket?.close).toHaveBeenCalledTimes(1);
  });

  it('creates a fresh connection after the last unsubscribe', () => {
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));
    const firstUnsubscribe = source.subscribe(vi.fn());

    firstUnsubscribe();
    const secondUnsubscribe = source.subscribe(vi.fn());

    expect(sockets).toHaveLength(2);
    secondUnsubscribe();
  });

  it('clears a pending retry after the last unsubscribe', () => {
    vi.useFakeTimers();
    setBrowser();
    const source = createLivePreviewClient(sourceOptions('session-id'));
    const unsubscribe = source.subscribe(vi.fn());
    const socket = sockets[0];

    socket?.emitClose();
    unsubscribe();
    vi.runAllTimers();

    expect(sockets).toHaveLength(1);
  });

  it('connects from SSR with an explicit session id and WebSocket implementation', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const source = createLivePreviewClient(sourceOptions('server-session'));
    const unsubscribe = source.subscribe(vi.fn());

    expect(sockets[0]?.url).toContain('/preview_sessions/server-session/subscribe');
    unsubscribe();
  });

  it('throws when an SSR subscription has a session but no WebSocket implementation', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('WebSocket', undefined);
    const source = createLivePreviewClient(sourceOptions('session-id'));

    expect(() => source.subscribe(vi.fn())).toThrow(
      'WebSocket constructor is not available in this runtime.'
    );
    expect(source.getSnapshot()).toBeUndefined();
  });

  it('does not require WebSocket support during SSR without a session id', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('WebSocket', undefined);
    const source = createLivePreviewClient(sourceOptions());

    expect(() => source.subscribe(vi.fn())).not.toThrow();
    expect(source.getSnapshot()).toBeUndefined();
  });
});
