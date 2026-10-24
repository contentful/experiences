/*
 * Public API surface for `@contentful/experiences-react`.
 *
 * Customers add ONLY this package to their app's dependencies. Everything
 * needed to render an Experience — types, the resolver, design utilities,
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
} from './client-renderer.js';
export type { ClientExperienceRendererProps as ExperienceRendererProps } from './client-renderer.js';
export type { ClientExperienceRendererProps } from './client-renderer.js';

export { ServerExperienceRenderer } from './server-renderer.js';
export type { ServerExperienceRendererProps } from './server-renderer.js';

export { MissingComponent } from './missing-component.js';
export type { MissingComponentProps } from './missing-component.js';

export { ComponentError } from './component-error.js';
export type { ComponentErrorProps } from './component-error.js';

export { DebugExperience } from './debug-experience.js';
export type { DebugExperienceProps } from './debug-experience.js';

export type { DiagnosticReporter, RenderError, RenderUnknown } from './nodes-renderer.js';

export { useLivePreviewExperience } from './use-live-preview-experience.js';
export type {
  UseLivePreviewExperienceOptions,
  UseLivePreviewExperienceResult,
} from './use-live-preview-experience.js';
export { useLivePreview } from './use-live-preview.js';
export type { UseLivePreviewOptions, UseLivePreviewResult } from './use-live-preview.js';

export { useExperiencePlan } from './use-experience-plan.js';
export type {
  ExperiencePlanResolveOptions,
  UseExperiencePlanOptions,
  UseExperiencePlanResult,
} from './use-experience-plan.js';
export type {
  LivePreviewClient,
  LivePreviewResult,
  PreviewSessionClientOptions,
  PreviewSessionExperienceOptions,
  PreviewSessionOptions,
  PreviewSessionResolveOptions,
} from '@contentful/experiences-live-preview';
export {
  fetchPreviewSession,
  LivePreviewConnectionError,
  PREVIEW_WEBSOCKET_HOST,
  PreviewSessionFetchError,
} from '@contentful/experiences-live-preview';

// ─── Runtime context hooks ───────────────────────────────────────────────
export {
  useExperience,
  useContentfulComponent,
  useContentfulExperienceTemplate,
} from './context.js';
export { useDesignValues } from './use-design-values.js';
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
  ResolveToken,
} from './types.js';

// ─── Resolver (re-exported from render-core) ──────────────────────────────
export { resolveExperience } from '@contentful/experiences-sdk-core';
export {
  getTrackingAttributes,
  TRACKING_CLICKABLE_ATTRIBUTE,
  TRACKING_SCOPES_ATTRIBUTE,
} from '@contentful/experiences-sdk-core';
export type { TrackingAttributes } from '@contentful/experiences-sdk-core';
export type { ResolverConfig, ResolveExperienceOptions } from '@contentful/experiences-sdk-core';

// ─── Event builder (re-exported from runtime) ─────────────────────────────
export { DEFAULT_PAGE_PROPERTIES, EventBuilder } from '@contentful/experiences-runtime';
export type {
  ClickBuilderArgs,
  EventBuilderConfig,
  FlagViewBuilderArgs,
  HoverBuilderArgs,
  IdentifyBuilderArgs,
  InteractionBuilderArgsBase,
  PageViewBuilderArgs,
  TrackBuilderArgs,
  UniversalEventBuilderArgs,
  ViewBuilderArgs,
} from '@contentful/experiences-runtime';

// ─── Core IR + payload types (re-exported from render-core) ───────────────
export type {
  ComponentNode,
  ComponentRef,
  DesignPropValue,
  DesignToken,
  ExperienceContext,
  ExperienceDeliveryDiagnostic,
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
} from '@contentful/experiences-sdk-core';

// ─── Design utilities (re-exported from design) ───────────────────────────
export { CSS_PROPERTIES, isCssProperty, toCssKey } from '@contentful/experiences-design';

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
  fetchDestinationSitemap,
  readSourceMap,
  toExperiencePayload,
  toExperiencePayloadFromDestination,
} from '@contentful/experiences-client';
export { ANONYMOUS_ID_COOKIE } from '@contentful/experiences-runtime';
export type {
  ByDestinationNodeIdExperienceOptions,
  ByDestinationPathExperienceOptions,
  ByIdExperienceOptions,
  ClientOptions,
  CreateClientOptions,
  DestinationRedirectResult,
  DestinationSitemapResult,
  ExperienceOptions,
  ExperienceParameters,
  ExperienceParameterValue,
  ExperienceParameterRecord,
  ExperienceParameterOrder,
  ExperienceResponse,
  FetchDestinationSitemapOptions,
  FetchDestinationSitemapPaginationOptions,
  ResolveOptions,
  SitemapPathItem,
} from '@contentful/experiences-client';
