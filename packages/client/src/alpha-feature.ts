/*
 * The Experience Delivery API serves two entity shapes from the same
 * endpoints: the legacy one (`componentType` / `template` resource links) and
 * the post-SPA-4822 renamed one (`component` / `experienceTemplate`). The
 * renamed shape — the only one this SDK understands — is opt-in via a header.
 *
 * See PROD-2918 and the "How to Migrate" guide:
 * https://contentful.atlassian.net/wiki/spaces/PROD/pages/6847856719/How+to+Migrate
 *
 * The delivery client's response type is the union of both shapes
 * (`GetExperienceResponse = HydratedView | HydratedExperienceView`) because it
 * can't know which header the caller sent. Sending the header here is what
 * makes narrowing to `HydratedExperienceView` sound.
 *
 * This header goes away once the legacy shapes are removed server-side
 * (PROD-3209) and the renamed shape becomes the default.
 */

export const ALPHA_FEATURE_HEADER = 'x-contentful-enable-alpha-feature';

export const NEW_EXO_ENTITY_TYPES = 'new-exo-entity-types';

/** Ready-to-spread header bag opting a request into the renamed ExO entities. */
export const NEW_EXO_ENTITY_TYPES_HEADERS: Record<string, string> = {
  [ALPHA_FEATURE_HEADER]: NEW_EXO_ENTITY_TYPES,
};
