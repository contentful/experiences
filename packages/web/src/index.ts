export { getPageProperties, getUserAgent } from './browser-event-context.js';
export { ContentfulExperiences } from './contentful-experiences.js';
export type {
  EventContextProviders,
  CurrentPageOptions,
  ConfigDefaults,
  Config,
  ExperiencesTrackingApi,
  HydrateAndTrackCurrentPageOptions,
} from './contentful-experiences.js';
export type { TrackedEntityKind, TrackingAttribution } from './tracking/attribution.js';
export type { ElementViewObserverOptions as ViewTrackingOptions } from './tracking/view/element-view-observer-support.js';
export { EXPERIENCES_WEB_SDK_NAME, EXPERIENCES_WEB_SDK_VERSION } from './sdk-info.js';

export {
  ContentfulViewDelivery,
  DELIVERY_HOST,
  ExperienceFetchError,
  NotFoundError,
  PREVIEW_HOST,
} from '@contentful/experiences-client';
export type {
  DestinationRedirectResult,
  ExperienceRequestExtensions,
  ExperienceParameters,
  ExperienceParameterValue,
  ExperienceParameterRecord,
  ExperienceParameterOrder,
  PersonalizationOptions,
} from '@contentful/experiences-client';
export {
  ANONYMOUS_ID_COOKIE,
  EventProfileRequiredError,
  resolveFlagChange,
  ChangeArray,
  VariableChange,
} from '@contentful/experiences-runtime';
export type {
  Json,
  AllowedEventType,
  BlockedEvent,
  BlockedEventReason,
  ConsentInput,
  ConsentState,
  EventMethod,
  EventEmissionResult,
  EventOptimizationData,
  EventProfile,
  OptimizationEventStreamEvent,
  ExperiencesHandoff,
  PersonalizationRequestState,
  PersonalizationRequestFailureReason,
  ClickBuilderArgs,
  FlagViewBuilderArgs,
  HoverBuilderArgs,
  IdentifyBuilderArgs,
  PageViewBuilderArgs,
  RuntimeEventMethods,
  OptimizationConfig,
  DeliveryClientOptions,
  FetchByDestinationNodeOptions,
  FetchByDestinationPathOptions,
  FetchExperienceOptions,
  FetchPersonalizationOptions,
  FetchResolveOptions,
  ResolveDefaults,
  ResolveOptions,
  TrackBuilderArgs,
  UniversalEventBuilderArgs,
  ViewBuilderArgs,
} from '@contentful/experiences-runtime';
export type {
  ExperienceDeliveryDiagnostic,
  ExperiencePayload,
  PortableRenderPlan,
  ResolverConfig,
} from '@contentful/experiences-sdk-core';

export type { States } from './states.js';
export {
  batch,
  effect,
  signalFns,
  signals,
  toDistinctObservable,
  toObservable,
  type Observable,
  type Signal,
  type SignalFns,
  type Signals,
  type SnapshotFn,
  type Subscription,
} from './signals/index.js';
export { normalizeLocale, normalizeExplicitLocale } from './locale.js';
export {
  InterceptorManager,
  type Interceptor,
  type InterceptorMerge,
  type MaybePromise,
} from '@contentful/experiences-runtime';
export {
  mergePersonalizationState,
  type PersonalizationState,
  type LifecycleInterceptors,
} from './interceptors.js';
export {
  resolveStatefulDefaults,
  type StatefulDefaults,
  type PersistedDefaultLoader,
  type PersistedDefaultValue,
  type PersistedStatefulDefaults,
  type ResolvedStatefulDefaults,
} from './stateful-defaults.js';
export {
  createSnapshotRuntime,
  type ExperiencesRuntime,
  type ExperiencesSnapshot,
  type SnapshotRuntime,
} from './runtime.js';

export type {
  AutoTrackEntryInteractionOptions,
  EntryInteraction,
  EntryElementInteraction,
  EntryInteractionApi,
  EntryInteractionTracker,
  EntryInteractionTrackers,
  EntryInteractionStartOptions,
  EntryInteractionStartOptionsMap,
  EntryInteractionElementOptions,
  EntryInteractionElementOptionsMap,
  EntryClickInteractionElementOptions,
  EntryViewInteractionElementOptions,
  EntryHoverInteractionElementOptions,
  EntryViewInteractionStartOptions,
} from './interaction-tracking.js';

export { createWebSnapshotRuntime, type WebExperiencesRuntime } from './runtime.js';
