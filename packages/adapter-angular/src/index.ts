/*
 * Public API surface for `@contentful/experiences-angular`.
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
 *
 * Names carry Angular's `Component` or `Directive` suffix, matching the
 * framework's own convention; the un-suffixed aliases exist so the three
 * adapters read the same in customer code. See the README's parity table for the
 * full mapping.
 */

// ─── Renderers ─────────────────────────────────────────────────────────────
export { ClientExperienceRendererComponent } from './client-experience-renderer.component.js';
export { ClientExperienceRendererComponent as ClientExperienceRenderer } from './client-experience-renderer.component.js';
export { ClientExperienceRendererComponent as ExperienceRenderer } from './client-experience-renderer.component.js';
export { ServerExperienceRendererComponent } from './server-experience-renderer.component.js';
export { ServerExperienceRendererComponent as ServerExperienceRenderer } from './server-experience-renderer.component.js';
export { MissingComponentComponent } from './missing-component.component.js';
export { MissingComponentComponent as MissingComponent } from './missing-component.component.js';
export { ComponentErrorComponent } from './component-error.component.js';
export { ComponentErrorComponent as ComponentError } from './component-error.component.js';
export { DebugExperienceComponent } from './debug-experience.component.js';
export { DebugExperienceComponent as DebugExperience } from './debug-experience.component.js';

// Load-bearing in this adapter, not an escape hatch: Angular has no lazy
// renderable-child primitive for arbitrary named slots, so each slot arrives as
// a same-named `PortableRenderNode[]` input and the receiving component renders
// it with `<ng-container *cfNodes="children()"></ng-container>`.
//
// Structural directives rather than components, so the adapter contributes no
// elements of its own — slot children become direct children of whatever element
// the customer wrapped them in, exactly as in React and Svelte.
export { NodesRendererDirective } from './node-renderer.directive.js';
export { NodesRendererDirective as NodesRenderer } from './node-renderer.directive.js';
export { NodeRendererDirective } from './node-renderer.directive.js';
export { NodeRendererDirective as NodeRenderer } from './node-renderer.directive.js';

export { injectActiveViewport } from './inject-active-viewport.js';
export type { InjectActiveViewportResult } from './inject-active-viewport.js';

// ─── Runtime context helpers ─────────────────────────────────────────────
export {
  injectExperience,
  injectContentfulComponent,
  injectContentfulExperienceTemplate,
} from './context.js';
export { injectDesignValues } from './inject-design-values.js';
export { toCss } from './design-utils.js';
export type { ToCssOptions } from './design-utils.js';

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
  RenderError,
  RenderUnknown,
  ResolveToken,
  SlotNodes,
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
