import type {
  ExperienceEvent,
  InsightsEvent,
} from '@contentful/optimization-api-client/api-schemas';

/** Owner-provided event interception; delivery validates the resulting wire event. */
export interface EventInterceptors {
  run(event: ExperienceEvent | InsightsEvent): Promise<unknown>;
}
