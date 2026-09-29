import { ContentfulViewDelivery } from '@contentful/experience-delivery';

export {
  ContentfulViewDelivery,
  ContentfulViewDeliveryClient,
} from '@contentful/experience-delivery';
export const NotFoundError = ContentfulViewDelivery.NotFoundError;
// eslint-disable-next-line no-redeclare -- value + type share a name across separate TS namespaces, not a real redeclaration
export type NotFoundError = InstanceType<typeof ContentfulViewDelivery.NotFoundError>;
export { ExperienceFetchError, DestinationPreviewNotSupportedError } from './errors.js';
export { createClient } from './create-delivery-client.js';
export type {
  CreateClientOptions,
  RuntimeDeliveryClientOptions,
} from './create-delivery-client.js';
export type { RuntimeOptimizationConfig } from './create-optimization-client.js';
export { default as EventBuilder } from './event-builder.js';
export * from './event-builder.js';
export { fetchExperience } from './fetch-experience.js';
export { ContentfulExperiences } from './contentful-experiences.js';
export type {
  ContentfulExperiencesConfig,
  ExperienceRuntime,
  RuntimeFetchExperienceOptions,
  RuntimeFetchByDestinationNodeOptions,
  RuntimeFetchByDestinationPathOptions,
  RuntimeEventBuilderConfig,
  RuntimeResolveOptions,
} from './contentful-experiences.js';
export { EventProfileRequiredError } from './runtime-event-methods.js';
export type {
  EventOptimizationData,
  EventProfile,
  ExperienceEventMethod,
  InsightsEventMethod,
  RuntimeEventBindings,
  RuntimeEventMethods,
} from './runtime-event-methods.js';
export {
  readSourceMap,
  toExperiencePayload,
  toExperiencePayloadFromDestination,
} from './to-experience-payload.js';
export type { ExperienceResponse } from './to-experience-payload.js';
export type {
  ExperienceOptions,
  ExperienceRequestExtensions,
  PersonalizationOptions,
  ByIdExperienceOptions,
  ByDestinationNodeIdExperienceOptions,
  ByDestinationPathExperienceOptions,
  ClientOptions,
  ResolveOptions,
  DestinationRedirectResult,
} from './fetch-experience.js';
export { DELIVERY_HOST, PREVIEW_HOST, PREVIEW_WEBSOCKET_HOST } from './hosts.js';
