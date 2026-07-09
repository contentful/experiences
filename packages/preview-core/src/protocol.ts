/*
 * Preview protocol — the wire between an ExO editor (host) and a
 * customer app running inside its iframe (guest).
 *
 * The protocol is transport-independent — postMessage is what ships first,
 * but the same message names, payloads, and handshake apply over a
 * WebSocket, WebRTC data channel, or any other duplex pipe. The transport
 * is isolated in the `PreviewChannel` interface.
 *
 * The `view` on the wire is a `HydratedView` — the same API-generic
 * payload the Experience Delivery API delivers today. Renderers convert it
 * to their internal IR (a `PortableRenderPlan`) via `resolveExperience`
 * at the boundary. The wire deliberately stays API-shaped so third-party
 * renderers, native adapters, and test harnesses can consume it without
 * depending on any renderer's internal IR.
 */

import type { ExperiencePayload } from '@contentful/experiences-core';

/**
 * The API-generic view payload — structurally the response body of
 * `GetExperienceViewResponse` from the Experience Delivery API. Alias
 * only; the protocol never redefines the shape.
 */
export type HydratedView = ExperiencePayload;

// -- Protocol constants --------------------------------------------------

export const PROTOCOL_VERSION = 1;

export const SOURCE = {
  editor: 'experiences:editor',
  preview: 'experiences:preview',
} as const;
export type Source = (typeof SOURCE)[keyof typeof SOURCE];

export const MESSAGE = {
  ready: 'experiences:preview:ready',
  init: 'experiences:editor:init',
  rendered: 'experiences:preview:rendered',
  viewUpdate: 'experiences:editor:viewUpdate',
  error: 'experiences:preview:error',
  geometry: 'experiences:preview:geometry',
} as const;
export type MessageType = (typeof MESSAGE)[keyof typeof MESSAGE];

// -- Common envelope -----------------------------------------------------

// Every message carries `sessionId` except the first `ready` — the editor
// mints the sessionId in response and delivers it in `init`.
export interface Envelope<T extends MessageType, P> {
  type: T;
  source: Source;
  protocolVersion: typeof PROTOCOL_VERSION;
  sessionId?: string;
  payload: P;
}

// -- Capabilities --------------------------------------------------------

export interface PreviewCapabilities {
  // Preview app hydrates on the client and can consume `viewUpdate` to
  // re-render in place. When false, the editor treats the preview as
  // static and reloads the iframe on save.
  liveUpdate: boolean;

  // Preview has already painted its own content (SSR/RSC/static HTML).
  // Reserved for a later epic driving optional initialView.
  alreadyRendered: boolean;

  // Preview can emit `experiences:preview:geometry` messages.
  nodeGeometry: boolean;
}

// -- Payloads ------------------------------------------------------------

export interface ReadyPayload {
  supportedFeatures: string[];
  capabilities: PreviewCapabilities;
}

export interface InitContext {
  entity: {
    sys: {
      type: 'ComponentType' | 'Template';
      id: string;
      space: { sys: { type: 'Link'; linkType: 'Space'; id: string } };
      environment: { sys: { type: 'Link'; linkType: 'Environment'; id: string } };
    };
  };
}

export interface InitPayload {
  supportedFeatures: string[];
  context: InitContext;
  initialView: HydratedView;
}

export interface RenderedPayload {
  status: 'ok' | 'partial' | 'error';
  missingComponents: string[];
  error?: { message: string; stack?: string };
}

export interface ViewUpdatePayload {
  view: HydratedView;
}

export interface ErrorPayload {
  error: { message: string; stack?: string };
}

// Geometry — reserved. Shape mirrors Studio's canvasGeometryUpdated event.
export interface GeometryPayload {
  size: { width: number; height: number };
  nodes: Record<
    string,
    { coordinates: { x: number; y: number; width: number; height: number } }
  >;
  sourceEvent: 'resize' | 'mutation' | 'mediaResize';
}

// -- Concrete message types ---------------------------------------------

export type ReadyMessage = Envelope<typeof MESSAGE.ready, ReadyPayload>;
export type InitMessage = Envelope<typeof MESSAGE.init, InitPayload>;
export type RenderedMessage = Envelope<typeof MESSAGE.rendered, RenderedPayload>;
export type ViewUpdateMessage = Envelope<typeof MESSAGE.viewUpdate, ViewUpdatePayload>;
export type ErrorMessage = Envelope<typeof MESSAGE.error, ErrorPayload>;
export type GeometryMessage = Envelope<typeof MESSAGE.geometry, GeometryPayload>;

export type EditorMessage = InitMessage | ViewUpdateMessage;
export type PreviewMessage = ReadyMessage | RenderedMessage | ErrorMessage | GeometryMessage;
export type AnyMessage = EditorMessage | PreviewMessage;

// -- Type guards ---------------------------------------------------------

export function isEnvelope(value: unknown): value is Envelope<MessageType, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === 'string' &&
    (v.source === SOURCE.editor || v.source === SOURCE.preview) &&
    v.protocolVersion === PROTOCOL_VERSION &&
    typeof v.payload === 'object' &&
    v.payload !== null
  );
}

export function isMessage<T extends MessageType>(
  value: unknown,
  type: T
): value is Envelope<T, unknown> {
  return isEnvelope(value) && value.type === type;
}
