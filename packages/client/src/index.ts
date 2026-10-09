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
export type { CreateClientOptions } from './create-delivery-client.js';
export { fetchExperience } from './fetch-experience.js';
export { fetchDestinationSitemap } from './fetch-destination-sitemap.js';
export type {
  FetchDestinationSitemapOptions,
  FetchDestinationSitemapPaginationOptions,
  SitemapPathItem,
  DestinationSitemapResult,
} from './fetch-destination-sitemap.js';
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
