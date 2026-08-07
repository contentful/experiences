/*
 * The Experience Delivery API gates the ExO entity shapes this SDK reads —
 * nodes linking `component` / `experienceTemplate`, and `sys.experienceTemplate`
 * for the page-level reference — behind an alpha-feature header. A request
 * without the header gets a different shape, which this SDK does not parse.
 *
 * The header is therefore required, not optional, and is sent from two places:
 * `createClient` sets it as a client default, and `fetchExperience` sends it
 * per request so a caller-supplied client is covered too.
 *
 * It also makes the response type unambiguous: the delivery client types
 * `GetExperienceResponse` as a union of the shapes the endpoint can return,
 * because it cannot know which header the caller sent. Sending the header is
 * what lets `fetch-experience.ts` narrow to `HydratedExperienceView`.
 */

export const ALPHA_FEATURE_HEADER = 'x-contentful-enable-alpha-feature';

export const NEW_EXO_ENTITY_TYPES = 'new-exo-entity-types';

/** Ready-to-spread header bag selecting the ExO entity shapes this SDK reads. */
export const NEW_EXO_ENTITY_TYPES_HEADERS: Record<string, string> = {
  [ALPHA_FEATURE_HEADER]: NEW_EXO_ENTITY_TYPES,
};
