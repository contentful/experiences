import { GetWithOverridesExperienceRequestExtensionsPersonalization as personalizationSchema } from '@contentful/experience-delivery/serialization';
import * as z from 'zod/mini';
import type { PersonalizationOptions } from './fetch-experience.js';

// Supplement fields absent from the generated XDA context without revalidating
// existing fields against the direct transport's narrower schemas.
const supplementalContextSchema = z.object({
  gdpr: z.optional(z.object({ isConsentGiven: z.boolean() })),
  page: z.optional(z.object({ title: z.optional(z.string()) })),
});

/** Validate and serialize events to the generated XDA request contract. */
export function serializePersonalization(personalization: unknown): PersonalizationOptions {
  try {
    const valid = personalizationSchema.parseOrThrow(personalization, {
      unrecognizedObjectKeys: 'passthrough',
    });
    // Keep the generated result intact; these checks only validate gdpr/title.
    for (const event of valid.events ?? []) supplementalContextSchema.parse(event.context);
    return valid;
  } catch (cause) {
    throw new TypeError('Invalid Experience personalization options', { cause });
  }
}
