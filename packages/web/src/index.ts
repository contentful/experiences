export { getPageProperties, getUserAgent } from './browser-event-context.js';
export { ContentfulExperiences } from './contentful-experiences.js';
export type {
  BrowserEventContextProviders,
  CurrentPageOptions,
  CoreConfigDefaults,
  ExperiencesWebConfig,
  HydrateAndTrackCurrentPageOptions,
  InteractionTrackingSession,
  InteractionTrackingStartOptions,
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
  PersonalizationOptions,
} from '@contentful/experiences-client';
export { ANONYMOUS_ID_COOKIE, EventProfileRequiredError } from '@contentful/experiences-runtime';
export type {
  AllowedEventType,
  BlockedEvent,
  BlockedEventReason,
  ConsentInput,
  ConsentState,
  EventMethod,
  EventEmissionResult,
  EventOptimizationData,
  EventProfile,
  ExperiencesHandoff,
  ExperienceRequestState,
  ExperienceRequestFailureReason,
  ClickBuilderArgs,
  FlagViewBuilderArgs,
  HoverBuilderArgs,
  IdentifyBuilderArgs,
  PageViewBuilderArgs,
  RuntimeEventMethods,
  RuntimeOptimizationConfig,
  RuntimeDeliveryClientOptions,
  RuntimeFetchByDestinationNodeOptions,
  RuntimeFetchByDestinationPathOptions,
  RuntimeFetchExperienceOptions,
  RuntimeFetchResolveOptions,
  RuntimeResolveDefaults,
  RuntimeResolveOptions,
  TrackBuilderArgs,
  UniversalEventBuilderArgs,
  ViewBuilderArgs,
} from '@contentful/experiences-runtime';
export type {
  ExperiencePayload,
  PortableRenderPlan,
  ResolverConfig,
} from '@contentful/experiences-sdk-core';

export type { CoreStates } from './states.js';
export {
  batch,
  effect,
  signalFns,
  signals,
  toDistinctObservable,
  toObservable,
  type Observable,
  type OptimizationEventStreamEvent,
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
} from './lib/interceptor/InterceptorManager.js';
export {
  mergeExperienceState,
  type ExperienceState,
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
