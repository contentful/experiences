import { ContentfulViewDelivery } from '@contentful/experience-delivery';

export {
  ContentfulViewDelivery,
  ContentfulViewDeliveryClient,
} from '@contentful/experience-delivery';
export const NotFoundError = ContentfulViewDelivery.NotFoundError;
export type NotFoundError = InstanceType<typeof ContentfulViewDelivery.NotFoundError>;
export { createClient } from './create-client.js';
export type { CreateClientOptions } from './create-client.js';
// Exported so customers who drive `ContentfulViewDeliveryClient` themselves and
// call `resolveExperience` on the raw payload can opt into the same renamed ExO
// entity shapes this SDK expects. `createClient` / `fetchExperience` send it
// for you.
export {
  ALPHA_FEATURE_HEADER,
  NEW_EXO_ENTITY_TYPES,
  NEW_EXO_ENTITY_TYPES_HEADERS,
} from './alpha-feature.js';
export { fetchExperience } from './fetch-experience.js';
export type { ExperienceOptions, ClientOptions, ResolveOptions } from './fetch-experience.js';
export { DELIVERY_HOST, PREVIEW_HOST } from './hosts.js';
