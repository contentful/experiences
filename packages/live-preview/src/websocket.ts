export type WebSocketCloseEvent = {
  readonly code: number;
  readonly reason: string;
};

export type WebSocketOpenEvent = {
  readonly type: string;
};

export type WebSocketMessageEvent = {
  readonly data: unknown;
};

type WebSocket = {
  onopen: ((event: WebSocketOpenEvent) => void) | null;
  onclose: ((event: WebSocketCloseEvent) => void) | null;
  onmessage: ((event: WebSocketMessageEvent) => void) | null;
  close(): void;
};

type WebSocketConstructor = new (url: string) => WebSocket;

type WebSocketConnection = {
  close(): void;
  onopen(handler: (event: WebSocketOpenEvent) => void): () => void;
  onmessage(handler: (event: WebSocketMessageEvent) => void): () => void;
};

export function createWebSocketConnection(options: {
  url: string;
  retry?: number | ((failureCount: number, event: WebSocketCloseEvent) => boolean);
  retryDelay?: number | ((retryAttempt: number, event: WebSocketCloseEvent) => number);
  WebSocket?: WebSocketConstructor;
}): WebSocketConnection {
  const WS = options.WebSocket ?? (globalThis.WebSocket as WebSocketConstructor | undefined);
  if (!WS) throw new Error('WebSocket constructor is not available in this runtime.');

  let websocket: WebSocket | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryCount = 0;
  let closed = false;

  const openHandlers = new Set<(event: WebSocketOpenEvent) => void>();
  const messageHandlers = new Set<(event: WebSocketMessageEvent) => void>();

  const clearRetryTimer = () => {
    if (retryTimer === undefined) return;
    clearTimeout(retryTimer);
    retryTimer = undefined;
  };

  const clearHandlers = () => {
    openHandlers.clear();
    messageHandlers.clear();
  };

  const detachSocketHandlers = (currentSocket: WebSocket) => {
    currentSocket.onopen = null;
    currentSocket.onmessage = null;
    currentSocket.onclose = null;
  };

  const shouldRetry = (event: WebSocketCloseEvent) => {
    if (closed) return false;
    if (typeof options.retry === 'number') return retryCount < options.retry;
    if (typeof options.retry === 'function') return options.retry(retryCount, event);
    return false;
  };

  const getRetryDelay = (event: WebSocketCloseEvent) => {
    if (typeof options.retryDelay === 'function') {
      return options.retryDelay(retryCount, event);
    }
    return options.retryDelay ?? 0;
  };

  const handleClose = (currentSocket: WebSocket, event: WebSocketCloseEvent) => {
    if (websocket !== currentSocket) return;

    websocket = undefined;
    detachSocketHandlers(currentSocket);

    if (closed || !shouldRetry(event)) {
      closed = true;
      clearHandlers();
      return;
    }

    const delay = getRetryDelay(event);
    retryCount += 1;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (closed) return;
      try {
        connect();
      } catch {
        closed = true;
        clearHandlers();
      }
    }, delay);
  };

  const connect = () => {
    if (closed || websocket !== undefined || retryTimer !== undefined) return;

    const ws = new WS(options.url);
    websocket = ws;
    ws.onclose = (event) => handleClose(ws, event);
    ws.onopen = (event) => {
      if (websocket !== ws || closed) return;

      let handlerError: unknown;
      let hasHandlerError = false;

      for (const handler of [...openHandlers]) {
        try {
          handler(event);
        } catch (error: unknown) {
          if (!hasHandlerError) handlerError = error;
          hasHandlerError = true;
        }
      }

      if (hasHandlerError) throw handlerError;
    };
    ws.onmessage = (event) => {
      if (websocket !== ws || closed) return;

      let handlerError: unknown;
      let hasHandlerError = false;

      for (const handler of [...messageHandlers]) {
        try {
          handler(event);
        } catch (error: unknown) {
          if (!hasHandlerError) handlerError = error;
          hasHandlerError = true;
        }
      }

      if (hasHandlerError) throw handlerError;
    };
  };

  const connection: WebSocketConnection = {
    close() {
      if (closed) return;
      closed = true;
      clearRetryTimer();

      const currentSocket = websocket;
      if (!currentSocket) {
        clearHandlers();
        return;
      }

      detachSocketHandlers(currentSocket);
      clearHandlers();
      currentSocket.close();
    },
    onopen(handler) {
      if (closed) return () => undefined;

      openHandlers.add(handler);
      return () => {
        openHandlers.delete(handler);
      };
    },
    onmessage(handler) {
      if (closed) return () => undefined;

      messageHandlers.add(handler);
      return () => {
        messageHandlers.delete(handler);
      };
    },
  };

  connect();
  return connection;
}
