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
export type { ClientExperienceRendererProps, OptimizationOption } from './client-renderer';

export { ServerExperienceRenderer } from './server-renderer';
export type { ServerExperienceRendererProps } from './server-renderer';

export { MissingComponent } from './missing-component';
export type { MissingComponentProps } from './missing-component';

export { useActiveViewport } from './use-active-viewport';
export type { UseActiveViewportResult } from './use-active-viewport';

export type { RenderUnknown } from './nodes-renderer';

// ─── Runtime context hooks ───────────────────────────────────────────────
export { useExperience, useContentfulComponent, useContentfulTemplate } from './context';
export { useOptimization } from './optimization/context';

// ─── Authoring helpers + Config types ─────────────────────────────────────
export {
  defineComponent,
  defineTemplate,
  normalizeComponentRegistration,
  normalizeTemplateRegistration,
} from './types';
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
