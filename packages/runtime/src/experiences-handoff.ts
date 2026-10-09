import {
  ExperienceEventArray,
  parseWithFriendlyError as parseOptimizationSchema,
  type ExperienceEvent,
} from '@contentful/optimization-api-client/api-schemas';
import * as z from 'zod/mini';
import {
  EventProfileSchema,
  type EventOptimizationData,
  type EventProfile,
} from './runtime-event-methods.js';
import { validatePreparedEvents } from './prepared-events.js';

export type ExperiencesCacheMetadata =
  | { readonly scope: 'private-request'; readonly key?: string }
  | {
      readonly scope: 'public-permutation';
      /** Caller-owned key covering Experience identity/revision, environment, locale, and every rendered permutation dimension. */
      readonly key: string;
    }
  | { readonly scope: 'static'; readonly key?: string };

export interface ExperiencesHandoff {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly cache: ExperiencesCacheMetadata;
  /** Only a profile is consumed by the current Web runtime; no selected-content state is copied. */
  readonly state?: { readonly profile?: EventProfile };
  /** Continuation identity, not proof that prepared events were committed. */
  readonly profileId?: string;
  readonly replay?: {
    /** Application route identity: pathname plus search, beginning with `/`. */
    readonly routeKey: string;
    /** Personalization events prepared once, ending in one page. */
    readonly events: readonly ExperienceEvent[];
    readonly locale?: string;
  };
}

export type ExperiencesScope = Pick<ExperiencesHandoff, 'spaceId' | 'environmentId'>;

export type ExperiencesCacheSafetyWarningCode =
  'profile-state-in-public-cache' | 'missing-public-permutation-cache-key';

export interface ExperiencesCacheSafetyWarning {
  readonly code: ExperiencesCacheSafetyWarningCode;
  readonly message: string;
  readonly path?: readonly string[];
}

const CacheSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('private-request'), key: z.optional(z.string()) }),
  z.object({ scope: z.literal('public-permutation'), key: z.string() }),
  z.object({ scope: z.literal('static'), key: z.optional(z.string()) }),
]);

const ExperiencesHandoffSchema = z.object({
  spaceId: z.string(),
  environmentId: z.string(),
  cache: CacheSchema,
  state: z.optional(z.object({ profile: z.optional(EventProfileSchema) })),
  profileId: z.optional(z.string()),
  replay: z.optional(
    z.object({
      routeKey: z.string(),
      events: ExperienceEventArray,
      locale: z.optional(z.string()),
    })
  ),
});

function getPrivateHandoffPath(handoff: ExperiencesHandoff): readonly string[] | undefined {
  if (handoff.state?.profile !== undefined) return ['state', 'profile'];
  if (handoff.profileId !== undefined) return ['profileId'];
  if (handoff.replay !== undefined) return ['replay'];
  return undefined;
}

/** Advisory cache diagnostics; callers choose when to assert. */
export function getExperiencesCacheSafetyWarnings(
  handoff: ExperiencesHandoff
): readonly ExperiencesCacheSafetyWarning[] {
  const warnings: ExperiencesCacheSafetyWarning[] = [];
  const privatePath = getPrivateHandoffPath(handoff);
  if (handoff.cache.scope !== 'private-request' && privatePath !== undefined) {
    warnings.push({
      code: 'profile-state-in-public-cache',
      message:
        'Profile state, identity and replay must not be included in public or static Experiences caches.',
      path: privatePath,
    });
  }
  if (handoff.cache.scope === 'public-permutation' && !handoff.cache.key?.trim()) {
    warnings.push({
      code: 'missing-public-permutation-cache-key',
      message: 'Public Experiences permutations must include a nonempty cache.key.',
      path: ['cache', 'key'],
    });
  }
  return warnings;
}

/** Reject private data in public/static handoffs and a missing public key. */
export function assertExperiencesCacheSafety(handoff: ExperiencesHandoff): void {
  const warnings = getExperiencesCacheSafetyWarnings(handoff);
  if (warnings.length !== 0) {
    throw new TypeError(warnings.map(({ message }) => message).join(' '));
  }
}

/** A handoff from another Contentful scope never mutates this runtime. */
export function assertExperiencesHandoffScope(
  handoff: ExperiencesHandoff,
  scope: ExperiencesScope
): void {
  if (handoff.spaceId !== scope.spaceId || handoff.environmentId !== scope.environmentId) {
    throw new TypeError('Experiences handoff does not match this space or environment');
  }
}

/** Validate an untrusted handoff before any browser state change or transport. This is metadata validation, not HTTP cache enforcement. */
export function parseExperiencesHandoff(
  input: unknown,
  scope?: ExperiencesScope
): ExperiencesHandoff {
  const handoff = parseOptimizationSchema(ExperiencesHandoffSchema, input);
  assertExperiencesCacheSafety(handoff);
  if (scope !== undefined) assertExperiencesHandoffScope(handoff, scope);
  if (handoff.replay !== undefined) {
    if (!handoff.replay.routeKey.startsWith('/')) {
      throw new TypeError('Experiences handoff requires a pathname/search route key');
    }
    validatePreparedEvents(handoff.replay.events);
  }
  return handoff;
}

/** Validate trusted producer data with the same contract as browser input. */
export function createExperiencesHandoff(input: ExperiencesHandoff): ExperiencesHandoff {
  return parseExperiencesHandoff(input);
}

/** Package existing evaluated data without emitting or committing an event. */
export function createRequestHandoffFromData(input: {
  handoff: ExperiencesHandoff;
  data?: EventOptimizationData;
}): ExperiencesHandoff {
  if (input.handoff.cache.scope !== 'private-request') {
    throw new TypeError('Request handoffs must use private-request cache scope');
  }
  return createExperiencesHandoff({
    ...input.handoff,
    ...(input.data === undefined
      ? {}
      : { state: { ...input.handoff.state, profile: input.data.profile } }),
  });
}
