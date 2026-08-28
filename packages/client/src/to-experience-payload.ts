/*
 * Typed narrowing from a delivery-client response to the payload shape the
 * renderer consumes.
 */

import type { ContentfulViewDelivery } from '@contentful/experience-delivery';
import type { ExperiencePayload, ExperienceSourceMap } from '@contentful/experiences-sdk-core';

/**
 * Either shape the experience endpoint can return — `get()` and
 * `getWithOverrides()` declare the same union.
 */
export type ExperienceResponse =
  | ContentfulViewDelivery.GetExperienceResponse
  | ContentfulViewDelivery.GetWithOverridesExperienceResponse;

/**
 * Narrow a delivery response to `ExperiencePayload`.
 *
 * The endpoint's response type is the union `HydratedView | HydratedExperienceView`
 * — the legacy shape and the renamed ExO entity shape (SPA-4822). Which one
 * comes back is decided by the `x-contentful-enable-alpha-feature:
 * new-exo-entity-types` header, which `@contentful/experience-delivery` sends on
 * every request, so in practice it is always `HydratedExperienceView`. TypeScript
 * cannot know that, so every caller was left writing the same cast by hand:
 *
 * ```ts
 * const { extensions, ...rest } = response;
 * const payload = rest as unknown as ExperiencePayload;
 * ```
 *
 * `fetchExperience` uses this helper internally, so callers who go through it
 * never see the cast. It is exported for anyone driving the delivery client
 * directly — via the `createClient()` this package exports — who would otherwise
 * have to reproduce the narrowing themselves.
 *
 * Type-level only: no validation, no copying, no runtime cost. The response is
 * returned as-is because `HydratedExperienceView` is a structural superset of
 * `ExperiencePayload`.
 *
 * If a response ever does arrive in the legacy shape, its nodes carry
 * `componentType` / `template` links instead of `component` /
 * `experienceTemplate`. `resolveExperience` cannot read those, and reports each
 * one through `warnUnrenderableNode` rather than failing the render.
 */
export function toExperiencePayload(response: ExperienceResponse): ExperiencePayload {
  return response as ContentfulViewDelivery.HydratedExperienceView as ExperiencePayload;
}

/**
 * Read the content source map off a delivery response, if one is present.
 *
 * The map lives at `extensions.sourceMap` and is only populated when the request
 * opted in. Returns `undefined` otherwise, which is the common case — callers
 * pass the result straight to `resolveExperience`, which omits the plan field
 * when it is `undefined`.
 */
export function readSourceMap(response: ExperienceResponse): ExperienceSourceMap | undefined {
  const extensions = (response as ContentfulViewDelivery.HydratedExperienceView).extensions;
  return extensions?.sourceMap as ExperienceSourceMap | undefined;
}
