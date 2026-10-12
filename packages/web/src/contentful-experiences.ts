import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  PersonalizationDelivery,
  type ContentfulExperiencesConfig,
  type EventBuilderConfig,
  type EventEmissionResult,
  type EventProfile,
  type ExperiencesHandoff,
  type PageViewBuilderArgs,
  type PersonalizationDeliveryState,
  parseExperiencesHandoff,
  type RuntimeEventMethods,
  type RuntimeFetchExperienceOptions,
  type RuntimeFetchResolveOptions,
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
import { acquireWebSingleton, releaseWebSingleton } from './web-singleton.js';

/** Optional browser context providers, useful for application-specific redaction. */
export type BrowserEventContextProviders = Pick<
  EventBuilderConfig,
  'getPageProperties' | 'getUserAgent' | 'getConsent'
>;

/**
 * Long-lived, browser-oriented SDK configuration.
 */
export type ExperiencesWebConfig = Omit<ContentfulExperiencesConfig, 'eventBuilder' | 'locale'> & {
  profile?: EventProfile;
  locale?: string;
  app?: EventBuilderConfig['app'];
  browserContext?: BrowserEventContextProviders;
};

export interface CurrentPageOptions {
  /** Application-owned pathname and search string. */
  readonly routeKey: string;
  readonly buildPayload: (metadata: {
    isInitialEmission: boolean;
  }) => PageViewBuilderArgs | undefined;
}

export interface HydrateAndTrackCurrentPageOptions extends Omit<
  CurrentPageOptions,
  'buildPayload'
> {
  readonly buildPayload?: CurrentPageOptions['buildPayload'];
}

interface HandoffInitialization {
  readonly key: string | ExperiencesHandoff;
  readonly routeKey: string;
  readonly isCurrent: () => boolean;
  identityReady?: Promise<string | undefined>;
  hydration?: Promise<void>;
  delivery?: Promise<EventEmissionResult>;
}

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
  readonly #singletonOwner: string;
  #locale: string | undefined;
  readonly #store = new LocalStore();
  readonly #delivery: PersonalizationDelivery;
  #interactionTracking: InteractionTracking | undefined;
  #adoptedProfileId: string | undefined;
  #identityRevision = 0;
  #currentInitialization: HandoffInitialization | undefined;
  #acceptedCurrentPage: { routeKey: string } | undefined;
  #inFlightCurrentPage: { routeKey: string } | undefined;
  #generation = 0;
  #destroyed = false;
  #online = globalThis.navigator?.onLine !== false;
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
    this.#eventMethods.identify(...args);
  readonly page: WebEventMethods['page'] = (...args) => this.#eventMethods.page(...args);
  readonly track: WebEventMethods['track'] = (...args) => this.#eventMethods.track(...args);
  readonly trackView: WebEventMethods['trackView'] = (...args) =>
    this.#destroyed ? Promise.resolve(false) : this.#eventMethods.trackView(...args);
  readonly trackClick: WebEventMethods['trackClick'] = (...args) =>
    this.#destroyed ? Promise.resolve(false) : this.#eventMethods.trackClick(...args);
  readonly trackHover: WebEventMethods['trackHover'] = (...args) =>
    this.#destroyed ? Promise.resolve(false) : this.#eventMethods.trackHover(...args);
  readonly trackFlagView: WebEventMethods['trackFlagView'] = (...args) =>
    this.#destroyed ? Promise.resolve(false) : this.#eventMethods.trackFlagView(...args);

  constructor(config: ExperiencesWebConfig) {
    const { app, browserContext, profile, ...clientConfig } = config;
    const singletonOwner = acquireWebSingleton();
    try {
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
    } catch (error) {
      releaseWebSingleton(singletonOwner);
      throw error;
    }
    this.#singletonOwner = singletonOwner;
    let delivery: PersonalizationDelivery | undefined;
    try {
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
          this.#setAdoptedProfileId(undefined);
        },
      });
      this.#eventMethods = this.createEventMethods(
        {
          getProfile: () =>
            this.#store.profile ??
            (this.#adoptedProfileId === undefined ? undefined : { id: this.#adoptedProfileId }),
          setProfile: (nextProfile) => {
            if (this.#destroyed) return;
            this.#store.profile = nextProfile;
            this.#setAdoptedProfileId(undefined);
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
      if (typeof window !== 'undefined') {
        window.addEventListener('online', this.#handleOnline);
        window.addEventListener('offline', this.#handleOffline);
      }
    } catch (error) {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.#handleOnline);
        window.removeEventListener('offline', this.#handleOffline);
      }
      try {
        delivery?.destroy();
      } finally {
        try {
          super.destroy();
        } finally {
          releaseWebSingleton(this.#singletonOwner);
        }
      }
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

  /** Changes the default locale used by subsequent events and fetches. */
  setLocale(locale: string | undefined): void {
    this.#locale = locale;
  }

  override async fetchExperience(
    options: RuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan> {
    if (this.#destroyed) throw new Error('Experiences SDK has been destroyed');
    if (
      this.#currentInitialization?.identityReady !== undefined ||
      this.#currentInitialization?.hydration !== undefined
    ) {
      await this.#awaitCurrentHandoffIdentity();
      if (this.#destroyed) throw new Error('Experiences SDK has been destroyed');
    }
    const profileRevision = this.#store.profileRevision;
    const identityRevision = this.#identityRevision;
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
    if (
      !this.#destroyed &&
      options.preview !== true &&
      this.#identityRevision === identityRevision
    ) {
      this.#store.updateProfileFromId(plan.personalization?.profileId, profileRevision);
    }
    return plan;
  }

  /** Clear live browser state, or cancel this instance's unfinished drain after destroy. */
  reset(): void {
    if (this.#destroyed) {
      this.#delivery.reset();
      return;
    }
    this.#generation += 1;
    this.#currentInitialization = undefined;
    this.#acceptedCurrentPage = undefined;
    this.#inFlightCurrentPage = undefined;
    this.#setAdoptedProfileId(undefined);
    this.#delivery.reset();
    this.#store.reset();
  }

  /** Stop browser-owned work before releasing SDK ownership. */
  override destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#generation += 1;
    this.#currentInitialization = undefined;
    this.#acceptedCurrentPage = undefined;
    this.#inFlightCurrentPage = undefined;
    try {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.#handleOnline);
        window.removeEventListener('offline', this.#handleOffline);
      }
      this.#delivery.destroy();
      this.#setAdoptedProfileId(undefined);
      this.#interactionTracking?.destroy();
      this.#interactionTracking = undefined;
    } finally {
      try {
        super.destroy();
      } finally {
        releaseWebSingleton(this.#singletonOwner);
      }
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

  /** Adopt a validated handoff's profile state without sending its page. */
  async hydrateHandoffState(
    handoff: ExperiencesHandoff,
    { routeKey }: { readonly routeKey: string }
  ): Promise<void> {
    if (this.#destroyed) return;
    this.#requireRouteKey(routeKey);
    const parsed = parseExperiencesHandoff(handoff, this);
    const initialization = this.#getHandoffInitialization(handoff, parsed, routeKey);
    await this.#hydrateHandoffState(parsed, initialization);
  }

  /** Deduplicate accepted page emissions for the current route. Manual page() stays direct. */
  async trackCurrentPage({
    routeKey,
    buildPayload,
  }: CurrentPageOptions): Promise<EventEmissionResult> {
    if (this.#destroyed) return { accepted: false };
    this.#requireRouteKey(routeKey);
    this.#clearHandoffInitialization(routeKey);
    if (
      this.#acceptedCurrentPage?.routeKey === routeKey ||
      this.#inFlightCurrentPage?.routeKey === routeKey
    ) {
      return { accepted: false };
    }

    const inFlight = { routeKey };
    this.#inFlightCurrentPage = inFlight;
    try {
      const result = await this.page(
        buildPayload({ isInitialEmission: this.#acceptedCurrentPage === undefined }) ?? {}
      );
      if (result.accepted && !this.#destroyed && this.#inFlightCurrentPage === inFlight) {
        this.#acceptedCurrentPage = { routeKey };
      }
      return result;
    } finally {
      if (this.#inFlightCurrentPage === inFlight) this.#inFlightCurrentPage = undefined;
    }
  }

  /** Hydrate the current render and admit its matching prepared page once. */
  async hydrateAndTrackCurrentPage(
    handoff: ExperiencesHandoff,
    { routeKey, buildPayload }: HydrateAndTrackCurrentPageOptions
  ): Promise<EventEmissionResult> {
    if (this.#destroyed) return { accepted: false };
    this.#requireRouteKey(routeKey);
    const parsed = parseExperiencesHandoff(handoff, this);
    const initialization = this.#getHandoffInitialization(handoff, parsed, routeKey);
    if (initialization.delivery !== undefined) return await initialization.delivery;

    // Begin the current attempt by checking and publishing identity synchronously.
    // Once visible to other operations, navigation retains this continuation.
    // Fetches can join this boundary without waiting for hydration or replay HTTP.
    const identityReady = Promise.resolve().then(() =>
      initialization.isCurrent() ? this.#adoptHandoffIdentity(parsed) : undefined
    );
    initialization.identityReady = identityReady;
    const attempt = identityReady.then(async (targetId): Promise<EventEmissionResult> => {
      if (!initialization.isCurrent()) return { accepted: false };
      await this.#hydrateHandoffState(parsed, initialization);
      if (!initialization.isCurrent()) return { accepted: false };

      if (parsed.replay?.routeKey !== routeKey) {
        return await this.trackCurrentPage({
          routeKey,
          buildPayload: buildPayload ?? (() => ({})),
        });
      }

      const result = await this.sendPreparedExperienceEvents(
        parsed.replay.events,
        targetId,
        parsed.replay.locale
      );
      if (result.accepted && initialization.isCurrent()) {
        this.#acceptedCurrentPage = { routeKey };
      }
      return result;
    });
    const delivery = attempt.then(
      (result) => {
        if (!result.accepted && initialization.delivery === delivery) {
          initialization.delivery = undefined;
        }
        return result;
      },
      (error: unknown) => {
        if (initialization.delivery === delivery) initialization.delivery = undefined;
        throw error;
      }
    );
    initialization.delivery = delivery;
    return await delivery;
  }

  /** Queue one already-selected prepared target without waiting for HTTP delivery. */
  protected sendPreparedExperienceEvents(
    events: NonNullable<ExperiencesHandoff['replay']>['events'],
    profileId?: string,
    locale?: string
  ): Promise<EventEmissionResult> {
    if (this.#destroyed) return Promise.resolve({ accepted: false });
    const result = this.#delivery.sendPrepared(events, { profileId, locale });
    if (result.accepted && this.#store.profile === undefined) {
      this.#setAdoptedProfileId(profileId ?? this.#adoptedProfileId);
    }
    return Promise.resolve(result);
  }

  #requireRouteKey(routeKey: string): void {
    if (!routeKey.startsWith('/')) {
      throw new TypeError('Current page requires a pathname/search route key');
    }
  }

  #getHandoffInitialization(
    input: ExperiencesHandoff,
    parsed: ExperiencesHandoff,
    routeKey: string
  ): HandoffInitialization {
    const key = parsed.replay?.events.at(-1)?.messageId ?? input;
    const current = this.#currentInitialization;
    if (current?.routeKey === routeKey && current.key === key) return current;

    const generation = this.#generation;
    const initialization: HandoffInitialization = {
      key,
      routeKey,
      isCurrent: () =>
        !this.#destroyed &&
        this.#generation === generation &&
        this.#currentInitialization === initialization,
    };
    this.#currentInitialization = initialization;
    return initialization;
  }

  #clearHandoffInitialization(routeKey?: string): void {
    if (routeKey !== undefined && this.#currentInitialization?.routeKey === routeKey) return;
    this.#currentInitialization = undefined;
  }

  async #awaitCurrentHandoffIdentity(): Promise<void> {
    while (true) {
      const initialization = this.#currentInitialization;
      if (initialization === undefined || !initialization.isCurrent()) return;
      const pending = initialization.identityReady ?? initialization.hydration;
      if (pending === undefined) return;
      await pending;
      if (this.#currentInitialization === initialization) return;
    }
  }

  #hydrateHandoffState(
    handoff: ExperiencesHandoff,
    initialization: HandoffInitialization
  ): Promise<void> {
    if (handoff.replay !== undefined && handoff.replay.routeKey !== initialization.routeKey) {
      return Promise.resolve();
    }
    if (initialization.hydration !== undefined) return initialization.hydration;

    const profileRevision = this.#store.profileRevision;
    const hydration = Promise.resolve().then(() => {
      if (!initialization.isCurrent() || this.#store.profileRevision !== profileRevision) return;
      // Cacheable profileless state never changes browser profile continuity.
      if (
        handoff.cache.scope === 'private-request' &&
        handoff.state !== undefined &&
        Object.hasOwn(handoff.state, 'profile')
      ) {
        this.#store.profile = handoff.state.profile;
      }
    });
    initialization.hydration = hydration.catch((error: unknown) => {
      initialization.hydration = undefined;
      throw error;
    });
    return initialization.hydration;
  }

  #adoptHandoffIdentity(handoff: ExperiencesHandoff): string | undefined {
    const profileId = this.#store.profile?.id ?? this.#adoptedProfileId ?? handoff.profileId;
    this.#setAdoptedProfileId(profileId);
    return profileId;
  }

  #setAdoptedProfileId(profileId: string | undefined): void {
    if (this.#adoptedProfileId === profileId) return;
    this.#adoptedProfileId = profileId;
    this.#identityRevision += 1;
  }
}
