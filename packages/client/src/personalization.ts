import * as z from 'zod/mini';
import type { PersonalizationOptions } from './fetch-experience.js';

// Match the dev.13 generated personalization request types. The client exposes
// no runtime schemas, so validate known fields locally and preserve extra fields.
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};
const object = <T extends Record<string, z.ZodMiniType>>(shape: T) =>
  z.pipe(z.custom<Record<string, unknown>>(isPlainObject), z.looseObject(shape));
type Event = NonNullable<PersonalizationOptions['events']>[number];
type PropertyValue = Extract<Event, { type: 'track' }>['properties'][string];
const propertyValue: z.ZodMiniType<PropertyValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.optional(propertyValue)),
    z.record(z.string(), propertyValue),
  ])
);
const pageFields = {
  path: z.string(),
  query: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  referrer: z.string(),
  search: z.string(),
  url: z.string(),
};
const contextFields = {
  app: z.optional(object({ name: z.string(), version: z.string() })),
  campaign: object({
    name: z.optional(z.string()),
    source: z.optional(z.string()),
    medium: z.optional(z.string()),
    term: z.optional(z.string()),
    content: z.optional(z.string()),
  }),
  gdpr: z.optional(object({ isConsentGiven: z.boolean() })),
  library: object({ name: z.string(), version: z.string() }),
  locale: z.optional(z.string()),
  location: z.optional(
    object({
      coordinates: z.optional(object({ latitude: z.number(), longitude: z.number() })),
      city: z.optional(z.string()),
      postalCode: z.optional(z.string()),
      region: z.optional(z.string()),
      regionCode: z.optional(z.string()),
      country: z.optional(z.string()),
      countryCode: z.optional(z.string()),
      continent: z.optional(z.string()),
      timezone: z.optional(z.string()),
    })
  ),
  userAgent: z.optional(z.string()),
};
const pageContextFields = {
  ...contextFields,
  page: z.optional(object({ ...pageFields, title: z.optional(z.string()) })),
};
const pageContextSchema = object(pageContextFields);
const screenSchema = object({ name: z.string() });
const contextSchema = object({
  ...pageContextFields,
  screen: z.optional(screenSchema),
});
const eventFields = {
  channel: z.enum(['web', 'mobile', 'server', 'client']),
  anonymousId: z.optional(z.string()),
  messageId: z.string(),
  timestamp: z.string(),
  originalTimestamp: z.string(),
  sentAt: z.string(),
  userId: z.optional(z.string()),
};
const eventSchema = z.union([
  object({
    ...eventFields,
    type: z.literal('page'),
    context: pageContextSchema,
    name: z.optional(z.string()),
    properties: object({
      ...pageFields,
      title: z.string(),
    }),
  }),
  object({
    ...eventFields,
    type: z.literal('track'),
    context: contextSchema,
    event: z.string(),
    properties: z.record(z.string(), propertyValue),
  }),
  object({
    ...eventFields,
    type: z.literal('identify'),
    context: contextSchema,
    userId: z.string(),
    traits: z.record(z.string(), propertyValue),
  }),
  object({
    ...eventFields,
    type: z.literal('screen'),
    context: object({ ...contextFields, screen: screenSchema }),
    name: z.string(),
    properties: z.optional(z.record(z.string(), propertyValue)),
  }),
  object({
    ...eventFields,
    type: z.literal('component'),
    context: contextSchema,
    componentId: z.string(),
    componentType: z.optional(z.enum(['Entry', 'Variable'])),
    experienceId: z.optional(z.string()),
    variantIndex: z.optional(z.number()),
    viewDurationMs: z.optional(z.number()),
    viewId: z.optional(z.string()),
  }),
]);
const personalizationSchema = object({
  profileId: z.optional(z.string()),
  events: z.optional(z.array(eventSchema)),
  preflight: z.optional(z.boolean()),
});

/** Validate and serialize events to the generated XDA request contract. */
export function serializePersonalization(personalization: unknown): PersonalizationOptions {
  try {
    return personalizationSchema.parse(personalization);
  } catch (cause) {
    throw new TypeError('Invalid Experience personalization options', { cause });
  }
}
