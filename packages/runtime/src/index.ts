import type {
  ExperienceEvent as PersonalizationEvent,
  InsightsEvent as AnalyticsEvent,
} from '@contentful/optimization-api-client/api-schemas';

export {
  ANONYMOUS_ID_COOKIE,
  ANONYMOUS_ID_COOKIE_LEGACY,
  ANONYMOUS_ID_KEY,
  ANONYMOUS_ID_KEY_LEGACY,
  PROFILE_CACHE_KEY,
} from './events/constants.js';
export {
  CONSENT_CACHE_KEY,
  DEFAULT_ALLOWED_EVENT_TYPES,
  decodeConsentStorageValue,
  encodeConsentStorageValue,
  hasEventConsent,
  hasEventTypeConsent,
  methodForEventType,
  PERSISTENCE_CONSENT_CACHE_KEY,
  resolvePersistedPersistenceConsent,
  toConsentState,
} from './events/consent.js';
export type {
  AllowedEventType,
  BlockedEvent,
  BlockedEventReason,
  ConsentInput,
  ConsentState,
  ConsentStorageValue,
  EventMethod,
  EventType,
} from './events/consent.js';
export {
  ContentfulExperiences,
  buildFetchPersonalization,
} from './runtime/contentful-experiences.js';
export { resolveFlagChange } from './flags/resolve-flag-change.js';
export type {
  DestinationSitemapResult,
  FetchDestinationSitemapPaginationOptions,
  SitemapPathItem,
} from '@contentful/experiences-client';
export { ChangeArray, VariableChange } from '@contentful/optimization-api-client/api-schemas';
export type { Json } from '@contentful/optimization-api-client/api-schemas';
export type {
  Config,
  ExperienceRuntime,
  FetchExperienceOptions,
  FetchByIdExperienceOptions,
  PersonalizationOptions,
  BuiltFetchExperienceOptions,
  FetchByDestinationNodeOptions,
  FetchByDestinationPathOptions,
  FetchDestinationSitemapOptions,
  EventBuilderOptions,
  FetchResolveOptions,
  ResolveDefaults,
  ResolveOptions,
} from './runtime/contentful-experiences.js';
export type { DeliveryClientOptions } from './runtime/create-delivery-client.js';
export { getPreviewSessionBinding, resolvePreviewSessionId } from './preview-session-binding.js';
export type { PreviewSessionBinding } from './preview-session-binding.js';
export {
  assertPreviewRequest,
  createPreviewClient,
  mergePreviewResolveOptions,
} from './preview/live-preview.js';
export type {
  LivePreviewOwnerConfig,
  PreviewConfig,
  PreviewSessionOptions,
  PreviewClient,
  PreviewClientOptions,
  PreviewClientFactory,
  PreviewSessionIdentity,
  PreviewStatus,
} from './preview/live-preview.js';
export type { ApiClient, OptimizationConfig } from './runtime/create-optimization-client.js';
export { default as EventBuilder } from './events/event-builder.js';
export * from './events/event-builder.js';
export {
  EventProfileRequiredError,
  EventProfileSchema,
  warnMissingEventProfile,
} from './events/event-methods.js';
export type {
  PersonalizationRequestOptions,
  AnalyticsRequestOptions,
} from './events/event-methods.js';
export type { EventEmissionResult } from './events/event-emission-result.js';
export { AnalyticsDelivery } from './delivery/analytics-delivery.js';
export type {
  QueueFlushFailureContext,
  QueueFlushPolicy,
  QueueFlushRecoveredContext,
  QueuePolicy,
} from './delivery/queue/index.js';
export { resolveQueuePolicy } from './delivery/queue/index.js';
export type { AnalyticsFlushOptions } from './delivery/analytics-delivery.js';
export { PersonalizationDelivery } from './delivery/personalization-delivery.js';
export type {
  PersonalizationRequestState,
  PersonalizationRequestFailureReason,
} from './delivery/personalization-request-state.js';
export { validatePersonalizationEvent } from './events/event-interceptors.js';
export type {
  EventInterceptors,
  OptimizationEventStreamEvent,
} from './events/event-interceptors.js';
export {
  InterceptorManager,
  type Interceptor,
  type InterceptorMerge,
  type MaybePromise,
} from './events/interceptor/InterceptorManager.js';
export type { PersonalizationEvent, AnalyticsEvent };
export { validatePreparedEvents, withEventConsent } from './events/prepared-events.js';
export type { PreparedPersonalizationEvent } from './events/prepared-events.js';
export {
  assertExperiencesCacheSafety,
  assertExperiencesHandoffScope,
  createExperiencesHandoff,
  getExperiencesCacheSafetyWarnings,
  parseExperiencesHandoff,
  parseExperiencesHandoffEnvelope,
} from './handoff/experiences-handoff.js';
export type {
  FetchExperienceForHandoffResult,
  ExperiencesCacheMetadata,
  ExperiencesCacheSafetyWarning,
  ExperiencesCacheSafetyWarningCode,
  ExperiencesHandoff,
  ExperiencesScope,
} from './handoff/experiences-handoff.js';
export type {
  EventOptimizationData,
  EventProfile,
  AnalyticsEventMethod,
  PersonalizationEventMethod,
  DirectEventBindings,
  EventMethods,
} from './events/event-methods.js';
