import { GetWithOverridesExperienceRequestExtensionsPersonalization as personalizationSchema } from '@contentful/experience-delivery/serialization';
import type { PersonalizationOptions } from './fetch-experience.js';

/** Validate and serialize events to the generated XDA request contract. */
export function serializePersonalization(personalization: unknown): PersonalizationOptions {
  try {
    // XDA rejects EventBuilder's context.gdpr with HTTP 422. Keep caller-built
    // events intact and serialize to its generated schema, which omits consent.
    return personalizationSchema.parseOrThrow(personalization, {
      unrecognizedObjectKeys: 'strip',
    });
  } catch (cause) {
    throw new TypeError('Invalid Experience personalization options', { cause });
  }
}
