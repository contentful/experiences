/* Shared public rendering, authoring, delivery and design exports. */

export { MissingComponent } from './diagnostics/missing-component.js';
export type { MissingComponentProps } from './diagnostics/missing-component.js';

export { ComponentError } from './diagnostics/component-error.js';
export type { ComponentErrorProps } from './diagnostics/component-error.js';

export { DebugExperience } from './diagnostics/debug-experience.js';
export type { DebugExperienceProps } from './diagnostics/debug-experience.js';

export type { DiagnosticReporter, RenderError, RenderUnknown } from './rendering/nodes-renderer.js';

export { toCss } from './design/design-utils.js';
export type { ToCssOptions } from './design/design-utils.js';

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

export type { ExperienceBoundaryOptions } from './rendering/experience-boundary.js';
export type {
  ExperienceTrackingOptions,
  ExperienceRootProps,
  ExperienceRootBinding,
  ExperienceNodeRoot,
  OnExperienceNodeRoot,
} from './tracking/root-binding-types.js';
export type {
  NodeAttribution,
  PlanAttribution,
  ScopeAttribution,
} from '@contentful/experiences-sdk-core';
