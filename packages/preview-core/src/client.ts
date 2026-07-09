/*
 * PreviewClient — state machine that runs on the preview (guest) side.
 * Owns the `ready → init → rendered` handshake, sessionId adoption, and a
 * snapshot subscription API suitable for React's useSyncExternalStore or
 * an equivalent adapter in any other framework.
 */

import type { PreviewChannel } from './channel';
import {
  MESSAGE,
  PROTOCOL_VERSION,
  SOURCE,
  isMessage,
  type HydratedView,
  type InitContext,
  type InitMessage,
  type PreviewCapabilities,
  type RenderedPayload,
  type ViewUpdateMessage,
} from './protocol';

export type HandshakeStatus =
  | 'idle'
  | 'ready-sent'
  | 'initialized'
  | 'closed';

export type RenderStatus = RenderedPayload['status'] | 'pending';

export interface PreviewSnapshot {
  handshakeStatus: HandshakeStatus;
  renderStatus: RenderStatus;
  sessionId: string | undefined;
  view: HydratedView | undefined;
  context: InitContext | undefined;
  missingComponents: string[];
  error: { message: string; stack?: string } | undefined;
}

export interface PreviewClientOptions {
  channel: PreviewChannel;
  supportedFeatures: string[];
  capabilities: PreviewCapabilities;
}

export type PreviewClientListener = () => void;

const EMPTY_SNAPSHOT: PreviewSnapshot = {
  handshakeStatus: 'idle',
  renderStatus: 'pending',
  sessionId: undefined,
  view: undefined,
  context: undefined,
  missingComponents: [],
  error: undefined,
};

export class PreviewClient {
  private readonly channel: PreviewChannel;
  private readonly supportedFeatures: string[];
  private readonly capabilities: PreviewCapabilities;

  private snapshot: PreviewSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<PreviewClientListener>();
  private readonly cleanups: Array<() => void> = [];

  constructor({ channel, supportedFeatures, capabilities }: PreviewClientOptions) {
    this.channel = channel;
    this.supportedFeatures = supportedFeatures;
    this.capabilities = capabilities;
  }

  getSnapshot = (): PreviewSnapshot => this.snapshot;

  subscribe = (listener: PreviewClientListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(): void {
    // Idempotent: repeated calls are a no-op after the first.
    if (this.snapshot.handshakeStatus !== 'idle') return;

    // Register listeners before sending `ready`. A fast editor can reply
    // before addEventListener returns; race would drop `init`.
    this.cleanups.push(
      this.channel.on(MESSAGE.init, (msg) => this.handleInit(msg as InitMessage))
    );
    this.cleanups.push(
      this.channel.on(MESSAGE.viewUpdate, (msg) =>
        this.handleViewUpdate(msg as ViewUpdateMessage)
      )
    );

    this.channel.send({
      type: MESSAGE.ready,
      source: SOURCE.preview,
      protocolVersion: PROTOCOL_VERSION,
      payload: {
        supportedFeatures: this.supportedFeatures,
        capabilities: this.capabilities,
      },
    });

    this.update({ handshakeStatus: 'ready-sent' });
  }

  close(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.channel.close();
    this.update({ handshakeStatus: 'closed' });
  }

  reportRendered(payload: {
    status: RenderStatus;
    missingComponents?: string[];
    error?: { message: string; stack?: string };
  }): void {
    if (this.snapshot.handshakeStatus !== 'initialized') return;
    if (!this.snapshot.sessionId) return;
    if (payload.status === 'pending') return;

    this.channel.send({
      type: MESSAGE.rendered,
      source: SOURCE.preview,
      protocolVersion: PROTOCOL_VERSION,
      sessionId: this.snapshot.sessionId,
      payload: {
        status: payload.status,
        missingComponents: payload.missingComponents ?? [],
        error: payload.error,
      },
    });

    this.update({
      renderStatus: payload.status,
      missingComponents: payload.missingComponents ?? [],
      error: payload.error,
    });
  }

  reportError(error: { message: string; stack?: string }): void {
    if (!this.snapshot.sessionId) return;
    this.channel.send({
      type: MESSAGE.error,
      source: SOURCE.preview,
      protocolVersion: PROTOCOL_VERSION,
      sessionId: this.snapshot.sessionId,
      payload: { error },
    });
    this.update({ error, renderStatus: 'error' });
  }

  private handleInit(msg: InitMessage): void {
    if (!isMessage(msg, MESSAGE.init)) return;
    if (this.snapshot.handshakeStatus !== 'ready-sent') return;
    if (!msg.sessionId) return;

    this.update({
      handshakeStatus: 'initialized',
      sessionId: msg.sessionId,
      view: msg.payload.initialView,
      context: msg.payload.context,
    });
  }

  private handleViewUpdate(msg: ViewUpdateMessage): void {
    if (!isMessage(msg, MESSAGE.viewUpdate)) return;
    if (this.snapshot.handshakeStatus !== 'initialized') return;
    if (msg.sessionId !== this.snapshot.sessionId) return;

    this.update({
      view: msg.payload.view,
      renderStatus: 'pending',
      missingComponents: [],
      error: undefined,
    });
  }

  private update(patch: Partial<PreviewSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}
