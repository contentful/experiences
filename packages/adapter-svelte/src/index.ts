/*
 * Public API surface for `@contentful/experiences-svelte`.
 *
 * Customers add ONLY this package to their app's dependencies. Everything
 * needed to render an Experience — types, the resolver, viewport utilities,
 * the renderer components, the authoring helpers — is re-exported from here.
 * The internal `@contentful/experiences-core` and
 * `@contentful/experiences-design` packages are workspace-only implementation
 * details; they are not part of the public API.
 *
 * Three renderers, one per intent:
 *   - `ServerExperienceRenderer` — SSR-only, static HTML, zero client-JS.
 *   - `ClientExperienceRenderer` — client-only; throws on the server.
 *     Use for tests, native shells, or apps that never SSR.
 *   - `ExperienceRenderer` — hybrid; SSR first paint + client hydration +
 *     `enablePreview`. Pick this for any route that needs both.
 */

// ─── Renderers ─────────────────────────────────────────────────────────────
export { default as ExperienceRenderer } from './ExperienceRenderer.svelte';
export { default as ClientExperienceRenderer } from './ClientExperienceRenderer.svelte';
export { default as ServerExperienceRenderer } from './ServerExperienceRenderer.svelte';
export { default as MissingComponent } from './MissingComponent.svelte';

export { useActiveViewport } from './use-active-viewport.svelte.js';
export type { UseActiveViewportResult } from './use-active-viewport.svelte.js';

// ─── Preview (editor integration) ─────────────────────────────────────────
// The Svelte preview adapter is a sibling package; everything below is
// re-exported so consumers of `@contentful/experiences-svelte` never need
// to install or import from the preview packages directly.
export {
  createPreviewOverride,
  createResolvedPreviewPlan,
} from '@contentful/experiences-preview-svelte';
export type {
  CreatePreviewOverrideOptions,
  PreviewOverride,
  ResolvedPreviewPlan,
} from '@contentful/experiences-preview-svelte';

// Advanced-use re-exports for customers building custom preview flows.
export {
  MESSAGE as PREVIEW_MESSAGE,
  PROTOCOL_VERSION as PREVIEW_PROTOCOL_VERSION,
  SOURCE as PREVIEW_SOURCE,
  PreviewClient,
  createPostMessageChannel,
  isEnvelope as isPreviewEnvelope,
  isMessage as isPreviewMessage,
} from '@contentful/experiences-preview-svelte';
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
} from '@contentful/experiences-preview-svelte';

// Component prop shapes live in component-props.ts (not .svelte module
// blocks) so `tsc --noEmit` can see them without the Svelte language server.
export type {
  ClientExperienceRendererProps,
  ClientExperienceRendererProps as ExperienceRendererProps,
  MissingComponentProps,
  RenderUnknown,
  ServerExperienceRendererProps,
} from './component-props.js';

// ─── Authoring helpers + Config types ─────────────────────────────────────
export { defineComponent, defineTemplate } from './types.js';
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
} from './types.js';

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
