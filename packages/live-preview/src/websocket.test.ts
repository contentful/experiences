import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebSocketConnection,
  type WebSocketCloseEvent,
  type WebSocketMessageEvent,
} from './websocket';
import {
  FakeWebSocket,
  resetSockets,
  runSocketRetries,
  sockets,
} from './test-fixtures/fake-websocket';

function createConnection(overrides: Record<string, unknown> = {}) {
  return createWebSocketConnection({
    WebSocket: FakeWebSocket,
    url: 'wss://preview-session.example.test/subscribe',
    ...overrides,
  });
}

beforeEach(() => {
  resetSockets();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('createWebSocketConnection', () => {
  it('opens immediately and exposes message registration', () => {
    const connection = createConnection();
    const message = vi.fn();

    connection.onmessage(message);

    expect(sockets[0]?.url).toBe('wss://preview-session.example.test/subscribe');

    sockets[0]?.emitMessage('payload');

    expect(message).toHaveBeenCalledWith({ data: 'payload' });
    connection.close();
  });

  it('supports multiple handlers and individual unsubscription', () => {
    const connection = createConnection();
    const first = vi.fn();
    const second = vi.fn();
    const removeFirst = connection.onmessage(first);
    connection.onmessage(second);

    removeFirst();
    sockets[0]?.emitMessage('payload');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('closes permanently and suppresses stale events after close', () => {
    const connection = createConnection();
    const message = vi.fn();
    connection.onmessage(message);

    connection.close();
    connection.close();
    sockets[0]?.emitMessage('late payload');
    sockets[0]?.emitClose(1000, 'closed');
    sockets[0]?.emitMessage('later payload');

    expect(sockets[0]?.close).toHaveBeenCalledTimes(1);
    expect(message).not.toHaveBeenCalled();
  });

  it('does not retry unless retry is configured', () => {
    vi.useFakeTimers();
    const connection = createConnection();

    sockets[0]?.emitClose(1006, 'network');
    vi.runAllTimers();

    expect(sockets).toHaveLength(1);
    connection.close();
  });

  it('cancels a pending retry when closed', () => {
    vi.useFakeTimers();
    const connection = createConnection({ retry: 3, retryDelay: 25 });

    sockets[0]?.emitClose(1006, 'network');
    connection.close();
    vi.runAllTimers();

    expect(sockets).toHaveLength(1);
  });

  it('retries with the configured delay and stops after the retry budget', () => {
    vi.useFakeTimers();
    const connection = createConnection({
      retry: 3,
      retryDelay: (attempt: number) => [100, 500, 1000][attempt] ?? 1000,
    });

    runSocketRetries(3, 1006, 'network');

    expect(sockets).toHaveLength(4);
    sockets.at(-1)?.emitClose(1006, 'network');
    vi.runOnlyPendingTimers();
    expect(sockets).toHaveLength(4);
    connection.close();
  });

  it('passes the close event and failure count to the retry predicate', () => {
    vi.useFakeTimers();
    const shouldRetry = vi.fn((failureCount: number, event: WebSocketCloseEvent) => {
      return failureCount === 0 && event.code === 1006;
    });
    const connection = createConnection({
      retry: shouldRetry,
      retryDelay: 25,
    });

    sockets[0]?.emitClose(1006, 'network');
    vi.advanceTimersByTime(25);
    sockets[1]?.emitClose(1000, 'expired');

    expect(shouldRetry).toHaveBeenNthCalledWith(1, 0, { code: 1006, reason: 'network' });
    expect(shouldRetry).toHaveBeenNthCalledWith(2, 1, { code: 1000, reason: 'expired' });
    expect(sockets).toHaveLength(2);
    connection.close();
  });

  it('continues dispatching when one handler throws', () => {
    const connection = createConnection();
    const failure = new Error('handler failed');
    const first = vi.fn(() => {
      throw failure;
    });
    const second = vi.fn();
    connection.onmessage(first);
    connection.onmessage(second);

    expect(() => sockets[0]?.emitMessage('payload')).toThrow(failure);
    expect(second).toHaveBeenCalledTimes(1);
    connection.close();
  });

  it('propagates missing WebSocket support', () => {
    vi.stubGlobal('WebSocket', undefined);

    expect(() =>
      createWebSocketConnection({
        url: 'wss://preview-session.example.test/subscribe',
      })
    ).toThrow('WebSocket constructor is not available in this runtime.');
  });

  it('propagates synchronous constructor failures', () => {
    const failure = new Error('invalid WebSocket configuration');
    class ThrowingWebSocket {
      onopen: ((event: { type: string }) => void) | null = null;
      onclose: ((event: WebSocketCloseEvent) => void) | null = null;
      onmessage: ((event: WebSocketMessageEvent) => void) | null = null;

      close(): void {}

      constructor(_url: string) {
        throw failure;
      }
    }

    expect(() =>
      createWebSocketConnection({
        url: 'wss://preview-session.example.test/subscribe',
        WebSocket: ThrowingWebSocket,
      })
    ).toThrow(failure);
  });

  it('does not throw when a retry cannot construct a socket', () => {
    vi.useFakeTimers();
    const failure = new Error('retry failed');
    let attempts = 0;

    class RetryThenThrowWebSocket {
      static firstInstance: RetryThenThrowWebSocket | undefined;
      onopen: ((event: { type: string }) => void) | null = null;
      onclose: ((event: WebSocketCloseEvent) => void) | null = null;
      onmessage: ((event: WebSocketMessageEvent) => void) | null = null;

      constructor() {
        attempts += 1;
        if (attempts > 1) throw failure;
        RetryThenThrowWebSocket.firstInstance = this;
      }

      close(): void {}
    }

    const connection = createWebSocketConnection({
      WebSocket: RetryThenThrowWebSocket,
      retry: 1,
      retryDelay: 0,
      url: 'wss://preview-session.example.test/subscribe',
    });

    RetryThenThrowWebSocket.firstInstance?.onclose?.({ code: 1006, reason: 'network' });

    expect(() => vi.runOnlyPendingTimers()).not.toThrow();
    expect(attempts).toBe(2);
    connection.close();
  });
});
