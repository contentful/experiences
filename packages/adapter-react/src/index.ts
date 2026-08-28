/*
 * Public API surface for `@contentful/experiences-react`.
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

export { ComponentError } from './component-error';
export type { ComponentErrorProps } from './component-error';

export { DebugExperience } from './debug-experience';
export type { DebugExperienceProps } from './debug-experience';

export { useActiveViewport } from './use-active-viewport';
export type { UseActiveViewportResult } from './use-active-viewport';

export type { DiagnosticReporter, RenderError, RenderUnknown } from './nodes-renderer';

// ─── Runtime context hooks ───────────────────────────────────────────────
export { useExperience, useContentfulComponent, useContentfulExperienceTemplate } from './context';
export { useDesignValues } from './use-design-values';
export { toCss } from './design-utils';
export type { ToCssOptions } from './design-utils';

// ─── Authoring helpers + Config types ─────────────────────────────────────
export {
  defineComponent,
  defineExperienceTemplate,
  normalizeComponentRegistration,
  normalizeExperienceTemplateRegistration,
} from './types';
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
} from './types';

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
