/*
 * Transport abstraction. Any duplex message pipe can implement this
 * interface — the client and adapter layers above never touch the wire
 * directly. The postMessage variant ships alongside; WebSocket / WebRTC
 * variants would sit next to it under this module.
 */

import type { AnyMessage, MessageType } from './protocol';

export type MessageHandler<M extends AnyMessage = AnyMessage> = (msg: M) => void;

export interface PreviewChannel {
  send(msg: AnyMessage): void;

  // Register a handler for messages of the given type. Returns an
  // unsubscribe function.
  on<T extends MessageType>(type: T, handler: MessageHandler): () => void;

  close(): void;
}
