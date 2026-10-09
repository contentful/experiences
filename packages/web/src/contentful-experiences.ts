import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  PersonalizationDelivery,
  type ContentfulExperiencesConfig,
  type EventBuilderConfig,
  type EventEmissionResult,
  type EventProfile,
  type ExperiencesHandoff,
  type PersonalizationDeliveryState,
  parseRuntimeEventHandoff,
  type RuntimeEventHandoff,
  type RuntimeEventHandoffReceipt,
  type RuntimeEventMethods,
  type RuntimeFetchExperienceOptions,
  type RuntimeResolveOptions,
} from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { getPageProperties, getUserAgent } from './browser-event-context.js';
import {
  createInteractionTracking,
  type InteractionTracking,
  type InteractionTrackingOptions,
} from './interaction-tracking.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';
import LocalStore from './storage/local-store.js';

/** Optional browser context providers, useful for application-specific redaction. */
export type BrowserEventContextProviders = Pick<
  EventBuilderConfig,
  'getPageProperties' | 'getUserAgent' | 'getConsent'
>;

/**
 * Long-lived, browser-oriented SDK configuration.
 */
type WebEventStateConfig =
  | {
      /** Initial browser event profile. Mutually exclusive with eventHandoff. */
      profile?: EventProfile;
      eventHandoff?: never;
      eventHandoffRouteKey?: never;
    }
  | {
      profile?: never;
      /** Validated server journal that this browser runtime commits at most once. */
      eventHandoff: RuntimeEventHandoff;
      /** Current browser route identity used to admit a page-bearing handoff. */
      eventHandoffRouteKey: string;
    };

export type ExperiencesWebConfig = Omit<ContentfulExperiencesConfig, 'eventBuilder' | 'locale'> &
  WebEventStateConfig & {
    locale?: string;
    app?: EventBuilderConfig['app'];
    browserContext?: BrowserEventContextProviders;
  };

type WebEventMethods = Pick<
  RuntimeEventMethods,
  'identify' | 'page' | 'track' | 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView'
>;

export type InteractionTrackingStartOptions = InteractionTrackingOptions;

export interface InteractionTrackingSession {
  refresh(): void;
  stop(): Promise<void>;
}

/** Browser runtime with mutable application locale and live event context. */
export class ContentfulExperiences extends RuntimeContentfulExperiences {
  #locale: string | undefined;
  readonly #store = new LocalStore();
  readonly #delivery: PersonalizationDelivery;
  #eventHandoffPending = false;
  #interactionTracking: InteractionTracking | undefined;
  #adoptedProfileId: string | undefined;
  #generation = 0;
  #destroyed = false;
  #online = globalThis.navigator?.onLine !== false;
  readonly #eventHandoffPromise: Promise<RuntimeEventHandoffReceipt>;
  readonly #eventMethods: RuntimeEventMethods;
  readonly #handleOnline = (): void => {
    this.#online = true;
    this.#delivery.clearScheduledRetry();
    void this.#delivery.flush({ force: true });
  };
  readonly #handleOffline = (): void => {
    this.#online = false;
  };
  readonly identify: WebEventMethods['identify'] = (...args) =>
    this.#afterEventHandoff(() => this.#eventMethods.identify(...args), { accepted: false });
  readonly page: WebEventMethods['page'] = (...args) =>
    this.#afterEventHandoff(() => this.#eventMethods.page(...args), { accepted: false });
  readonly track: WebEventMethods['track'] = (...args) =>
    this.#afterEventHandoff(() => this.#eventMethods.track(...args), { accepted: false });
  readonly trackView: WebEventMethods['trackView'] = (...args) =>
    this.#destroyed
      ? Promise.resolve(false)
      : this.#afterEventHandoff(() => this.#eventMethods.trackView(...args), false);
  readonly trackClick: WebEventMethods['trackClick'] = (...args) =>
    this.#destroyed
      ? Promise.resolve(false)
      : this.#afterEventHandoff(() => this.#eventMethods.trackClick(...args), false);
  readonly trackHover: WebEventMethods['trackHover'] = (...args) =>
    this.#destroyed
      ? Promise.resolve(false)
      : this.#afterEventHandoff(() => this.#eventMethods.trackHover(...args), false);
  readonly trackFlagView: WebEventMethods['trackFlagView'] = (...args) =>
    this.#destroyed
      ? Promise.resolve(false)
      : this.#afterEventHandoff(() => this.#eventMethods.trackFlagView(...args), false);

  constructor(config: ExperiencesWebConfig) {
    const { app, browserContext, profile, eventHandoff, eventHandoffRouteKey, ...clientConfig } =
      config;
    super({
      ...clientConfig,
      eventBuilder: {
        app,
        channel: 'web',
        library: DEFAULT_EVENT_CONTEXT_LIBRARY,
        getPageProperties: browserContext?.getPageProperties ?? getPageProperties,
        getUserAgent: browserContext?.getUserAgent ?? getUserAgent,
        getConsent: browserContext?.getConsent,
      },
    });
    let delivery: PersonalizationDelivery | undefined;
    try {
      if (profile !== undefined && eventHandoff !== undefined) {
        throw new TypeError(
          'ExperiencesWebConfig accepts either profile or eventHandoff, not both'
        );
      }
      this.#locale = clientConfig.locale;
      if (profile !== undefined) this.#store.profile = profile;
      this.#delivery = delivery = new PersonalizationDelivery({
        api: this.optimizationApi.personalization,
        getProfileId: () => this.#store.profile?.id ?? this.#adoptedProfileId,
        getProfileRevision: () => this.#store.profileRevision,
        getOnline: () => this.#online,
        publishQueuedData: (data) => {
          if (this.#destroyed) return;
          this.#store.profile = data.profile;
          this.#adoptedProfileId = undefined;
        },
      });
      this.#eventMethods = this.createEventMethods(
        {
          getProfile: () =>
            this.#store.profile ??
            (this.#adoptedProfileId === undefined ? undefined : { id: this.#adoptedProfileId }),
          setProfile: (nextProfile) => {
            this.#store.profile = nextProfile;
            this.#adoptedProfileId = undefined;
          },
          getProfileRevision: () => this.#store.profileRevision,
        },
        {
          personalization: (event) => this.#delivery.send(event),
          analytics: (event, currentProfile) =>
            this.optimizationApi.analytics.sendBatchEvents([
              { profile: currentProfile, events: [event] },
            ]),
        }
      );
      this.#eventHandoffPromise = this.#startEventHandoff(eventHandoff, eventHandoffRouteKey);
      // Replay is eager. Mark a rejection as observed even when an application has
      // not attached its barrier handler yet; callers still receive the original
      // rejected promise from whenEventHandoffCommitted().
      void this.#eventHandoffPromise.catch(() => undefined);
      if (typeof window !== 'undefined') {
        window.addEventListener('online', this.#handleOnline);
        window.addEventListener('offline', this.#handleOffline);
      }
    } catch (error) {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.#handleOnline);
        window.removeEventListener('offline', this.#handleOffline);
      }
      delivery?.destroy();
      super.destroy();
      throw error;
    }
  }

  override get locale(): string | undefined {
    return this.#locale;
  }

  get profile(): EventProfile | undefined {
    return this.#store.profile;
  }

  /** Latest ordinary or prepared Personalization HTTP state. */
  get personalizationDeliveryState(): PersonalizationDeliveryState {
    return this.#delivery.state;
  }

  /**
   * Resolves after the optional server handoff commits or is skipped for route
   * incompatibility. A transport failure rejects without blocking later calls.
   */
  whenEventHandoffCommitted(): Promise<RuntimeEventHandoffReceipt> {
    return this.#eventHandoffPromise;
  }

  /** Changes the default locale used by subsequent events and fetches. */
  setLocale(locale: string | undefined): void {
    this.#locale = locale;
  }

  override async fetchExperience(
    options: RuntimeFetchExperienceOptions,
    resolveOptions?: RuntimeResolveOptions
  ): Promise<PortableRenderPlan> {
    if (this.#destroyed) throw new Error('Experiences SDK has been destroyed');
    const profileRevision = this.#store.profileRevision;
    const profileId =
      options.personalization?.profileId ?? this.#store.profile?.id ?? this.#adoptedProfileId;
    const plan = await super.fetchExperience(
      profileId === undefined
        ? options
        : {
            ...options,
            personalization: { ...options.personalization, profileId },
          },
      resolveOptions
    );
    if (!this.#destroyed && options.preview !== true) {
      this.#store.updateProfileFromId(plan.personalization?.profileId, profileRevision);
    }
    return plan;
  }

  /** Clears browser profile state and its persisted id. */
  reset(): void {
    if (this.#destroyed) return;
    this.#generation += 1;
    this.#eventHandoffPending = false;
    this.#adoptedProfileId = undefined;
    this.#delivery.reset();
    this.#store.reset();
  }

  /** Stop browser-owned interaction observers before releasing SDK ownership. */
  override destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#generation += 1;
    this.#eventHandoffPending = false;
    try {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.#handleOnline);
        window.removeEventListener('offline', this.#handleOffline);
      }
      this.#delivery.destroy();
      this.#interactionTracking?.destroy();
      this.#interactionTracking = undefined;
    } finally {
      super.destroy();
    }
  }

  startInteractionTracking(options: InteractionTrackingStartOptions): InteractionTrackingSession {
    if (this.#destroyed) throw new Error('Experiences SDK has been destroyed');
    if (this.#interactionTracking) {
      throw new Error('Interaction tracking is already running; stop it before starting again');
    }
    const tracking = createInteractionTracking(this, options);
    this.#interactionTracking = tracking;

    let stopping: Promise<void> | undefined;
    return {
      refresh: () => {
        if (this.#interactionTracking === tracking) tracking.refresh();
      },
      stop: () => {
        if (stopping) return stopping;
        // Everything but the sends is synchronous: `endActive()` ends in-progress
        // views and hovers before its first await, so the session can be torn
        // down and its slot released at once, and only the final events are
        // still in flight when a new session starts.
        if (this.#interactionTracking === tracking) this.#interactionTracking = undefined;
        const flushed = tracking.endActive();
        tracking.destroy();
        stopping = flushed;
        return stopping;
      },
    };
  }

  #afterEventHandoff<T>(operation: () => Promise<T>, staleResult: T): Promise<T> {
    if (!this.#eventHandoffPending) return operation();
    const generation = this.#generation;
    const proceed = (): T | Promise<T> =>
      this.#destroyed || this.#generation !== generation ? staleResult : operation();
    return this.#eventHandoffPromise.then(proceed, proceed);
  }

  /** Internal Phase 4 admission seam used by the imperative handoff lifecycle in Phase 5. */
  protected sendPreparedExperienceEvents(
    events: NonNullable<ExperiencesHandoff['replay']>['events'],
    profileId?: string,
    locale?: string
  ): Promise<EventEmissionResult> {
    if (this.#destroyed) return Promise.resolve({ accepted: false });
    const targetId = this.#store.profile?.id ?? this.#adoptedProfileId ?? profileId;
    const result = this.#delivery.sendPrepared(events, { profileId: targetId, locale });
    if (result.accepted && this.#store.profile === undefined) this.#adoptedProfileId = targetId;
    return Promise.resolve(result);
  }

  #startEventHandoff(
    input: RuntimeEventHandoff | undefined,
    currentRouteKey: string | undefined
  ): Promise<RuntimeEventHandoffReceipt> {
    if (input === undefined) {
      return Promise.resolve({});
    }
    if (currentRouteKey === undefined) {
      throw new TypeError('ExperiencesWebConfig eventHandoff requires eventHandoffRouteKey');
    }

    const handoff = parseRuntimeEventHandoff(input);
    if (handoff.spaceId !== this.spaceId || handoff.environmentId !== this.environmentId) {
      throw new TypeError('Runtime event handoff does not match this space or environment');
    }

    const hasPage = handoff.events.some(
      (entry) => entry.transport === 'personalization' && entry.event.type === 'page'
    );
    if (
      hasPage &&
      (handoff.initialPageRouteKey === undefined || handoff.initialPageRouteKey !== currentRouteKey)
    ) {
      return Promise.resolve({});
    }

    this.#eventHandoffPending = true;
    return this.#replayEventHandoff(handoff);
  }

  async #replayEventHandoff(handoff: RuntimeEventHandoff): Promise<RuntimeEventHandoffReceipt> {
    const generation = this.#generation;
    const isCurrent = (): boolean => !this.#destroyed && this.#generation === generation;
    try {
      let profile: EventProfile | undefined =
        handoff.initialProfileId === undefined ? undefined : { id: handoff.initialProfileId };
      this.#store.profile = profile;
      for (let index = 0; index < handoff.events.length;) {
        if (!isCurrent()) return {};
        const staged = handoff.events[index]!;
        if (staged.transport === 'personalization') {
          const locale = staged.event.context.locale;
          const events = [staged.event];
          index += 1;
          while (index < handoff.events.length) {
            const next = handoff.events[index]!;
            if (next.transport !== 'personalization' || next.event.context.locale !== locale) break;
            events.push(next.event);
            index += 1;
          }
          const result = await this.optimizationApi.personalization.upsertProfile(
            { profileId: profile?.id, events },
            { locale }
          );
          if (!isCurrent()) return {};
          profile = result.profile;
          this.#store.profile = profile;
        } else {
          index += 1;
          if (profile === undefined) {
            throw new Error('Runtime event handoff Analytics replay requires a committed profile');
          }
          const committed = await this.optimizationApi.analytics.sendBatchEvents([
            { profile, events: [staged.event] },
          ]);
          if (!isCurrent()) return {};
          if (!committed) {
            throw new Error('Runtime event handoff Analytics replay was not committed');
          }
        }
      }

      return {
        ...(handoff.initialPageRouteKey === undefined
          ? {}
          : { initialPageRouteKey: handoff.initialPageRouteKey }),
      };
    } finally {
      if (isCurrent()) this.#eventHandoffPending = false;
    }
  }
}
