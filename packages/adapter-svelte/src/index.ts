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
  TemplateConfig,
  TemplateRegistration,
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
