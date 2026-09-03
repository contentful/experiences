import { vi } from 'vitest';
import type {
  WebSocketCloseEvent,
  WebSocketMessageEvent,
  WebSocketOpenEvent,
} from '../websocket.js';

export type FakeSocket = {
  readonly url: string;
  onopen: ((event: WebSocketOpenEvent) => void) | null;
  onclose: ((event: WebSocketCloseEvent) => void) | null;
  onmessage: ((event: WebSocketMessageEvent) => void) | null;
  close: ReturnType<typeof vi.fn>;
  emitClose(code?: number, reason?: string): void;
  emitMessage(data: unknown): void;
};

export const sockets: FakeSocket[] = [];

export class FakeWebSocket {
  readonly url: string;
  onopen: ((event: WebSocketOpenEvent) => void) | null = null;
  onclose: ((event: WebSocketCloseEvent) => void) | null = null;
  onmessage: ((event: WebSocketMessageEvent) => void) | null = null;
  readonly close = vi.fn();

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }

  emitOpen(): void {
    this.onopen?.({ type: 'open' });
  }

  emitClose(code = 1000, reason = ''): void {
    this.onclose?.({ code, reason });
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data });
  }
}

export function resetSockets(): void {
  sockets.length = 0;
}

export function runSocketRetries(count: number, code = 1000, reason = ''): void {
  for (let retry = 0; retry < count; retry += 1) {
    sockets.at(-1)?.emitClose(code, reason);
    vi.runOnlyPendingTimers();
  }
}
