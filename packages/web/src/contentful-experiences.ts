import {
  AnalyticsDelivery,
  ContentfulExperiences as RuntimeContentfulExperiences,
  PersonalizationDelivery,
  type AllowedEventType,
  type BlockedEvent,
  type ConsentInput,
  type ConsentState,
  type ContentfulExperiencesConfig,
  type EventBuilderConfig,
  type EventEmissionResult,
  type EventProfile,
  type ExperiencesHandoff,
  type PageViewBuilderArgs,
  type PersonalizationDeliveryState,
  type QueuePolicy,
  resolveQueuePolicy,
  parseExperiencesHandoff,
  parseExperiencesHandoffEnvelope,
  type RuntimeEventMethods,
  type RuntimeFetchExperienceOptions,
  type RuntimeFetchResolveOptions,
  hasEventConsent,
  hasEventTypeConsent,
  methodForEventType,
  toConsentState,
  validatePreparedEvents,
  withEventConsent,
} from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { AcceptedCurrentPageTracker } from './accepted-current-page-tracker.js';
import { getPageProperties, getUserAgent } from './browser-event-context.js';
import {
  createInteractionTracking,
  type InteractionTracking,
  type InteractionTrackingOptions,
} from './interaction-tracking.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';
import { shouldApplyHandoffProfile } from './handoff-continuity.js';
import {
  type CookieSnapshot,
  IdentityCookie,
  type IdentityCookieOptions,
} from './identity-cookie.js';
import { beaconHandler } from './lib/beacon.js';
import { createVisibilityChangeListener } from './lib/visibility.js';
import LocalStore from './storage/local-store.js';
import { acquireWebSingleton, releaseWebSingleton } from './web-singleton.js';

/** Optional browser context providers, useful for application-specific redaction. */
export type BrowserEventContextProviders = Pick<
  EventBuilderConfig,
  'getPageProperties' | 'getUserAgent'
>;

/**
 * Long-lived, browser-oriented SDK configuration.
 */
export type ExperiencesWebConfig = Omit<ContentfulExperiencesConfig, 'eventBuilder' | 'locale'> & {
  profile?: EventProfile;
  locale?: string;
  app?: EventBuilderConfig['app'];
  browserContext?: BrowserEventContextProviders;
  /** Event types emitted while event consent is not granted. Defaults to identify and page. */
  allowedEventTypes?: readonly AllowedEventType[];
  /** Called when consent drops an event. Blocked events are never replayed. */
  onEventBlocked?: (event: BlockedEvent) => void;
  /**
   * Queue policy: `flush` sets retry, backoff and circuit behavior for both queues, and
   * `offlineMaxEvents` caps the offline Personalization queue (default 100).
   */
  queuePolicy?: QueuePolicy;
  /**
   * Consent applied at startup. Configured values take precedence over a stored
   * decision, and `consent` is also the default for `persistenceConsent`.
   */
  defaults?: { consent?: boolean; persistenceConsent?: boolean };
  /**
   * How the identity cookie is written and deleted: domain, path, SameSite, Secure and
   * expiry (365 days by default). It is the cookie a server reads to recognise the
   * visitor, so a deletion always uses the scope it was written with.
   */
  cookie?: IdentityCookieOptions;
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

type HandoffEnvelope = ReturnType<typeof parseExperiencesHandoffEnvelope>;

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

/** A prepared batch after validation: what the delivery queue accepts. */
type ValidatedPreparedEvents = ReturnType<typeof validatePreparedEvents>;

/** Browser runtime with mutable application locale and live event context. */
export class ContentfulExperiences extends RuntimeContentfulExperiences {
  readonly #singletonOwner: string;
  #locale: string | undefined;
  readonly #store = new LocalStore();
  readonly #identity: IdentityCookie;
  readonly #delivery: PersonalizationDelivery;
  readonly #analytics: AnalyticsDelivery;
  #cleanupVisibilityListener: (() => void) | undefined;
  readonly #allowedEventTypes: readonly AllowedEventType[] | undefined;
  readonly #onEventBlocked: ExperiencesWebConfig['onEventBlocked'];
  #interactionTracking: InteractionTracking | undefined;
  #adoptedProfileId: string | undefined;
  #identityRevision = 0;
  #currentInitialization: HandoffInitialization | undefined;
  readonly #currentPage = new AcceptedCurrentPageTracker();
  #generation = 0;
  #destroyed = false;
  #online = globalThis.navigator?.onLine !== false;
  readonly #eventMethods: RuntimeEventMethods;
  readonly #handleOnline = (): void => {
    this.#online = true;
    this.#delivery.clearScheduledRetry();
    this.#analytics.clearScheduledRetry();
    void this.#delivery.flush({ force: true });
    void this.#analytics.flush({ force: true });
  };
  readonly #handleOffline = (): void => {
    this.#online = false;
  };
  readonly identify: WebEventMethods['identify'] = (...args) =>
    this.#eventMethods.identify(...args);
  readonly page: WebEventMethods['page'] = (...args) => this.#eventMethods.page(...args);
  readonly track: WebEventMethods['track'] = (...args) => this.#eventMethods.track(...args);
  readonly trackView: WebEventMethods['trackView'] = (...args) =>
    this.#destroyed ? Promise.resolve() : this.#eventMethods.trackView(...args);
  readonly trackClick: WebEventMethods['trackClick'] = (...args) =>
    this.#destroyed ? Promise.resolve() : this.#eventMethods.trackClick(...args);
  readonly trackHover: WebEventMethods['trackHover'] = (...args) =>
    this.#destroyed ? Promise.resolve() : this.#eventMethods.trackHover(...args);
  readonly trackFlagView: WebEventMethods['trackFlagView'] = (...args) =>
    this.#destroyed ? Promise.resolve() : this.#eventMethods.trackFlagView(...args);

  constructor(config: ExperiencesWebConfig) {
    const {
      app,
      browserContext,
      allowedEventTypes,
      onEventBlocked,
      queuePolicy,
      defaults,
      cookie,
      profile,
      ...clientConfig
    } = config;
    // `super()` must come before anything that could touch `this`, and must not sit
    // inside a `try`: when a bundler lowers private fields and arrow-function fields,
    // it hoists `var _this = this` to the top of the constructor, which then runs
    // before `super()` and throws a ReferenceError. Next.js (SWC) does exactly this.
    super({
      ...clientConfig,
      eventBuilder: {
        app,
        channel: 'web',
        library: DEFAULT_EVENT_CONTEXT_LIBRARY,
        getPageProperties: browserContext?.getPageProperties ?? getPageProperties,
        getUserAgent: browserContext?.getUserAgent ?? getUserAgent,
      },
    });
    // The lock is taken after the base class has validated its configuration, so a
    // failed construction never holds it. Construction is synchronous, so nothing
    // else can acquire it in between.
    const singletonOwner = acquireWebSingleton();
    this.#singletonOwner = singletonOwner;
    const resolvedQueuePolicy = resolveQueuePolicy(queuePolicy);
    let delivery: PersonalizationDelivery | undefined;
    let analytics: AnalyticsDelivery | undefined;
    try {
      this.#locale = clientConfig.locale;
      this.#allowedEventTypes = allowedEventTypes;
      this.#onEventBlocked = onEventBlocked;
      this.#store.applyConsentDefaults({
        events: defaults?.consent,
        persistence: defaults?.persistenceConsent,
      });
      this.#identity = new IdentityCookie(this.#store, cookie);
      if (profile !== undefined) this.#store.profile = profile;
      this.#delivery = delivery = new PersonalizationDelivery({
        api: this.optimizationApi.personalization,
        getProfileId: () => this.#requestIdentity(),
        getProfileRevision: () => this.#store.profileRevision,
        getOnline: () => this.#online,
        getLocale: () => this.locale,
        flushPolicy: resolvedQueuePolicy.flush,
        maxEvents: resolvedQueuePolicy.offlineMaxEvents,
        publishQueuedData: (data) => {
          if (this.#destroyed) return;
          this.#store.profile = data.profile;
          this.#setAdoptedProfileId(undefined);
          this.#syncIdentity();
        },
      });
      this.#analytics = analytics = new AnalyticsDelivery({
        api: this.optimizationApi.analytics,
        getOnline: () => this.#online,
        flushPolicy: resolvedQueuePolicy.flush,
      });
      this.#eventMethods = this.createEventMethods(
        {
          getProfile: () => {
            const id = this.#store.profile?.id ?? this.#requestIdentity();
            return this.#store.profile ?? (id === undefined ? undefined : { id });
          },
          setProfile: (nextProfile) => {
            if (this.#destroyed) return;
            this.#store.profile = nextProfile;
            this.#setAdoptedProfileId(undefined);
            this.#syncIdentity();
          },
          getProfileRevision: () => this.#store.profileRevision,
          getConsent: () => this.#store.consent,
          allowedEventTypes,
          onEventBlocked,
        },
        {
          personalization: (event) => this.#delivery.send(event),
          analytics: (event, currentProfile) => this.#analytics.send(event, currentProfile),
        }
      );
      // After the delivery exists, because adopting a different visitor's cookie resets.
      this.#initializeIdentity();
      if (typeof window !== 'undefined') {
        window.addEventListener('online', this.#handleOnline);
        window.addEventListener('offline', this.#handleOffline);
      }
      // Last-chance delivery when the page is hidden or unloaded: end in-progress views
      // and hovers so their final events are queued, then force a final attempt on both
      // queues. Only Analytics uses the Beacon API; each API keeps its own transport.
      this.#cleanupVisibilityListener = createVisibilityChangeListener(async () => {
        await this.#interactionTracking?.endActive();
        await Promise.all([
          this.#analytics.flush({ force: true, beacon: beaconHandler }),
          this.#delivery.flush({ force: true }),
        ]);
      });
    } catch (error) {
      this.#cleanupVisibilityListener?.();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.#handleOnline);
        window.removeEventListener('offline', this.#handleOffline);
      }
      try {
        delivery?.destroy();
        analytics?.destroy();
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

  /** Current consent decisions. Undecided values are treated as not granted. */
  get consentState(): Readonly<ConsentState> {
    return this.#store.consent;
  }

  /**
   * Sets consent for this browser. `true` or `false` sets event and persistence
   * consent together; an object updates either independently. Decisions are stored
   * in LocalStorage, always, so they survive reloads. Denying persistence removes
   * the stored profile but keeps it in memory for the current session.
   */
  consent(input: ConsentInput): void {
    const next = toConsentState(input);
    const hadPersistence = this.#store.consent.persistence;
    this.#store.updateConsent(next);
    if (next.persistence !== undefined && next.persistence !== hadPersistence) {
      this.#applyPersistenceChange(next.persistence);
    }
    // Events accepted into the offline queue while the visitor had consented must not
    // be sent after they withdraw. Only an explicit denial purges, as in the
    // Optimization SDK; a persistence-only change leaves the queue alone.
    if (next.events === false) {
      this.#delivery.clearQueue();
      this.#analytics.clearQueue();
      this.#store.invalidateInFlight();
      // A discarded queued page must not leave its route looking admitted, or a later
      // permitted attempt for the same route would be answered from the cache and
      // never sent. This also forgets routes already sent, so one can be sent again
      // after a withdrawal and a new grant.
      this.#currentInitialization = undefined;
      this.#currentPage.reset();
    }
    // Active views and hovers keep their own clocks, so the send-time gate alone would
    // report time measured before permission. Start or stop detectors to match.
    this.#interactionTracking?.syncConsent();
  }

  /** Latest ordinary or prepared Personalization HTTP state. */
  get personalizationDeliveryState(): PersonalizationDeliveryState {
    return this.#delivery.state;
  }

  /**
   * Send queued Analytics events and any queued Personalization batches now. The two
   * queues are independent, so both attempts start before either is awaited.
   */
  async flush(): Promise<void> {
    await Promise.all([this.#analytics.flush(), this.#delivery.flush()]);
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
    const gated = this.#gatePersonalizationEvents(options);
    const profileId = gated.personalization?.profileId ?? this.#requestIdentity();
    const plan = await super.fetchExperience(
      profileId === undefined
        ? gated
        : {
            ...gated,
            personalization: { ...gated.personalization, profileId },
          },
      resolveOptions
    );
    if (
      !this.#destroyed &&
      options.preview !== true &&
      this.#identityRevision === identityRevision
    ) {
      this.#store.updateProfileFromId(plan.personalization?.profileId, profileRevision);
      this.#syncIdentity();
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
    this.#currentPage.reset();
    this.#setAdoptedProfileId(undefined);
    this.#delivery.reset();
    this.#analytics.reset();
    this.#store.reset();
    this.#identity.clear();
  }

  /** Stop browser-owned work before releasing SDK ownership. */
  override destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#generation += 1;
    this.#currentInitialization = undefined;
    this.#currentPage.reset();
    try {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.#handleOnline);
        window.removeEventListener('offline', this.#handleOffline);
      }
      this.#cleanupVisibilityListener?.();
      this.#cleanupVisibilityListener = undefined;
      this.#delivery.destroy();
      this.#analytics.destroy();
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
    const tracking = createInteractionTracking(this, options, {
      isAllowed: (method) => hasEventConsent(method, this.#store.consent, this.#allowedEventTypes),
    });
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
    return await this.#currentPage.emitIfNeeded(routeKey, () =>
      this.page(buildPayload({ isInitialEmission: !this.#currentPage.hasAccepted() }) ?? {})
    );
  }

  /** Hydrate the current render and admit its matching prepared page once. */
  async hydrateAndTrackCurrentPage(
    handoff: ExperiencesHandoff,
    { routeKey, buildPayload }: HydrateAndTrackCurrentPageOptions
  ): Promise<EventEmissionResult> {
    if (this.#destroyed) return { accepted: false };
    this.#requireRouteKey(routeKey);
    const parsed = parseExperiencesHandoffEnvelope(handoff, this);
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

      if (parsed.replay?.routeKey === routeKey) {
        const result = await this.sendPreparedExperienceEvents(
          parsed.replay.events,
          targetId,
          parsed.replay.locale
        );
        if (result.accepted) {
          if (initialization.isCurrent()) this.#currentPage.markAccepted(routeKey);
          return result;
        }
      }

      if (!initialization.isCurrent()) return { accepted: false };
      return await this.trackCurrentPage({
        routeKey,
        buildPayload: buildPayload ?? (() => ({})),
      });
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
    events: readonly unknown[],
    profileId?: string,
    locale?: string
  ): Promise<EventEmissionResult> {
    if (this.#destroyed) return Promise.resolve({ accepted: false });
    const admitted = this.#admitPreparedEvents(events);
    if (admitted === undefined) return Promise.resolve({ accepted: false });
    const result = this.#delivery.sendPrepared(admitted, { profileId, locale });
    if (result.accepted && this.#store.profile === undefined) {
      this.#setAdoptedProfileId(profileId ?? this.#adoptedProfileId);
    }
    return Promise.resolve(result);
  }

  /** Whether an already-built event may be emitted; reports it to `onEventBlocked` otherwise. */
  #admitEvent(event: { type: string }): boolean {
    if (hasEventTypeConsent(event.type, this.#store.consent, this.#allowedEventTypes)) return true;
    try {
      const method = methodForEventType(event.type);
      if (method !== undefined) {
        this.#onEventBlocked?.({ reason: 'consent', method, args: [event] });
      }
    } catch {
      // A failing diagnostic callback must not break event delivery.
    }
    return false;
  }

  /**
   * Drops caller-built XDA events that consent does not admit. The profile id
   * still travels, since it is not an event.
   */
  #gatePersonalizationEvents(
    options: RuntimeFetchExperienceOptions
  ): RuntimeFetchExperienceOptions {
    const events = options.personalization?.events;
    if (events === undefined) return options;

    const admitted = events.filter((event) => this.#admitEvent(event));
    return { ...options, personalization: { ...options.personalization, events: admitted } };
  }

  /**
   * Gates and stamps a server-prepared batch. The server built these events, so they
   * carry its consent; the browser's own consent decides whether they are sent and is
   * what they are stamped with, as for direct calls.
   *
   * A prepared batch is identify and track events followed by one page, and is
   * admitted whole or not at all: dropping one event would leave a batch the
   * validator rejects. Returns `undefined` when the batch is invalid or any event is
   * not admitted, and otherwise the validated batch, which the queue takes as it is.
   * This is the one place the batch is validated.
   */
  #admitPreparedEvents(events: readonly unknown[]): ValidatedPreparedEvents | undefined {
    let valid: ValidatedPreparedEvents;
    try {
      valid = validatePreparedEvents(events);
    } catch {
      return undefined;
    }

    // Check every event, without stopping at the first blocked one, so each is reported.
    let admitted = true;
    for (const event of valid) {
      if (!this.#admitEvent(event)) admitted = false;
    }
    if (!admitted) return undefined;

    const isConsentGiven = this.#store.consent.events === true;
    return valid.map((event) => withEventConsent(event, isConsentGiven));
  }

  #requireRouteKey(routeKey: string): void {
    if (!routeKey.startsWith('/')) {
      throw new TypeError('Current page requires a pathname/search route key');
    }
  }

  #getHandoffInitialization(
    input: ExperiencesHandoff,
    parsed: HandoffEnvelope,
    routeKey: string
  ): HandoffInitialization {
    const finalEvent = parsed.replay?.events.at(-1);
    const key =
      typeof finalEvent === 'object' &&
      finalEvent !== null &&
      'messageId' in finalEvent &&
      typeof finalEvent.messageId === 'string'
        ? finalEvent.messageId
        : input;
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
    handoff: HandoffEnvelope,
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
      if (shouldApplyHandoffProfile(handoff)) {
        this.#store.profile = handoff.state?.profile;
        this.#syncIdentity();
      }
    });
    initialization.hydration = hydration.catch((error: unknown) => {
      initialization.hydration = undefined;
      throw error;
    });
    return initialization.hydration;
  }

  #adoptHandoffIdentity(handoff: HandoffEnvelope): string | undefined {
    const profileId = this.#requestIdentity() ?? handoff.profileId;
    this.#setAdoptedProfileId(profileId);
    this.#syncIdentity();
    return profileId;
  }

  /**
   * The id a request is sent under when no complete profile is held: an identity adopted
   * from a handoff, then, while persistence is granted, the id stored for continuity.
   * That is how a cookie a server wrote reaches the first request of a new page load.
   */
  #requestIdentity(): string | undefined {
    if (this.#store.profile?.id !== undefined) return this.#store.profile.id;
    if (this.#adoptedProfileId !== undefined) return this.#adoptedProfileId;
    return this.#store.consent.persistence === true ? this.#store.anonymousId : undefined;
  }

  /**
   * Keeps the identity cookie and stored id in step with what this runtime knows, but only
   * while persistence is granted; otherwise nothing is written. A complete profile wins,
   * then an identity adopted from a handoff, then the id already stored, so a visitor
   * keeps their continuity while the profile is absent and a profileless handoff cannot
   * erase it. Only callers that are themselves guarded against stale work reach this.
   */
  #syncIdentity(): void {
    if (this.#store.consent.persistence !== true) return;
    this.#identity.persist(
      this.#identity.resolve({
        profileId: this.#store.profile?.id,
        handoffId: this.#adoptedProfileId,
      })
    );
  }

  /**
   * Reconciles a captured cookie with the profile held. A cookie for a different visitor
   * than the profile held means that profile is not theirs, so it is reset before the
   * cookie's identity is written, which the cookie helper sequences.
   */
  #reconcileCookie(snapshot: CookieSnapshot): void {
    this.#identity.reconcile(snapshot, {
      currentProfileId: this.#store.profile?.id,
      reset: () => this.reset(),
    });
  }

  /**
   * Startup, in the Optimization SDK's constructor order: capture the cookie as it arrived,
   * synchronize the profile's identity, then reconcile the captured cookie. Reading it again
   * after the synchronization would see what the SDK itself just wrote, so a conflicting
   * profile would win over the visitor the cookie names.
   */
  #initializeIdentity(): void {
    if (this.#store.consent.persistence === false) {
      this.#identity.clear();
      return;
    }
    const incoming = this.#store.consent.persistence === true ? this.#identity.read() : undefined;
    this.#syncIdentity();
    if (incoming !== undefined) this.#reconcileCookie(incoming);
  }

  /**
   * Persistence was granted or withdrawn after startup. A grant adopts any existing
   * cookie and writes the identity already held in memory. A withdrawal removes the
   * durable identity but leaves the in-memory profile, and event consent is separate.
   */
  #applyPersistenceChange(granted: boolean): void {
    if (granted) {
      // Reconciling the cookie and synchronizing the effective identity are separate steps,
      // as in the Optimization SDK: finding a cookie does not mean the profile is persisted.
      this.#reconcileCookie(this.#identity.read());
      this.#syncIdentity();
      return;
    }
    this.#identity.clear();
  }

  #setAdoptedProfileId(profileId: string | undefined): void {
    if (this.#adoptedProfileId === profileId) return;
    this.#adoptedProfileId = profileId;
    this.#identityRevision += 1;
  }
}
