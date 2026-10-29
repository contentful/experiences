import { GetWithOverridesExperienceRequestExtensionsPersonalization as personalizationSchema } from '@contentful/experience-delivery/serialization';
import type { PersonalizationOptions } from './fetch-experience.js';

/** Validate and serialize events to the generated XDA request contract. */
export function serializePersonalization(personalization: unknown): PersonalizationOptions {
  try {
    // XDA rejects EventBuilder's context.gdpr with HTTP 422. Keep caller-built
    // events intact; stripping unsupported fields is temporary normalization.
    // If upstream accepts/converts the built shape, simplify redundant conversion,
    // but retain final-shape validation before Node/Web final consent callbacks
    // and Web event publication, input immutability, and wire-contract coverage.
    // See implementations/node-sdk/README.md's XDA workaround removal criteria.
    return personalizationSchema.parseOrThrow(personalization, {
      unrecognizedObjectKeys: 'strip',
    });
  } catch (cause) {
    throw new TypeError('Invalid Experience personalization options', { cause });
  }
}
