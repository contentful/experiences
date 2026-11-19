/*
 * Public API surface for `@contentful/experiences-svelte`.
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
export { createExperiences } from './experience/create-experiences.js';
export type {
  CreateExperiencesOptions,
  CreateExperiencesResult,
  BoundExperienceRendererProps,
} from './experience/create-experiences.js';
export { default as Experience } from './experience/Experience.svelte';
export { useManagedExperience } from './experience/use-managed-experience.svelte.js';
export type {
  ExperienceProps,
  BoundExperienceProps,
  ExperienceNotifications,
  UseManagedExperienceOptions,
} from './experience/presentation-types.js';
export type {
  ManagedExperience,
  ManagedExperienceAcquireOptions,
  ManagedExperienceOptions,
  ManagedExperienceSnapshot,
  ManagedExperienceOperationResult,
} from './experience/source-types.js';
export { default as ExperiencesRoot } from './runtime/ExperiencesRoot.svelte';
export { default as ExperiencesProvider } from './runtime/ExperiencesProvider.svelte';
export {
  getExperiences,
  getExperiencesState,
  getExperiencesActions,
} from './runtime/context.svelte.js';
export type { ExperiencesState, ExperiencesActions } from './runtime/context.svelte.js';
export type {
  ExperiencesRootProps,
  ExperiencesProviderProps,
  OnStatesReady,
} from './runtime/types.js';
export { default as ClientExperienceRenderer } from './rendering/ClientExperienceRenderer.svelte';
export { default as ExperienceRenderer } from './rendering/ClientExperienceRenderer.svelte';
export { default as ServerExperienceRenderer } from './rendering/ServerExperienceRenderer.svelte';
export { default as MissingComponent } from './diagnostics/MissingComponent.svelte';
export { default as ComponentError } from './diagnostics/ComponentError.svelte';
export { default as DebugExperience } from './diagnostics/DebugExperience.svelte';

// Every slot already arrives as a same-named `Snippet[]` prop; this is exposed so
// advanced customers can render a slot's raw nodes themselves instead:
// e.g. `<NodesRenderer nodes={contentful.slots.header as PortableRenderNode[]} ... />`.
export { default as NodesRenderer } from './rendering/NodesRenderer.svelte';

export { useLivePreviewExperience } from './hooks/use-live-preview-experience.svelte.js';
export type {
  UseLivePreviewExperienceOptions,
  UseLivePreviewExperienceResult,
} from './hooks/use-live-preview-experience.svelte.js';
export { useLivePreview } from './hooks/use-live-preview.svelte.js';
export type {
  UseLivePreviewOptions,
  UseLivePreviewResult,
} from './hooks/use-live-preview.svelte.js';

export { useExperiencePlan } from './hooks/use-experience-plan.svelte.js';
export type {
  ExperiencePlanResolveOptions,
  UseExperiencePlanOptions,
  UseExperiencePlanResult,
} from './hooks/use-experience-plan.svelte.js';
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

// ─── Runtime context helpers ─────────────────────────────────────────────
export {
  getExperience,
  getContentfulComponent,
  getContentfulExperienceTemplate,
} from './rendering/context.js';
export { getDesignValues } from './hooks/get-design-values.js';
export { toCss } from './design/design-utils.js';
export type { ToCssOptions } from './design/design-utils.js';

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
} from './rendering/component-props.js';

// ─── Authoring helpers + Config types ─────────────────────────────────────
export {
  defineComponent,
  defineExperienceTemplate,
  normalizeComponentRegistration,
  normalizeExperienceTemplateRegistration,
} from './registry/types.js';
export type {
  ComponentConfig,
  Components,
  Config,
  ContentfulComponent,
  ContentfulExperienceTemplate,
  ExperienceRootBinding,
  ExperienceRootProps,
  ExperienceTemplateConfig,
  ExperienceTemplateRegistration,
  ExperienceTemplates,
  Registration,
  RenderContext,
  ResolveToken,
} from './registry/types.js';

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
export {
  DEFAULT_PAGE_PROPERTIES,
  EventBuilder,
  resolveFlagChange,
} from '@contentful/experiences-runtime';
export type {
  ChangeArray,
  ClickBuilderArgs,
  EventBuilderConfig,
  FlagViewBuilderArgs,
  HoverBuilderArgs,
  IdentifyBuilderArgs,
  InteractionBuilderArgsBase,
  Json,
  PageViewBuilderArgs,
  TrackBuilderArgs,
  UniversalEventBuilderArgs,
  VariableChange,
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
  isNotFoundError,
  isPreviewSessionFetchError,
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
  PersonalizationOptions,
  ResolveOptions,
  SitemapPathItem,
} from '@contentful/experiences-client';
