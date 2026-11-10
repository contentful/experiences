import type { PersonalizationOptions } from '@contentful/experiences-client';
import {
  ExperienceEvent as ExperienceEventSchema,
  parseWithFriendlyError as parseOptimizationSchema,
  type ExperienceEvent,
  type InsightsEvent,
} from '@contentful/optimization-api-client/api-schemas';

/** Wire events supported by the direct transports and caller-built XDA submissions. */
export type OptimizationEventStreamEvent =
  ExperienceEvent | InsightsEvent | NonNullable<PersonalizationOptions['events']>[number];

/** Validate transformed Personalization events before consent or batch admission. */
export function validatePersonalizationEvent(event: unknown): ExperienceEvent {
  return parseOptimizationSchema(ExperienceEventSchema, event);
}

/** Owner-provided event interception; delivery validates the resulting wire event. */
export interface EventInterceptors {
  run(event: ExperienceEvent | InsightsEvent): Promise<unknown>;
  /** Registries can avoid introducing an async boundary when no handlers are installed. */
  count?(): number;
}
