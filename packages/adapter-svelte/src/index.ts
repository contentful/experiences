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

// Exposed so advanced customers can render non-`children` slots manually:
// e.g. `<NodesRenderer nodes={contentful.slots.header as PortableRenderNode[]} ... />`.
export { default as NodesRenderer } from './NodesRenderer.svelte';

export { useActiveViewport } from './use-active-viewport.svelte.js';
export type { UseActiveViewportResult } from './use-active-viewport.svelte.js';

// ─── Runtime context helpers ─────────────────────────────────────────────
export { getExperience, getContentfulComponent, getContentfulTemplate } from './context.js';
export { getDesignValues } from './get-design-values.js';
export { toCss } from './design-utils.js';
export type { ToCssOptions } from './design-utils.js';

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
export {
  defineComponent,
  defineTemplate,
  normalizeComponentRegistration,
  normalizeTemplateRegistration,
} from './types.js';
export type {
  ComponentConfig,
  Components,
  Config,
  ContentfulComponent,
  ContentfulTemplate,
  Registration,
  RenderContext,
  ResolveToken,
  TemplateConfig,
  TemplateRegistration,
  Templates,
} from './types.js';

// ─── Resolver (re-exported from render-core) ──────────────────────────────
export { resolveExperience } from '@contentful/experiences-sdk-core';
export type { ResolverConfig, ResolveExperienceOptions } from '@contentful/experiences-sdk-core';

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
  NotFoundError,
  createClient,
  fetchExperience,
} from '@contentful/experiences-client';
export type {
  ClientOptions,
  CreateClientOptions,
  ExperienceOptions,
  ResolveOptions,
} from '@contentful/experiences-client';
