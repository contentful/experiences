import type {
  BlockedEvent,
  EventProfile,
  ExperienceRequestState,
  OptimizationEventStreamEvent,
} from '@contentful/experiences-runtime';
import type { PreviewState } from '../states.js';
import { batch, computed, effect, signal, type Signal, untracked } from '@preact/signals-core';

/** Bound Preview Session source; absent when preview integration is disabled. */
export const preview = signal<PreviewState | undefined>();

/**
 * Most recent blocked-event metadata produced by consent/runtime guards.
 *
 * @public
 */
export const blockedEvent: Signal<BlockedEvent | undefined> = signal<BlockedEvent | undefined>();

/**
 * Current personalization/analytics consent state.
 *
 * @public
 */
export const consent = signal<boolean | undefined>();

/**
 * Current durable profile-continuity persistence consent state.
 *
 * @public
 */
export const persistenceConsent = signal<boolean | undefined>();

/**
 * Most recent emitted event.
 *
 * @public
 */
export const event: Signal<OptimizationEventStreamEvent | undefined> = signal<
  OptimizationEventStreamEvent | undefined
>();

/**
 * Resolved Contentful locale used by stateful SDK fetches and default Experience requests.
 *
 * @public
 */
export const locale: Signal<string | undefined> = signal<string | undefined>();

/**
 * Runtime online/offline signal used by queue flush logic.
 *
 * @defaultValue `true`
 * @public
 */
export const online = signal<boolean | undefined>(true);

/**
 * Active profile associated with current runtime state.
 *
 * @public
 */
export const profile: Signal<EventProfile | undefined> = signal<EventProfile | undefined>();

/**
 * Outcome signal for the most recent Experience API request.
 *
 * @public
 */
export const experienceRequestState: Signal<ExperienceRequestState> =
  signal<ExperienceRequestState>({
    status: 'idle',
  });

/**
 * Collection of shared stateful Core signals.
 *
 * @public
 */
export interface Signals {
  /** Current preview payload and source status. */
  preview: typeof preview;
  /** Most recent blocked-event metadata. */
  blockedEvent: typeof blockedEvent;
  /** Current consent signal. */
  consent: typeof consent;
  /** Most recent emitted event signal. */
  event: typeof event;
  /** Resolved Contentful locale signal. */
  locale: typeof locale;
  /** Runtime connectivity signal. */
  online: typeof online;
  /** Durable profile-continuity persistence consent signal. */
  persistenceConsent: typeof persistenceConsent;
  /** Active profile signal. */
  profile: typeof profile;
  /** Outcome of the most recent Experience API request. */
  experienceRequestState: typeof experienceRequestState;
}

/**
 * Signal utility functions shared with extensions.
 *
 * @public
 */
export interface SignalFns {
  /** Execute multiple signal writes in one reactive batch. */
  batch: typeof batch;
  /** Create a derived computed signal. */
  computed: typeof computed;
  /** Register a reactive effect. */
  effect: typeof effect;
  /** Read signal values without dependency tracking. */
  untracked: typeof untracked;
}

/**
 * Pre-bundled reference to all shared signals.
 *
 * @public
 */
export const signals: Signals = {
  preview,
  blockedEvent,
  consent,
  event,
  locale,
  online,
  persistenceConsent,
  profile,
  experienceRequestState,
};

/**
 * Pre-bundled reference to shared signal helpers.
 *
 * @public
 */
export const signalFns: SignalFns = {
  batch,
  computed,
  effect,
  untracked,
};

export { batch, effect, type Signal };
