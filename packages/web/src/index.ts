export { getPageProperties, getUserAgent } from './browser-event-context.js';
export { ContentfulExperiences } from './contentful-experiences.js';
export type {
  BrowserEventContextProviders,
  ExperiencesWebConfig,
} from './contentful-experiences.js';
export { EXPERIENCES_WEB_SDK_NAME, EXPERIENCES_WEB_SDK_VERSION } from './sdk-info.js';

export {
  ContentfulViewDelivery,
  ContentfulViewDeliveryClient,
  DELIVERY_HOST,
  ExperienceFetchError,
  EventProfileRequiredError,
  NotFoundError,
  PREVIEW_HOST,
  createClient,
} from '@contentful/experiences-client';
export type {
  CreateClientOptions,
  DestinationRedirectResult,
  ExperienceRequestExtensions,
  PersonalizationOptions,
  EventOptimizationData,
  EventProfile,
  ClickBuilderArgs,
  FlagViewBuilderArgs,
  HoverBuilderArgs,
  IdentifyBuilderArgs,
  PageViewBuilderArgs,
  RuntimeEventMethods,
  RuntimeOptimizationConfig,
  RuntimeClientSource,
  RuntimeFetchByDestinationNodeOptions,
  RuntimeFetchByDestinationPathOptions,
  RuntimeFetchExperienceOptions,
  RuntimeResolveOptions,
  TrackBuilderArgs,
  UniversalEventBuilderArgs,
  ViewBuilderArgs,
} from '@contentful/experiences-client';
export type {
  ExperiencePayload,
  PortableRenderPlan,
  ResolverConfig,
} from '@contentful/experiences-sdk-core';
