/*
 * Typed narrowing from a delivery-client response to the payload shape the
 * renderer consumes.
 */

import type { ContentfulViewDelivery } from '@contentful/experience-delivery';
import type { ExperiencePayload, ExperienceSourceMap } from '@contentful/experiences-sdk-core';

/** Either shape the experience endpoint can return — `get()` and `getWithOverrides()` share it. */
export type ExperienceResponse =
  | ContentfulViewDelivery.GetExperienceResponse
  | ContentfulViewDelivery.GetWithOverridesExperienceResponse;

/**
 * Narrow a delivery response to `ExperiencePayload`.
 *
 * The endpoint types its response as `HydratedView | HydratedExperienceView`.
 * The alpha-feature header the delivery client always sends guarantees the
 * latter, but TypeScript cannot know that, so callers were left casting by hand.
 *
 * `fetchExperience` uses this internally; it is exported for anyone driving the
 * delivery client directly. Type-level only — no validation, no copying.
 *
 * A legacy-shaped response carries `componentType` / `template` links instead;
 * `resolveExperience` reports those through `warnUnrenderableNode`.
 */
export function toExperiencePayload(response: ExperienceResponse): ExperiencePayload {
  return response as ContentfulViewDelivery.HydratedExperienceView as ExperiencePayload;
}

/** Read `extensions.sourceMap` off a response. `undefined` when the request did not opt in. */
export function readSourceMap(response: ExperienceResponse): ExperienceSourceMap | undefined {
  const extensions = (response as ContentfulViewDelivery.HydratedExperienceView).extensions;
  return extensions?.sourceMap as ExperienceSourceMap | undefined;
}
