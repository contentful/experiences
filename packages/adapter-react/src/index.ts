/*
 * Public API surface for `@contentful/experiences-react`.
 *
 * Customers add ONLY this package to their app's dependencies. Everything
 * needed to render an Experience — types, the resolver, viewport utilities,
 * the renderer components, the authoring helpers — is re-exported from here.
 * The internal `@contentful/experiences-core` and
 * `@contentful/experiences-design` packages are workspace-only implementation
 * details; they are not part of the public API.
 *
 * `ExperienceRenderer` is an alias for `ClientExperienceRenderer`; SSR
 * consumers explicitly import `ServerExperienceRenderer`.
 */

// ─── Renderers ─────────────────────────────────────────────────────────────
export {
  ClientExperienceRenderer as ExperienceRenderer,
  ClientExperienceRenderer,
} from './client-renderer';
export type { ClientExperienceRendererProps as ExperienceRendererProps } from './client-renderer';
export type { ClientExperienceRendererProps } from './client-renderer';

export { ServerExperienceRenderer } from './server-renderer';
export type { ServerExperienceRendererProps } from './server-renderer';

export { MissingComponent } from './missing-component';
export type { MissingComponentProps } from './missing-component';

export { useActiveViewport } from './use-active-viewport';
export type { UseActiveViewportResult } from './use-active-viewport';

export type { RenderUnknown } from './nodes-renderer';

// ─── Preview (editor integration) ─────────────────────────────────────────
// The React preview adapter is a sibling package; everything below is
// re-exported so consumers of `@contentful/experiences-react` never need
// to install or import from the preview packages directly.
export { usePreviewOverride, useResolvedPreviewPlan } from '@contentful/experiences-preview-react';
export type {
  UsePreviewOverrideOptions,
  UsePreviewOverrideResult,
} from '@contentful/experiences-preview-react';

// Advanced-use re-exports for customers building custom preview flows on
// top of the primitives (custom transports, non-renderer consumers).
export {
  MESSAGE as PREVIEW_MESSAGE,
  PROTOCOL_VERSION as PREVIEW_PROTOCOL_VERSION,
  SOURCE as PREVIEW_SOURCE,
  PreviewClient,
  createPostMessageChannel,
  isEnvelope as isPreviewEnvelope,
  isMessage as isPreviewMessage,
} from '@contentful/experiences-preview-react';
export type {
  CreatePostMessageChannelOptions,
  HandshakeStatus as PreviewHandshakeStatus,
  HydratedView,
  MessageHandler as PreviewMessageHandler,
  PreviewCapabilities,
  PreviewChannel,
  PreviewClientOptions,
  PreviewSnapshot,
  RenderStatus as PreviewRenderStatus,
} from '@contentful/experiences-preview-react';

// ─── Authoring helpers + Config types ─────────────────────────────────────
export { defineComponent, defineTemplate } from './types';
export type {
  ComponentConfig,
  ComponentProps,
  Components,
  Config,
  ContentfulComponent,
  ContentfulTemplate,
  RenderContext,
  TemplateConfig,
  TemplateProps,
  Templates,
} from './types';

// ─── Resolver (re-exported from render-core) ──────────────────────────────
export { resolveExperience } from '@contentful/experiences-core';
export type { ResolverConfig, ResolveExperienceOptions } from '@contentful/experiences-core';

// ─── Core IR + payload types (re-exported from render-core) ───────────────
export type {
  ComponentTypeNode,
  ComponentTypeRef,
  DesignPropValue,
  DesignToken,
  ExperienceContext,
  ExperienceNode,
  ExperiencePayload,
  ExperienceSys,
  ManualDesignValue,
  PortableRegistration,
  PortableRenderNode,
  PortableRenderPlan,
  PortableTemplate,
  ResolveContext,
  TemplateNode,
  TemplateRef,
  ValuesByViewport,
  ViewportDef,
} from '@contentful/experiences-core';

// ─── Design utilities (re-exported from design) ───────────────────────────
export {
  getValueForViewport,
  getViewportIndex,
  resolveDesignProperties,
  toCssMediaQuery,
} from '@contentful/experiences-design';
