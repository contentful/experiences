import type {
  BlockedEvent,
  EventProfile,
  ExperienceRequestState,
  OptimizationEventStreamEvent,
  RuntimePreviewStatus,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { Observable } from './signals/index.js';

/**
 * Current Preview Session source, shared as read-only state.
 *
 * @public
 */
export interface PreviewState {
  readonly experienceId?: string;
  readonly sessionId?: string;
  readonly data: ExperiencePayload | undefined;
  readonly error: Error | undefined;
  readonly status: RuntimePreviewStatus | undefined;
  readonly revision: number;
}

/** A resolved update or error; the view retains its own displayed plan. */
export interface PreviewUpdate {
  readonly data?: PortableRenderPlan;
  readonly error?: Error;
}

/** Combined observable state exposed by the Web SDK. */
export interface CoreStates {
  /** Current bound preview source. Payloads are shared read-only references. */
  preview: Observable<PreviewState | undefined>;
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
