/*
 * Public API surface for `@contentful/experiences-preview-svelte`.
 *
 * Consumed by `@contentful/experiences-svelte` internally when a customer
 * sets `enablePreview` on `ClientExperienceRenderer`. Advanced customers
 * building their own renderer flow can import from this package directly.
 */

export { createPreviewOverride } from './preview-override.svelte.js';
export type {
  CreatePreviewOverrideOptions,
  PreviewOverride,
} from './preview-override.svelte.js';

export { createResolvedPreviewPlan } from './resolved-preview-plan.svelte.js';
export type { ResolvedPreviewPlan } from './resolved-preview-plan.svelte.js';

// Re-export the framework-agnostic surface so consumers who install only
// this package have a single import path for everything preview-related.
export {
  MESSAGE,
  PROTOCOL_VERSION,
  SOURCE,
  PreviewClient,
  isEnvelope,
  isMessage,
} from '@contentful/experiences-preview-core';
export type {
  AnyMessage,
  Envelope,
  HandshakeStatus,
  HydratedView,
  InitContext,
  MessageHandler,
  MessageType,
  PreviewCapabilities,
  PreviewChannel,
  PreviewClientOptions,
  PreviewSnapshot,
  ReadyPayload,
  RenderedPayload,
  RenderStatus,
} from '@contentful/experiences-preview-core';
export { createPostMessageChannel } from '@contentful/experiences-preview-web';
export type { CreatePostMessageChannelOptions } from '@contentful/experiences-preview-web';
