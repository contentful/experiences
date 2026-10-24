import type {
  BlockedEvent,
  EventProfile,
  ExperienceRequestState,
  OptimizationEventStreamEvent,
} from '@contentful/experiences-runtime';
import type { Observable } from './signals/index.js';

/**
 * Combined observable state exposed by the stateful core.
 *
 * @public
 */
export interface CoreStates {
  /** Current consent value (if any). */
  consent: Observable<boolean | undefined>;
  /** Current durable profile-continuity persistence consent value (if any). */
  persistenceConsent: Observable<boolean | undefined>;
  /** Stream of the most recent blocked event payload. */
  blockedEventStream: Observable<BlockedEvent | undefined>;
  /** Stream of the most recent event emitted. */
  eventStream: Observable<OptimizationEventStreamEvent | undefined>;
  /** Live view of the SDK Experience API/event locale. */
  locale: Observable<string | undefined>;
  /** Live view of the current profile. */
  profile: Observable<EventProfile | undefined>;
  /** Outcome of the most recent Experience API request. */
  experienceRequestState: Observable<ExperienceRequestState>;
}
