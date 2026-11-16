import type { PersonalizationOptions } from '@contentful/experiences-client';
import {
  ExperienceEvent as PersonalizationEventSchema,
  parseWithFriendlyError as parseOptimizationSchema,
  type ExperienceEvent as PersonalizationEvent,
  type InsightsEvent as AnalyticsEvent,
} from '@contentful/optimization-api-client/api-schemas';

/** Wire events supported by the direct transports and caller-built XDA submissions. */
export type OptimizationEventStreamEvent =
  PersonalizationEvent | AnalyticsEvent | NonNullable<PersonalizationOptions['events']>[number];

/** Validate transformed Personalization events before consent or batch admission. */
export function validatePersonalizationEvent(event: unknown): PersonalizationEvent {
  return parseOptimizationSchema(PersonalizationEventSchema, event);
}

/** Owner-provided event interception; delivery validates the resulting wire event. */
export interface EventInterceptors {
  run(event: PersonalizationEvent | AnalyticsEvent): Promise<unknown>;
  /** Registries can avoid introducing an async boundary when no handlers are installed. */
  count?(): number;
}
