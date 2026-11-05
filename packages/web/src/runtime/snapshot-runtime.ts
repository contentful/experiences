import {
  DEFAULT_ALLOWED_EVENT_TYPES,
  hasEventConsent,
  type AllowedEventType,
  type EventEmissionResult,
  type EventProfile,
} from '@contentful/experiences-runtime';
import { staticObservable } from '../signals/Observable.js';
import type { CoreStates } from '../states.js';
import type { ExperiencesRuntime } from '../runtime.js';

/**
 * Read-only Experiences state used to create a snapshot runtime.
 *
 * @public
 */
export interface ExperiencesSnapshot {
  /** Profile state used by a server-side, static, or edge render. */
  readonly data?: { readonly profile?: EventProfile };
  /** Tracking consent for the current request or render. */
  readonly consent?: boolean;
  /** Persistence consent for the current request or render. */
  readonly persistenceConsent?: boolean;
  /** Locale for the current request or render. */
  readonly locale?: string;
  /** Event types allowed without full consent. */
  readonly allowedEventTypes?: readonly AllowedEventType[];
}

const INERT_ACTION_WARNING =
  'Experiences action called on the server (read-only runtime); it is a no-op.';

const ACCEPTED_NOOP_RESULT: EventEmissionResult = { accepted: false };

/**
 * Read-only runtime backed by an immutable Experiences snapshot.
 *
 * @public
 */
class SnapshotRuntime implements ExperiencesRuntime {
  private readonly snapshot: ExperiencesSnapshot;
  private readonly allowedEventTypes: readonly AllowedEventType[];

  /** Static observable state derived from the snapshot. */
  readonly states: CoreStates;

  constructor(snapshot: ExperiencesSnapshot = {}) {
    this.snapshot = snapshot;
    this.allowedEventTypes = snapshot.allowedEventTypes ?? DEFAULT_ALLOWED_EVENT_TYPES;

    this.states = {
      preview: staticObservable(undefined),
      blockedEventStream: staticObservable(undefined),
      consent: staticObservable(snapshot.consent),
      persistenceConsent: staticObservable(snapshot.persistenceConsent ?? snapshot.consent),
      eventStream: staticObservable(undefined),
      locale: staticObservable(snapshot.locale),
      experienceRequestState: staticObservable({ status: 'success' }),
      profile: staticObservable(snapshot.data?.profile),
    };
  }

  get locale(): string | undefined {
    return this.snapshot.locale;
  }

  hasConsent(name: string): boolean {
    return hasEventConsent(name, { events: this.snapshot.consent }, this.allowedEventTypes);
  }

  async identify(): Promise<EventEmissionResult> {
    return await Promise.resolve(this.inertEventEmission());
  }

  async page(): Promise<EventEmissionResult> {
    return await Promise.resolve(this.inertEventEmission());
  }

  async track(): Promise<EventEmissionResult> {
    return await Promise.resolve(this.inertEventEmission());
  }

  async trackView(): Promise<EventEmissionResult> {
    return await Promise.resolve(this.inertEventEmission());
  }

  async trackClick(): Promise<EventEmissionResult> {
    return await Promise.resolve(this.inertEventEmission());
  }

  async trackHover(): Promise<EventEmissionResult> {
    return await Promise.resolve(this.inertEventEmission());
  }

  async trackFlagView(): Promise<EventEmissionResult> {
    return await Promise.resolve(this.inertEventEmission());
  }

  consent(): void {
    this.warnInert();
  }

  reset(): void {
    this.warnInert();
  }

  async flush(): Promise<void> {
    this.warnInert();
    await Promise.resolve();
  }

  setLocale(): string | undefined {
    this.warnInert();
    return this.snapshot.locale;
  }

  destroy(): void {
    // Snapshot runtime owns no listeners, timers, or singletons.
  }

  private inertEventEmission(): EventEmissionResult {
    this.warnInert();
    return ACCEPTED_NOOP_RESULT;
  }

  private warnInert(): void {
    console.warn(INERT_ACTION_WARNING);
  }
}

/**
 * Create a read-only runtime from server-provided Experiences state.
 *
 * @public
 */
export function createSnapshotRuntime(snapshot?: ExperiencesSnapshot): ExperiencesRuntime {
  return new SnapshotRuntime(snapshot);
}

export type { SnapshotRuntime };
