import * as z from 'zod/mini';
import type { PersonalizationOptions } from './fetch-experience.js';

// dev.11 removed ./serialization. Preserve the dev.10 generated
// GetWithOverridesExperienceRequestExtensionsPersonalization schema locally,
// including recursive passthrough and its optional/record parsing semantics.
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};
const object = <T extends Record<string, z.ZodMiniType>>(shape: T) =>
  z.pipe(z.custom<Record<string, unknown>>(isPlainObject), z.looseObject(shape));
const optional = <T extends z.ZodMiniType>(schema: T) =>
  z.transform((value: unknown) => z.optional(schema).parse(value === null ? undefined : value));
const record = <T extends z.ZodMiniType>(schema: T) =>
  z.pipe(
    z.custom<Record<string, unknown>>(isPlainObject),
    z.transform((value: Record<string, unknown>) =>
      z
        .record(z.string(), schema)
        .parse(Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)))
    )
  );
// Generated number validation checks typeof, without imposing finite/integer limits.
const number = z.custom<number>((value) => typeof value === 'number');
const pageFields = {
  path: z.string(),
  query: record(z.union([z.string(), z.array(z.string())])),
  referrer: z.string(),
  search: z.string(),
  url: z.string(),
};
const contextSchema = object({
  app: optional(object({ name: z.string(), version: z.string() })),
  campaign: optional(
    object({
      name: optional(z.string()),
      source: optional(z.string()),
      medium: optional(z.string()),
      term: optional(z.string()),
      content: optional(z.string()),
    })
  ),
  library: object({ name: z.string(), version: z.string() }),
  locale: optional(z.string()),
  location: optional(
    object({
      coordinates: optional(object({ latitude: number, longitude: number })),
      city: optional(z.string()),
      postalCode: optional(z.string()),
      region: optional(z.string()),
      regionCode: optional(z.string()),
      country: optional(z.string()),
      countryCode: optional(z.string()),
      continent: optional(z.string()),
      timezone: optional(z.string()),
    })
  ),
  page: optional(object(pageFields)),
  userAgent: optional(z.string()),
});
const eventFields = {
  channel: z.enum(['web', 'mobile', 'server', 'client']),
  context: contextSchema,
  messageId: z.string(),
  timestamp: z.string(),
  originalTimestamp: optional(z.string()),
  sentAt: optional(z.string()),
  userId: optional(z.string()),
};
const eventSchema = z.union([
  object({
    ...eventFields,
    type: z.literal('page'),
    name: optional(z.string()),
    properties: object({
      ...pageFields,
      title: optional(z.string()),
      category: optional(z.string()),
    }),
  }),
  object({
    ...eventFields,
    type: z.literal('track'),
    event: z.string(),
    properties: optional(record(z.unknown())),
  }),
  object({
    ...eventFields,
    type: z.literal('identify'),
    userId: z.string(),
    traits: record(z.unknown()),
  }),
  object({
    ...eventFields,
    type: z.literal('screen'),
    properties: object({ name: z.string() }),
  }),
  object({
    ...eventFields,
    type: z.literal('component'),
    componentId: z.string(),
    componentType: optional(z.enum(['Entry', 'Variable'])),
    experienceId: optional(z.string()),
    variantIndex: optional(number),
    viewDurationMs: optional(number),
    viewId: optional(z.string()),
  }),
]);
const personalizationSchema = object({
  profileId: optional(z.string()),
  events: optional(z.array(eventSchema)),
});

// Supplement fields absent from the generated XDA context without revalidating
// existing fields against the direct transport's narrower schemas.
const supplementalContextSchema = z.object({
  gdpr: z.optional(z.object({ isConsentGiven: z.boolean() })),
  page: z.optional(z.object({ title: z.optional(z.string()) })),
});

/** Validate and serialize events to the generated XDA request contract. */
export function serializePersonalization(personalization: unknown): PersonalizationOptions {
  try {
    const valid = personalizationSchema.parse(personalization);
    // Keep the generated-equivalent result intact; these checks only validate gdpr/title.
    for (const event of valid.events ?? []) supplementalContextSchema.parse(event.context);
    return valid;
  } catch (cause) {
    throw new TypeError('Invalid Experience personalization options', { cause });
  }
}
