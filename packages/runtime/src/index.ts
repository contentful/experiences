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
} from './constants.js';
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
} from './consent.js';
export type {
  AllowedEventType,
  BlockedEvent,
  BlockedEventReason,
  ConsentInput,
  ConsentState,
  ConsentStorageValue,
  EventMethod,
  EventType,
} from './consent.js';
export { ContentfulExperiences, buildFetchPersonalization } from './contentful-experiences.js';
export { resolveFlagChange } from './resolve-flag-change.js';
export {
  getExperienceRequestIdentity,
  getExperienceSelectorKind,
  isDestinationRequest,
} from './experience-selector.js';
export type { ExperienceRequest, ExperienceSelectorKind } from './experience-selector.js';
export { isDestinationRedirect } from '@contentful/experiences-client';
export type {
  DestinationRedirectResult,
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
  PersonalizationOptions,
  BuiltFetchExperienceOptions,
  FetchByDestinationNodeOptions,
  FetchByDestinationPathOptions,
  FetchDestinationOptions,
  BuiltFetchDestinationOptions,
  FetchDestinationSitemapOptions,
  EventBuilderOptions,
  FetchResolveOptions,
  ResolveDefaults,
  ResolveOptions,
} from './contentful-experiences.js';
export type { DeliveryClientOptions } from './create-delivery-client.js';
export { getPreviewSessionBinding, resolvePreviewSessionId } from './preview-session-binding.js';
export type { PreviewSessionBinding } from './preview-session-binding.js';
export {
  assertPreviewRequest,
  createPreviewClient,
  mergePreviewResolveOptions,
} from './live-preview.js';
export type {
  LivePreviewOwnerConfig,
  PreviewConfig,
  PreviewSessionOptions,
  PreviewClient,
  PreviewClientOptions,
  PreviewClientFactory,
  PreviewSessionIdentity,
  PreviewStatus,
} from './live-preview.js';
export type { ApiClient, OptimizationConfig } from './create-optimization-client.js';
export { default as EventBuilder } from './event-builder.js';
export * from './event-builder.js';
export { EventProfileRequiredError, EventProfileSchema } from './event-methods.js';
export type { PersonalizationRequestOptions, AnalyticsRequestOptions } from './event-methods.js';
export type { EventEmissionResult } from './event-emission-result.js';
export { AnalyticsDelivery } from './analytics-delivery.js';
export type {
  QueueFlushFailureContext,
  QueueFlushPolicy,
  QueueFlushRecoveredContext,
  QueuePolicy,
} from './lib/queue/index.js';
export { resolveQueuePolicy } from './lib/queue/index.js';
export type { AnalyticsFlushOptions } from './analytics-delivery.js';
export { PersonalizationDelivery } from './personalization-delivery.js';
export type {
  PersonalizationRequestState,
  PersonalizationRequestFailureReason,
} from './personalization-request-state.js';
export { validatePersonalizationEvent } from './event-interceptors.js';
export type { EventInterceptors, OptimizationEventStreamEvent } from './event-interceptors.js';
export {
  InterceptorManager,
  type Interceptor,
  type InterceptorMerge,
  type MaybePromise,
} from './lib/interceptor/InterceptorManager.js';
export type { PersonalizationEvent, AnalyticsEvent };
export { validatePreparedEvents, withEventConsent } from './prepared-events.js';
export type { PreparedPersonalizationEvent } from './prepared-events.js';
export {
  assertExperiencesCacheSafety,
  assertExperiencesHandoffScope,
  createExperiencesHandoff,
  getExperiencesCacheSafetyWarnings,
  parseExperiencesHandoff,
  parseExperiencesHandoffEnvelope,
} from './experiences-handoff.js';
export type {
  FetchExperienceForHandoffResult,
  FetchDestinationForHandoffResult,
  ExperiencesCacheMetadata,
  ExperiencesCacheSafetyWarning,
  ExperiencesCacheSafetyWarningCode,
  ExperiencesHandoff,
  ExperiencesScope,
} from './experiences-handoff.js';
export type {
  EventOptimizationData,
  EventProfile,
  AnalyticsEventMethod,
  PersonalizationEventMethod,
  EventBindings,
  DirectEventBindings,
  EventDispatch,
  EventMethods,
} from './event-methods.js';
