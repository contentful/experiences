/*
 * Public API surface for `@contentful/experiences-svelte`.
 *
 * Customers add ONLY this package to their app's dependencies. Everything
 * needed to render an Experience — types, the resolver, viewport utilities,
 * the renderer components, the authoring helpers — is re-exported from here.
 * The internal `@contentful/experiences-sdk-core` and
 * `@contentful/experiences-design` packages are workspace-only implementation
 * details; they are not part of the public API.
 *
 * `ExperienceRenderer` is an alias for `ClientExperienceRenderer`; SSR
 * consumers explicitly import `ServerExperienceRenderer`.
 */

// ─── Renderers ─────────────────────────────────────────────────────────────
export { default as ClientExperienceRenderer } from './ClientExperienceRenderer.svelte';
export { default as ExperienceRenderer } from './ClientExperienceRenderer.svelte';
export { default as ServerExperienceRenderer } from './ServerExperienceRenderer.svelte';
export { default as MissingComponent } from './MissingComponent.svelte';
export { default as ComponentError } from './ComponentError.svelte';
export { default as DebugExperience } from './DebugExperience.svelte';

// Every slot already arrives as a same-named `Snippet[]` prop; this is exposed so
// advanced customers can render a slot's raw nodes themselves instead:
// e.g. `<NodesRenderer nodes={contentful.slots.header as PortableRenderNode[]} ... />`.
export { default as NodesRenderer } from './NodesRenderer.svelte';

export { useActiveViewport } from './use-active-viewport.svelte.js';
export type { UseActiveViewportResult } from './use-active-viewport.svelte.js';

export { useLivePreview } from './use-live-preview.svelte.js';
export type { UseLivePreviewOptions, UseLivePreviewResult } from './use-live-preview.svelte.js';

export { useResolvedExperience } from './use-resolved-experience.svelte.js';
export type {
  LivePreviewResolveOptions,
  UseResolvedExperienceOptions,
  UseResolvedExperienceResult,
} from './use-resolved-experience.svelte.js';
export type { LivePreviewClient, LivePreviewOptions } from '@contentful/experiences-live-preview';

// ─── Runtime context helpers ─────────────────────────────────────────────
export {
  getExperience,
  getContentfulComponent,
  getContentfulExperienceTemplate,
} from './context.js';
export { getDesignValues } from './get-design-values.js';
export { toCss } from './design-utils.js';
export type { ToCssOptions } from './design-utils.js';

// Component prop shapes live in component-props.ts (not .svelte module
// blocks) so `tsc --noEmit` can see them without the Svelte language server.
export type {
  ClientExperienceRendererProps,
  ClientExperienceRendererProps as ExperienceRendererProps,
  ComponentErrorProps,
  DebugExperienceProps,
  DiagnosticReporter,
  MissingComponentProps,
  RenderError,
  RenderUnknown,
  ServerExperienceRendererProps,
} from './component-props.js';

// ─── Authoring helpers + Config types ─────────────────────────────────────
export {
  defineComponent,
  defineExperienceTemplate,
  normalizeComponentRegistration,
  normalizeExperienceTemplateRegistration,
} from './types.js';
export type {
  ComponentConfig,
  Components,
  Config,
  ContentfulComponent,
  ContentfulExperienceTemplate,
  ExperienceTemplateConfig,
  ExperienceTemplateRegistration,
  ExperienceTemplates,
  Registration,
  RenderContext,
  ResolveToken,
} from './types.js';

// ─── Resolver (re-exported from render-core) ──────────────────────────────
export { resolveExperience } from '@contentful/experiences-sdk-core';
export type { ResolverConfig, ResolveExperienceOptions } from '@contentful/experiences-sdk-core';

// ─── Core IR + payload types (re-exported from render-core) ───────────────
export type {
  ComponentNode,
  ComponentRef,
  DesignPropValue,
  DesignToken,
  ExperienceContext,
  ExperienceNode,
  ExperiencePayload,
  ExperienceSourceMap,
  ExperienceSys,
  ExperienceTemplateNode,
  ExperienceTemplateRef,
  ManualDesignValue,
  PortableRegistration,
  PortableRenderNode,
  PortableRenderPlan,
  ResolveContext,
  ValuesByViewport,
  ViewportDef,
} from '@contentful/experiences-sdk-core';

// ─── Design utilities (re-exported from design) ───────────────────────────
export {
  CSS_PROPERTIES,
  getValueForViewport,
  getViewportIndex,
  isCssProperty,
  resolveDesignProperties,
  toCssKey,
  toCssMediaQuery,
} from '@contentful/experiences-design';

// ─── Delivery client + fetchExperience ────────────────────────────────────
export {
  ContentfulViewDelivery,
  ContentfulViewDeliveryClient,
  DELIVERY_HOST,
  ExperienceFetchError,
  NotFoundError,
  PREVIEW_HOST,
  createClient,
  fetchExperience,
  readSourceMap,
  toExperiencePayload,
} from '@contentful/experiences-client';
export type {
  ClientOptions,
  CreateClientOptions,
  ExperienceOptions,
  ExperienceResponse,
  ResolveOptions,
} from '@contentful/experiences-client';
