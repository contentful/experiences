import {
  AnalyticsDelivery,
  type AnalyticsFlushOptions,
  ContentfulExperiences as RuntimeContentfulExperiences,
  PersonalizationDelivery,
  InterceptorManager,
  DEFAULT_ALLOWED_EVENT_TYPES,
  type AllowedEventType,
  type BlockedEvent,
  type ConsentInput,
  type ConsentState,
  type ContentfulExperiencesConfig,
  type EventBuilderConfig,
  type EventEmissionResult,
  type ExperiencesHandoff,
  type OptimizationEventStreamEvent,
  type PageViewBuilderArgs,
  type QueuePolicy,
  resolveQueuePolicy,
  parseExperiencesHandoffEnvelope,
  type RuntimeEventMethods,
  type RuntimeFetchByDestinationNodeOptions,
  type RuntimeFetchByDestinationPathOptions,
  type RuntimeFetchExperienceOptions,
  type RuntimePersonalizationOptions,
  buildFetchPersonalization,
  type RuntimeFetchResolveOptions,
  hasEventConsent,
  hasEventTypeConsent,
  methodForEventType,
  toConsentState,
  validatePreparedEvents,
  withEventConsent,
  assertRuntimePreviewRequest,
  fetchRuntimePreviewSession,
  mergeRuntimePreviewResolveOptions,
  type RuntimeLivePreviewOptions,
} from '@contentful/experiences-runtime';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import {
  serializePersonalization,
  type DestinationRedirectResult,
  type PersonalizationOptions,
} from '@contentful/experiences-client';
import { signal, untracked } from '@preact/signals-core';
import { cloneDeepWith } from 'es-toolkit';
import { isEqual } from 'es-toolkit/predicate';
import {
  batch,
  blockedEvent as blockedEventSignal,
  consent as consentSignal,
  effect,
  event as eventSignal,
  experienceRequestState as experienceRequestStateSignal,
  locale as localeSignal,
  online as onlineSignal,
  persistenceConsent as persistenceConsentSignal,
  profile as profileSignal,
  preview as previewSignal,
  toObservable,
} from './signals/index.js';
import type { CoreStates, PreviewUpdate } from './states.js';
import { normalizeExplicitLocale } from './locale.js';
import {
  mergeExperienceState,
  type ExperienceState,
  type LifecycleInterceptors,
} from './interceptors.js';
import { installCoreBridgeCapabilities } from './bridge-support/capabilities.js';
import { resolveStatefulDefaults, type StatefulDefaults } from './stateful-defaults.js';

import { AcceptedCurrentPageTracker } from './accepted-current-page-tracker.js';
import { getPageProperties, getUserAgent } from './browser-event-context.js';
import {
  createInteractionTracking,
  type InteractionTracking,
  type AutoTrackEntryInteractionOptions,
  type EntryInteractionApi,
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
import { WebPreview } from './web-preview.js';
import { getExperienceSourceKey } from './experience-source-key.js';
import type { Subscription } from './signals/index.js';

/** Optional browser context providers, useful for application-specific redaction. */
export type BrowserEventContextProviders = Pick<
  EventBuilderConfig,
  'getPageProperties' | 'getUserAgent'
>;

/** Initial values for the stateful Web runtime. */
export type CoreConfigDefaults = StatefulDefaults;

/**
 * Long-lived, browser-oriented SDK configuration.
 */
export type ExperiencesWebConfig = Omit<ContentfulExperiencesConfig, 'eventBuilder' | 'locale'> & {
  /** Suppresses events for this instance. When omitted, detects preview_session_id in the browser URL. */
  isPreview?: boolean;
  /** Preview Session configuration with lazy implementation loading; establishes preview policy immediately. */
  livePreview?: RuntimeLivePreviewOptions;
  /** Automatic interaction defaults; each omitted flag defaults to true. */
  autoTrackEntryInteraction?: AutoTrackEntryInteractionOptions;
  locale?: string;
  app?: EventBuilderConfig['app'];
  browserContext?: BrowserEventContextProviders;
  /** Event types emitted while event consent is not granted. Defaults to identify and page. */
  allowedEventTypes?: readonly AllowedEventType[];
  /** Called when consent drops an event. Blocked events are never replayed. */
  onEventBlocked?: (event: BlockedEvent) => void;
  /** Anonymous identity provider; takes precedence over the active profile id. */
  getAnonymousId?: () => string | undefined;
  /**
   * Queue policy: `flush` sets retry, backoff and circuit behavior for both queues, and
   * `offlineMaxEvents` caps the offline Personalization queue (default 100).
   */
  queuePolicy?: QueuePolicy;
  /**
   * Consent applied at startup. Configured values take precedence over a stored
   * decision, and `consent` is also the default for `persistenceConsent`.
   */
  defaults?: CoreConfigDefaults;
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
  /** Optional framework lifetime before event admission. */
  readonly isCurrent?: () => boolean;
}

export interface HydrateAndTrackCurrentPageOptions extends Omit<
  CurrentPageOptions,
  'buildPayload'
> {
  readonly buildPayload?: CurrentPageOptions['buildPayload'];
  /** Framework operation lifetime; SDK lifetime and accepted queue work remain SDK-owned. */
  readonly isCurrent?: () => boolean;
}

type HandoffEnvelope = ReturnType<typeof parseExperiencesHandoffEnvelope>;

interface HandoffInitialization {
  readonly key: string | ExperiencesHandoff;
  readonly routeKey: string;
  readonly callers: Set<() => boolean>;
  readonly isCurrent: () => boolean;
  identityReady?: Promise<string | undefined>;
  hydration?: Promise<void>;
  delivery?: Promise<EventEmissionResult>;
}

type WebEventMethods = Pick<
  RuntimeEventMethods,
  'identify' | 'page' | 'track' | 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView'
>;

export type ExperiencesTrackingApi = EntryInteractionApi;

/**
 * Start the Personalization teardown drain and handle its completion.
 */
function flushPersonalizationOnDestroy(delivery: PersonalizationDelivery): void {
  void delivery.flushOnDestroy().catch((error: unknown) => {
    console.warn(
      '[@contentful/experiences] Failed to flush Personalization queue during destroy()',
      error
    );
  });
}

/** The profile id XDA returned. A Destination redirect carries no personalization. */
function returnedProfileId(
  result: PortableRenderPlan | DestinationRedirectResult
): string | undefined {
  return 'personalization' in result ? result.personalization?.profileId : undefined;
}

/** A prepared batch after validation: what the delivery queue accepts. */
type ValidatedPreparedEvents = ReturnType<typeof validatePreparedEvents>;
const unguardedHandoffCaller = () => true;

type BuiltFetchOptions<T> = Omit<T, 'personalization'> & {
  personalization?: PersonalizationOptions;
};

function clonePlan(plan: PortableRenderPlan): PortableRenderPlan {
  return cloneDeepWith(plan, (value) => {
    if (!(value instanceof Error)) return undefined;
    // Error causes can contain caller-owned functions and other opaque values.
    return Object.defineProperties(
      Object.setPrototypeOf(new Error(), Object.getPrototypeOf(value)),
      {
        ...Object.getOwnPropertyDescriptors(value),
        stack: { value: value.stack, writable: true, configurable: true },
      }
    );
  });
}

/** Browser runtime with mutable application locale and live event context. */
export class ContentfulExperiences extends RuntimeContentfulExperiences<
  ExperiencesWebConfig & Pick<ContentfulExperiencesConfig, 'eventBuilder'>
> {
  readonly #singletonOwner: string;
  readonly #isPreview: boolean;
  #preview: WebPreview | undefined;
  readonly #pendingContent = new Map<
    RuntimeFetchResolveOptions['config'],
    Map<string, Promise<PortableRenderPlan>>
  >();
  #contentLifetime = 0;
  #profileRevision = 0;
  readonly #effects: (() => void)[] = [];
  readonly #identity: IdentityCookie;
  protected readonly experienceQueue: PersonalizationDelivery;
  protected readonly insightsQueue: AnalyticsDelivery;
  #cleanupVisibilityListener: (() => void) | undefined;
  protected readonly allowedEventTypes: AllowedEventType[];
  protected readonly onEventBlocked: ExperiencesWebConfig['onEventBlocked'];
  readonly #getAnonymousId: () => string | undefined;
  #interactionTracking: InteractionTracking | undefined;
  /** Automatic and per-element interaction controls, matching Optimization. */
  readonly tracking: ExperiencesTrackingApi = {
    enable: (type, options) => this.#ensureInteractionTracking()?.tracking.enable(type, options),
    disable: (type) => this.#ensureInteractionTracking()?.tracking.disable(type),
    enableElement: (type, element, options) =>
      this.#ensureInteractionTracking()?.tracking.enableElement(type, element, options),
    disableElement: (type, element) =>
      this.#ensureInteractionTracking()?.tracking.disableElement(type, element),
    clearElement: (type, element) =>
      this.#ensureInteractionTracking()?.tracking.clearElement(type, element),
  };
  readonly #adoptedProfileId = signal<string | undefined>();
  #identityRevision = 0;
  #currentInitialization: HandoffInitialization | undefined;
  readonly #consumedHandoffs = new Set<string>();
  readonly #currentPage = new AcceptedCurrentPageTracker();
  #generation = 0;
  #destroyed = false;
  /**
   * Lifecycle token the Analytics queue reads. Reset and
   * consent withdrawal replace it; destroy() makes it read `undefined`.
   */
  #resetToken: object = {};
  readonly #eventMethods: RuntimeEventMethods;
  readonly #handleOnline = (): void => {
    this.online = true;
  };
  readonly #handleOffline = (): void => {
    this.online = false;
  };
  readonly #publishEvent = (event: OptimizationEventStreamEvent): void => {
    try {
      eventSignal.value = event;
    } catch (error) {
      console.warn('Event stream subscriber failed', error);
    }
  };
  readonly identify: WebEventMethods['identify'] = (...args) =>
    this.#destroyed ? Promise.resolve({ accepted: false }) : this.#eventMethods.identify(...args);
  readonly page: WebEventMethods['page'] = (...args) =>
    this.#destroyed ? Promise.resolve({ accepted: false }) : this.#eventMethods.page(...args);
  readonly track: WebEventMethods['track'] = (...args) =>
    this.#destroyed ? Promise.resolve({ accepted: false }) : this.#eventMethods.track(...args);
  readonly trackView: WebEventMethods['trackView'] = (...args) =>
    this.#destroyed ? Promise.resolve({ accepted: false }) : this.#eventMethods.trackView(...args);
  readonly trackClick: WebEventMethods['trackClick'] = (...args) =>
    this.#destroyed ? Promise.resolve({ accepted: false }) : this.#eventMethods.trackClick(...args);
  readonly trackHover: WebEventMethods['trackHover'] = (...args) =>
    this.#destroyed ? Promise.resolve({ accepted: false }) : this.#eventMethods.trackHover(...args);
  readonly trackFlagView: WebEventMethods['trackFlagView'] = (...args) =>
    this.#destroyed
      ? Promise.resolve({ accepted: false })
      : this.#eventMethods.trackFlagView(...args);

  /** Observable state shared with application subscriptions and internal effects. */
  readonly states: CoreStates = {
    preview: toObservable(previewSignal, (value) => value),
    blockedEventStream: toObservable(blockedEventSignal),
    consent: toObservable(consentSignal),
    persistenceConsent: toObservable(persistenceConsentSignal),
    eventStream: toObservable(eventSignal, (event) => event),
    locale: toObservable(localeSignal),
    experienceRequestState: toObservable(experienceRequestStateSignal),
    profile: toObservable(profileSignal),
  };

  /** Transform emitted events and incoming state in registration order. */
  readonly interceptors: LifecycleInterceptors = {
    event: new InterceptorManager(),
    state: new InterceptorManager(),
  };

  constructor(config: ExperiencesWebConfig) {
    const {
      app,
      browserContext,
      allowedEventTypes,
      onEventBlocked,
      getAnonymousId,
      queuePolicy,
      defaults,
      cookie,
    } = config;
    const locale = normalizeExplicitLocale(config.locale);
    // `super()` must come before anything that could touch `this`, and must not sit
    // inside a `try`: when a bundler lowers private fields and arrow-function fields,
    // it hoists `var _this = this` to the top of the constructor, which then runs
    // before `super()` and throws a ReferenceError. Next.js (SWC) does exactly this.
    super({
      ...config,
      locale,
      eventBuilder: {
        app,
        channel: 'web',
        library: DEFAULT_EVENT_CONTEXT_LIBRARY,
        getPageProperties: browserContext?.getPageProperties ?? getPageProperties,
        getUserAgent: browserContext?.getUserAgent ?? getUserAgent,
      },
    });
    if (config.livePreview !== undefined && config.isPreview === false) {
      throw new TypeError('livePreview cannot be combined with isPreview: false');
    }
    this.#isPreview =
      (config.livePreview !== undefined ? true : config.isPreview) ??
      (typeof window !== 'undefined' &&
        Boolean(
          new globalThis.URLSearchParams(window.location.search).get('preview_session_id')?.trim()
        ));
    // The lock is taken after the base class has validated its configuration, so a
    // failed construction never holds it. Construction is synchronous, so nothing
    // else can acquire it in between.
    const singletonOwner = acquireWebSingleton();
    this.#singletonOwner = singletonOwner;
    const resolvedQueuePolicy = resolveQueuePolicy(queuePolicy);
    let delivery: PersonalizationDelivery | undefined;
    let analytics: AnalyticsDelivery | undefined;
    try {
      this.allowedEventTypes = [...(allowedEventTypes ?? DEFAULT_ALLOWED_EVENT_TYPES)];
      this.onEventBlocked = onEventBlocked;
      this.#getAnonymousId =
        getAnonymousId ??
        (() => (persistenceConsentSignal.value === true ? LocalStore.anonymousId : undefined));
      const { defaults: resolvedDefaults } = resolveStatefulDefaults(defaults, {
        consent: LocalStore.consent,
        persistenceConsent: LocalStore.persistenceConsent,
        profile: () => LocalStore.profile,
      });
      batch(() => {
        consentSignal.value = resolvedDefaults.consent;
        persistenceConsentSignal.value = resolvedDefaults.persistenceConsent;
        profileSignal.value = resolvedDefaults.profile;
        localeSignal.value = locale;
        onlineSignal.value = globalThis.navigator?.onLine !== false;
        eventSignal.value = undefined;
        blockedEventSignal.value = undefined;
        experienceRequestStateSignal.value = { status: 'idle' };
        previewSignal.value = undefined;
      });
      this.eventBuilder.getConsent = () => consentSignal.value;
      this.#identity = new IdentityCookie(LocalStore, cookie);
      this.experienceQueue = delivery = new PersonalizationDelivery({
        api: this.api.experience,
        getProfileId: () => this.#requestIdentity(),
        getProfileRevision: () => this.#profileRevision,
        getOnline: () => this.online,
        getLocale: () => this.locale,
        flushPolicy: resolvedQueuePolicy.flush,
        maxEvents: resolvedQueuePolicy.offlineMaxEvents,
        experienceRequestState: experienceRequestStateSignal,
        eventInterceptors: this.interceptors.event,
        publishEvent: this.#publishEvent,
        admitEvent: (event) => this.#admitEvent(event, true),
        applyOptimizationData: (data, isCurrent) =>
          this.#applyOptimizationDataToSignals(data, isCurrent),
      });
      this.insightsQueue = analytics = new AnalyticsDelivery({
        api: this.api.insights,
        getOnline: () => this.online,
        getResetToken: () => (this.#destroyed ? undefined : this.#resetToken),
        flushPolicy: resolvedQueuePolicy.flush,
        eventInterceptors: this.interceptors.event,
        publishEvent: this.#publishEvent,
        admitEvent: (event) => this.#admitEvent(event, true),
      });
      this.#eventMethods = this.createEventMethods(
        {
          getProfile: () => {
            const id = this.#requestIdentity();
            return profileSignal.value ?? (id === undefined ? undefined : { id });
          },
          getConsent: () => this.#getConsent(),
          getIsPreview: () => this.isPreview,
          allowedEventTypes: this.allowedEventTypes,
          reportBlockedEvent: (event) => this.#reportBlockedEvent(event),
        },
        {
          personalization: (event) => this.experienceQueue.send(event),
          analytics: (event, currentProfile) => this.insightsQueue.send(event, currentProfile),
        }
      );
      installCoreBridgeCapabilities(this, (data) => {
        const generation = this.#generation;
        return this.#applyOptimizationDataToSignals(
          data,
          () => !this.#destroyed && this.#generation === generation
        );
      });
      if (this.isPreview && (defaults?.persistenceConsent ?? defaults?.consent) === false) {
        LocalStore.clearProfileContinuity();
        this.#identity.clear();
      }
      // Capture the incoming cookie before the profile-persistence effect can replace it.
      const incoming =
        !this.isPreview && persistenceConsentSignal.value === true
          ? this.#identity.read()
          : undefined;
      this.#initializeEffects();
      if (incoming !== undefined) this.#reconcileCookie(incoming);
      if (typeof window !== 'undefined') {
        window.addEventListener('online', this.#handleOnline);
        window.addEventListener('offline', this.#handleOffline);
      }
      // Last-chance delivery when the page is hidden or unloaded: end in-progress views
      // and hovers so their final events are queued, then force a final attempt on both
      // queues. Only Analytics uses the Beacon API; each API keeps its own transport.
      this.#ensureInteractionTracking();
      this.#cleanupVisibilityListener = createVisibilityChangeListener(async () => {
        await this.#interactionTracking?.endActive();
        await this.flushQueues({ force: true, beacon: beaconHandler });
      });
      if (config.livePreview) this.#preview = new WebPreview(this.config, config.livePreview);
    } catch (error) {
      this.#preview?.destroy();
      this.#interactionTracking?.destroy();
      this.#disposeEffects();
      this.#cleanupVisibilityListener?.();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.#handleOnline);
        window.removeEventListener('offline', this.#handleOffline);
      }
      try {
        if (delivery !== undefined) flushPersonalizationOnDestroy(delivery);
        if (analytics !== undefined) {
          this.#destroyed = true;
          analytics.clearPeriodicFlushTimer();
          analytics.clearScheduledRetry();
        }
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

  get isPreview(): boolean {
    return this.#isPreview;
  }

  override get locale(): string | undefined {
    return localeSignal.value;
  }

  protected get online(): boolean {
    return onlineSignal.value ?? false;
  }

  protected set online(isOnline: boolean) {
    onlineSignal.value = isOnline;
  }

  /** Whether event consent or the configured allowlist admits this method/type. */
  hasConsent(name: string): boolean {
    return hasEventConsent(name, this.#getConsent(), this.allowedEventTypes);
  }

  /**
   * Sets consent for this browser. `true` or `false` sets event and persistence
   * consent together; an object updates either independently. Decisions are stored
   * in LocalStorage, always, so they survive reloads. Denying persistence removes
   * the stored profile but keeps it in memory for the current session.
   */
  consent(input: ConsentInput): void {
    if (this.#destroyed) return;
    const next = toConsentState(input);
    batch(() => {
      // A subscriber can destroy the SDK and dispose effects still waiting for the
      // batch to end. Persist explicit decisions before any such notification.
      if (next.events !== undefined) {
        consentSignal.value = next.events;
        LocalStore.consent = next.events;
      }
      if (next.persistence !== undefined) {
        persistenceConsentSignal.value = next.persistence;
        LocalStore.persistenceConsent = next.persistence;
      }
      // Complete withdrawal before consent or request-state subscribers can reenter
      // the SDK (including destroy()) or throw. clearQueue() also publishes state.
      // A persistence-only change leaves the queues and measurements alone.
      if (next.events === false) {
        this.#generation += 1;
        this.experienceQueue.clearQueue();
        this.#resetToken = {};
        this.insightsQueue.clearQueuedEvents();
        this.#profileRevision += 1;
        // A discarded queued page must not leave its route looking admitted, or a later
        // permitted attempt for the same route would be answered from the cache and
        // never sent. This also forgets routes already sent, so one can be sent again
        // after a withdrawal and a new grant.
        // Generation invalidates pending work while retaining the current route
        // owner for Optimization's page retry after a later consent grant.
        this.#currentPage.reset();
        // Even allowlisted detectors must discard the previous lifecycle's intervals
        // and capture the new token. Sync explicitly: repeated denials do not change
        // the consent signal and therefore do not rerun its effect.
        this.#interactionTracking?.reset(true);
      }
      try {
        if (next.persistence === false) {
          LocalStore.clearProfileContinuity();
          this.#identity.clear();
        } else if (this.isPreview && next.persistence === true) {
          // Preview startup never mutates continuity. An explicit visitor command still can.
          this.#reconcileCookie(this.#identity.read());
          LocalStore.profile = profileSignal.peek();
          this.#identity.persist(
            this.#identity.resolve({
              profileId: profileSignal.peek()?.id,
              handoffId: this.#adoptedProfileId.peek(),
            })
          );
        }
      } finally {
        // Cookie deletion can throw in a restricted document. Queues and old
        // measurements are already discarded; permitted detectors still restart.
        if (next.events === false) this.#interactionTracking?.syncConsent();
      }
    });
  }

  /** Send queued Analytics events, then Personalization batches, as in Stateful Core. */
  async flush(): Promise<void> {
    await this.flushQueues();
  }

  protected async flushQueues(
    options: AnalyticsFlushOptions = {},
    isCurrent: () => boolean = () => true
  ): Promise<void> {
    if (this.isPreview || !isCurrent()) return;
    await this.insightsQueue.flush(options);
    if (!isCurrent()) return;
    await this.experienceQueue.flush({ force: options.force });
  }

  /** Changes the default locale used by subsequent events and fetches. */
  setLocale(locale: string | undefined): string | undefined {
    if (this.#destroyed) return undefined;
    const resolvedLocale = normalizeExplicitLocale(locale);
    localeSignal.value = resolvedLocale;
    if (this.#destroyed) return undefined;
    this.api.experience.setLocale(resolvedLocale);
    return resolvedLocale;
  }

  /** Deliver resolved preview updates; the caller retains its existing view state. */
  subscribeToPreview(
    experienceId: string,
    resolveOptions: RuntimeFetchResolveOptions,
    listener: (update: PreviewUpdate) => void
  ): Subscription {
    if (this.#destroyed) return { unsubscribe() {} };
    const resolve = mergeRuntimePreviewResolveOptions(this.config, resolveOptions);
    let active = true;
    let previous: ExperiencePayload | undefined;
    let previousError: Error | undefined;
    const subscription = this.states.preview.subscribe((state) => {
      if (!active || this.#destroyed) return;
      if (!state || (state.experienceId && state.experienceId !== experienceId)) {
        previous = undefined;
        previousError = undefined;
        return;
      }
      if (state.error && state.error !== previousError) listener({ error: state.error });
      previousError = state.error;
      const data = state.data;
      if (!data) {
        previous = undefined;
        return;
      }
      if (data === previous || state.experienceId !== experienceId) return;
      previous = data;
      const lifetime = this.#contentLifetime;
      const source = this.#preview?.revision;
      const current = () =>
        active &&
        !this.#destroyed &&
        lifetime === this.#contentLifetime &&
        source === this.#preview?.revision &&
        previewSignal.peek()?.data === data;
      const key = getExperienceSourceKey(
        { request: { experienceId }, revision: [lifetime, state.revision] },
        resolve,
        source ?? 0,
        'preview'
      );
      // Unlike resolved snapshots, the preview client emits raw payloads.
      // Resolve streamed content with the caller's registry before publishing a plan.
      void this.#shareContent(key, resolve, async () =>
        this.resolveExperience(data, resolveOptions)
      ).then(
        (plan) => {
          if (!current()) return;
          listener({ data: plan, error: previewSignal.peek()?.error });
        },
        (error: unknown) => {
          if (current())
            listener({ error: error instanceof Error ? error : new Error(String(error)) });
        }
      );
    });
    return {
      unsubscribe: () => {
        active = false;
        subscription.unsubscribe();
      },
    };
  }

  async replaceLivePreview(options: RuntimeLivePreviewOptions): Promise<void> {
    if (this.#destroyed) throw new Error('Experiences SDK has been destroyed');
    if (!this.isPreview) throw new Error('Entering preview requires a new Web SDK instance');
    this.#contentLifetime++;
    this.#pendingContent.clear();
    if (this.#preview) await this.#preview.replace(options);
    else {
      this.#preview = new WebPreview(this.config, options);
      await this.#preview.ready();
    }
  }

  #shareContent(
    key: string | undefined,
    resolve: RuntimeFetchResolveOptions,
    load: () => Promise<PortableRenderPlan>
  ): Promise<PortableRenderPlan> {
    if (key === undefined) return load();
    let pending = this.#pendingContent.get(resolve.config);
    if (!pending) this.#pendingContent.set(resolve.config, (pending = new Map()));
    const existing = pending.get(key);
    if (existing) return existing.then(clonePlan);
    const promise = load().finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
      if (!pending.size && this.#pendingContent.get(resolve.config) === pending)
        this.#pendingContent.delete(resolve.config);
    });
    pending.set(key, promise);
    return promise.then(clonePlan);
  }

  override async fetchExperience(
    options: RuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan> {
    const { source, assertCurrent } = this.#createFreshnessGuard();
    assertCurrent();
    if (this.#preview !== undefined) {
      const preview = await this.#fetchPreview(options, resolveOptions, assertCurrent);
      assertCurrent();
      if (preview !== undefined) return preview;
    }
    return this.#fetchPersonalized(options, {
      preview: options.preview === true,
      prepare: (current) => this.#withTrackingSourceMap(current),
      send: (final) => super.fetchExperience(final, resolveOptions),
      share: (load, final, revision) => {
        const resolve = mergeRuntimePreviewResolveOptions(this.config, resolveOptions);
        const key =
          options.personalization?.events !== undefined
            ? undefined
            : getExperienceSourceKey(
                {
                  request: {
                    ...final,
                    locale: options.locale ?? this.locale,
                    preview: options.preview ?? false,
                  },
                  revision,
                },
                resolve,
                source ?? 0,
                'delivery'
              );
        return this.#shareContent(key, resolve, load);
      },
    });
  }

  override fetchByDestinationNode(
    options: RuntimeFetchByDestinationNodeOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.#fetchPersonalized(options, {
      send: (final) => super.fetchByDestinationNode(final, resolveOptions),
    });
  }

  override fetchByDestinationPath(
    options: RuntimeFetchByDestinationPathOptions,
    resolveOptions: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan | DestinationRedirectResult> {
    return this.#fetchPersonalized(options, {
      send: (final) => super.fetchByDestinationPath(final, resolveOptions),
    });
  }

  async #fetchPersonalized<
    TOptions extends { personalization?: RuntimePersonalizationOptions },
    TResult extends PortableRenderPlan | DestinationRedirectResult,
  >(
    options: TOptions,
    request: {
      preview?: boolean;
      prepare?: (options: TOptions) => TOptions;
      send: (options: BuiltFetchOptions<TOptions>) => Promise<TResult>;
      share?: (
        load: () => Promise<TResult>,
        options: BuiltFetchOptions<TOptions>,
        revision: number[]
      ) => Promise<TResult>;
    }
  ): Promise<TResult> {
    const { generation, assertCurrent } = this.#createFreshnessGuard();
    assertCurrent();
    const identityReady = this.#awaitCurrentHandoffIdentity();
    if (identityReady !== undefined) {
      await identityReady;
      assertCurrent();
    }
    const profileRevision = this.#profileRevision;
    const identityRevision = this.#identityRevision;
    const adoptProfileId = this.#createProfileAdopter({ preview: request.preview });
    const prepared = await this.#prepareContentRequest(
      request.prepare?.(options) ?? options,
      assertCurrent
    );
    assertCurrent();
    for (const event of prepared.personalization?.events ?? []) {
      this.#publishEvent(event);
      assertCurrent();
    }
    const final = this.#withRequestIdentity(prepared);
    assertCurrent();
    const load = async () => {
      const result = await request.send(final);
      assertCurrent();
      if (
        !this.isPreview &&
        (this.#profileRevision !== profileRevision || this.#identityRevision !== identityRevision)
      )
        throw new Error('Experiences fetch identity was superseded');
      const adopted = await adoptProfileId(returnedProfileId(result));
      assertCurrent();
      if (
        !this.isPreview &&
        (this.#profileRevision !== profileRevision + (adopted === undefined ? 0 : 1) ||
          this.#identityRevision !== identityRevision)
      )
        throw new Error('Experiences fetch identity was superseded');
      return result;
    };
    return request.share
      ? request.share(load, final, [generation, profileRevision, identityRevision])
      : load();
  }

  #createFreshnessGuard() {
    const generation = this.isPreview ? this.#contentLifetime : this.#generation;
    const source = this.#preview?.revision;
    return {
      generation,
      source,
      assertCurrent: () => {
        if (this.#destroyed) throw new Error('Experiences SDK has been destroyed');
        if (
          generation !== (this.isPreview ? this.#contentLifetime : this.#generation) ||
          source !== this.#preview?.revision
        )
          throw new Error('Experiences fetch was superseded');
      },
    };
  }

  async #fetchPreview(
    options: RuntimeFetchExperienceOptions,
    resolveOptions: RuntimeFetchResolveOptions,
    assertCurrent: () => void
  ): Promise<PortableRenderPlan | undefined> {
    if (this.#preview?.experienceId !== options.experienceId) return undefined;
    const binding = await this.#preview.ready();
    assertCurrent();
    assertRuntimePreviewRequest(options);
    this.#gatePersonalizationEvents(options);
    assertCurrent();
    const resolve = mergeRuntimePreviewResolveOptions(this.config, resolveOptions);
    const key =
      options.personalization?.events !== undefined
        ? undefined
        : getExperienceSourceKey(
            { request: { experienceId: options.experienceId }, revision: [this.#contentLifetime] },
            resolve,
            this.#preview?.revision ?? 0,
            'snapshot'
          );
    return this.#shareContent(key, resolve, async () => {
      const plan = await fetchRuntimePreviewSession(binding, this.config, resolve);
      // Snapshot HTTP cannot be aborted through the package API; discard obsolete results.
      assertCurrent();
      return plan;
    });
  }

  #withTrackingSourceMap(options: RuntimeFetchExperienceOptions): RuntimeFetchExperienceOptions {
    return this.#ensureInteractionTracking()?.hasAutoTracking()
      ? {
          ...options,
          extensions: { ...options.extensions, sourceMap: options.extensions?.sourceMap ?? {} },
        }
      : options;
  }

  #withRequestIdentity<T extends { personalization?: PersonalizationOptions }>(options: T): T {
    const profileId = this.isPreview
      ? undefined
      : (options.personalization?.profileId ?? this.#requestIdentity());
    return profileId === undefined
      ? options
      : { ...options, personalization: { ...options.personalization, profileId } };
  }

  async #prepareContentRequest<T extends { personalization?: RuntimePersonalizationOptions }>(
    options: T,
    assertCurrent: () => void
  ): Promise<BuiltFetchOptions<T>> {
    const gated = this.#gatePersonalizationEvents(options);
    assertCurrent();
    const personalization = gated.personalization;
    const transformed =
      personalization?.events === undefined
        ? personalization
        : {
            ...personalization,
            events: await Promise.all(
              personalization.events.map((event) => this.interceptors.event.run(event))
            ),
          };
    assertCurrent();
    // Validate the whole XDA batch before final-type consent callbacks run.
    let valid = transformed === undefined ? undefined : serializePersonalization(transformed);
    if (valid?.events !== undefined) {
      valid = {
        ...valid,
        events: valid.events.filter((event) => {
          const admitted = this.#admitEvent(event, true);
          assertCurrent();
          return admitted;
        }),
      };
    }
    assertCurrent();
    return { ...gated, personalization: valid };
  }

  #createProfileAdopter(
    options: Pick<RuntimeFetchExperienceOptions, 'preview'>
  ): (profileId: string | undefined) => Promise<ExperienceState | undefined> {
    const generation = this.#generation;
    const profileRevision = this.#profileRevision;
    const identityRevision = this.#identityRevision;
    return async (profileId) => {
      const canAdopt = () =>
        !this.#destroyed &&
        this.#generation === generation &&
        this.#identityRevision === identityRevision &&
        this.#profileRevision === profileRevision;
      if (
        this.isPreview ||
        options.preview === true ||
        profileId === undefined ||
        !canAdopt() ||
        profileSignal.value?.id === profileId
      )
        return undefined;
      const next = await this.interceptors.state.run(
        { profile: { id: profileId } },
        mergeExperienceState
      );
      if (!canAdopt() || isEqual(profileSignal.value, next.profile)) return undefined;
      profileSignal.value = next.profile;
      return next;
    };
  }

  /** Clear live browser state, or cancel this instance's unfinished drain after destroy. */
  reset(): void {
    if (this.#destroyed) {
      this.experienceQueue.reset();
      return;
    }
    batch(() => {
      this.#generation += 1;
      this.#contentLifetime += 1;
      this.#pendingContent.clear();
      this.#preview?.clear();
      this.#interactionTracking?.reset();
      this.#currentInitialization = undefined;
      this.#consumedHandoffs.clear();
      this.#currentPage.reset();
      this.#setAdoptedProfileId(undefined);
      this.experienceQueue.reset();
      this.#resetToken = {};
      this.insightsQueue.clearQueuedEvents();
      this.#profileRevision += 1;
      LocalStore.reset();
      this.#identity.clear();
      profileSignal.value = undefined;
      eventSignal.value = undefined;
      blockedEventSignal.value = undefined;
      experienceRequestStateSignal.value = { status: 'idle' };
      // Resume only after old work is invalidated and the new visitor token exists.
      this.#interactionTracking?.syncConsent();
    });
  }

  /** Stop browser-owned work before releasing SDK ownership. */
  override destroy(): void {
    if (this.#destroyed) return;
    // Start the final forced flushes while the lifecycle token is still live,
    // then end the lifetime and cancel the queue timers. The
    // Analytics request captures the live token, so it is sent, and its late result no
    // longer applies once the token reads `undefined`.
    if (!this.isPreview) {
      void this.insightsQueue.flush({ force: true }).catch((error: unknown) => {
        console.warn(
          '[@contentful/experiences] Failed to flush Analytics queue during destroy()',
          error
        );
      });
      flushPersonalizationOnDestroy(this.experienceQueue);
    }
    this.#destroyed = true;
    this.#contentLifetime += 1;
    this.#pendingContent.clear();
    this.#disposeEffects();
    this.insightsQueue.clearPeriodicFlushTimer();
    this.insightsQueue.clearScheduledRetry();
    this.#generation += 1;
    this.#currentInitialization = undefined;
    this.#consumedHandoffs.clear();
    this.#currentPage.reset();
    try {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.#handleOnline);
        window.removeEventListener('offline', this.#handleOffline);
      }
      this.#cleanupVisibilityListener?.();
      this.#cleanupVisibilityListener = undefined;
      this.#setAdoptedProfileId(undefined);
      this.#interactionTracking?.destroy();
      this.#interactionTracking = undefined;
    } finally {
      try {
        this.#preview?.destroy();
      } finally {
        try {
          super.destroy();
        } finally {
          releaseWebSingleton(this.#singletonOwner);
        }
      }
    }
  }

  #ensureInteractionTracking(): InteractionTracking | undefined {
    if (this.#destroyed) return undefined;
    return (this.#interactionTracking ??= createInteractionTracking(
      this,
      this.config.autoTrackEntryInteraction,
      {
        isAllowed: (method) =>
          !this.isPreview && hasEventConsent(method, this.#getConsent(), this.allowedEventTypes),
        getResetToken: () => (this.#destroyed ? undefined : this.#resetToken),
      }
    ));
  }

  /** Deduplicate accepted page emissions for the current route. Manual page() stays direct. */
  async trackCurrentPage({
    routeKey,
    buildPayload,
    isCurrent,
  }: CurrentPageOptions): Promise<EventEmissionResult> {
    if (this.#destroyed) return { accepted: false };
    if (isCurrent?.() === false) return { accepted: false };
    if (this.isPreview) return this.#skipPreviewEvent('trackCurrentPage', [routeKey]);
    this.#requireRouteKey(routeKey);
    this.#clearHandoffInitialization(routeKey);
    return await this.#currentPage.emitIfNeeded(routeKey, () => {
      const payload = buildPayload({ isInitialEmission: !this.#currentPage.hasAccepted() }) ?? {};
      if (isCurrent?.() === false) return Promise.resolve({ accepted: false });
      if (isCurrent === undefined || !this.hasConsent('page')) return this.page(payload);
      return this.experienceQueue.send(this.eventBuilder.buildPageView(payload), isCurrent);
    });
  }

  /** Consume one complete handoff and admit its matching evaluated events once. */
  async hydrateAndTrackCurrentPage(
    handoff: ExperiencesHandoff,
    {
      routeKey,
      buildPayload,
      isCurrent = unguardedHandoffCaller,
    }: HydrateAndTrackCurrentPageOptions
  ): Promise<EventEmissionResult> {
    if (this.#destroyed) return { accepted: false };
    if (!isCurrent()) return { accepted: false };
    if (this.isPreview) return this.#skipPreviewEvent('hydrateAndTrackCurrentPage', [routeKey]);
    this.#requireRouteKey(routeKey);
    const parsed = parseExperiencesHandoffEnvelope(handoff, this);
    const hasPage =
      parsed.replay?.events.some(
        (event) =>
          typeof event === 'object' && event !== null && 'type' in event && event.type === 'page'
      ) === true;
    const generation = this.#generation;
    const initialization = this.#getHandoffInitialization(handoff, parsed, routeKey, isCurrent);
    if (initialization.delivery !== undefined) return await initialization.delivery;
    const consumed =
      typeof initialization.key === 'string' && this.#consumedHandoffs.has(initialization.key);
    if (consumed && (!hasPage || !initialization.isCurrent())) return { accepted: false };

    // Begin the current attempt by checking and publishing identity synchronously.
    // Once visible to other operations, navigation retains this continuation.
    // This is local identity readiness, not XPAPI commit completion. Current fetches
    // do not await replay HTTP; provisional-ID profile-only lookups can therefore fail.
    // See Runtime README's XDA preflight and profile finalization contract.
    const identityReady = Promise.resolve().then(() =>
      !consumed && initialization.isCurrent()
        ? this.#adoptHandoffIdentity(parsed, initialization.isCurrent)
        : undefined
    );
    initialization.identityReady = identityReady;
    const attempt = identityReady.then(async (targetId): Promise<EventEmissionResult> => {
      if (!initialization.isCurrent()) return { accepted: false };
      if (!consumed) await this.#hydrateHandoffState(parsed, initialization);
      if (!initialization.isCurrent()) return { accepted: false };

      if (!consumed && parsed.replay?.routeKey === routeKey) {
        const result = await this.sendPreparedExperienceEvents(
          parsed.replay.events,
          targetId,
          parsed.replay.locale,
          initialization
        );
        if (result.accepted) {
          if (
            hasPage &&
            !this.#destroyed &&
            this.#generation === generation &&
            this.#currentInitialization === initialization
          )
            this.#currentPage.markAccepted(routeKey);
          return result;
        }
        // A refused identify/track batch has no page intent to fall back to.
        if (!hasPage && (parsed.replay.events.length !== 0 || buildPayload === undefined))
          return result;
      }

      if (
        !initialization.isCurrent() ||
        (buildPayload === undefined && (!hasPage || parsed.replay?.routeKey !== routeKey))
      )
        return { accepted: false };
      return await this.trackCurrentPage({
        routeKey,
        buildPayload: buildPayload ?? (() => ({})),
        isCurrent: initialization.isCurrent,
      });
    });
    const delivery = attempt.then(
      (result) => {
        if (
          result.accepted &&
          !this.#destroyed &&
          this.#generation === generation &&
          typeof initialization.key === 'string' &&
          parsed.replay?.routeKey === routeKey
        )
          this.#consumedHandoffs.add(initialization.key);
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
    locale?: string,
    initialization?: HandoffInitialization
  ): Promise<EventEmissionResult> {
    if (this.#destroyed) return Promise.resolve({ accepted: false });
    if (this.isPreview)
      return Promise.resolve(this.#skipPreviewEvent('sendPreparedExperienceEvents', [events]));
    const generation = this.#generation;
    const isCurrent = (): boolean =>
      !this.#destroyed && this.#generation === generation && initialization?.isCurrent() !== false;
    const handoffKey = typeof initialization?.key === 'string' ? initialization.key : undefined;
    let valid: ValidatedPreparedEvents;
    try {
      valid = validatePreparedEvents(events);
    } catch {
      return Promise.resolve({ accepted: false });
    }
    // Reserve the supplied aggregate before callbacks can reenter. A consent
    // refusal is terminal; capacity refusal below leaves unadmitted work eligible.
    if (handoffKey !== undefined) this.#consumedHandoffs.add(handoffKey);
    let allowed = true;
    for (const event of valid) {
      if (!this.#admitEvent(event, true)) allowed = false;
      if (!isCurrent()) return Promise.resolve({ accepted: false });
    }
    if (!allowed) return Promise.resolve({ accepted: false });
    const admitted = valid.map((event) => withEventConsent(event, consentSignal.value === true));
    const result = this.experienceQueue.sendPrepared(admitted, { profileId, locale });
    if (!result.accepted && isCurrent() && handoffKey !== undefined)
      this.#consumedHandoffs.delete(handoffKey);
    if (result.accepted && isCurrent() && profileSignal.value === undefined)
      this.#setAdoptedProfileId(profileId ?? this.#adoptedProfileId.value);
    return Promise.resolve(result);
  }

  /** Whether an already-built event may be emitted; reports it to `onEventBlocked` otherwise. */
  #admitEvent(event: { type: string }, reportUnmapped = false): boolean {
    if (
      !this.isPreview &&
      hasEventTypeConsent(event.type, this.#getConsent(), this.allowedEventTypes)
    )
      return true;
    const method = methodForEventType(event.type);
    if (method !== undefined || reportUnmapped) {
      this.#reportBlockedEvent({
        reason: this.isPreview ? 'preview' : 'consent',
        method: method ?? event.type,
        args: [event],
      });
    }
    return false;
  }

  /**
   * Drops event intent that consent does not admit before building. The profile id
   * still travels, since it is not an event.
   */
  #gatePersonalizationEvents<T extends { personalization?: RuntimePersonalizationOptions }>(
    options: T
  ): BuiltFetchOptions<T> {
    if (this.isPreview) {
      for (const event of options.personalization?.events ?? []) this.#admitEvent(event, true);
      return { ...options, personalization: undefined };
    }
    const events = options.personalization?.events;
    if (events === undefined) return options as BuiltFetchOptions<T>;

    const admitted = events.filter((event) => this.#admitEvent(event));
    const personalization = buildFetchPersonalization(
      { ...options.personalization, events: admitted },
      this.eventBuilder
    )!;
    return {
      ...options,
      personalization: {
        ...personalization,
        events: personalization.events?.map((event) =>
          withEventConsent(event, consentSignal.value === true)
        ),
      },
    };
  }

  #requireRouteKey(routeKey: string): void {
    if (!routeKey.startsWith('/')) {
      throw new TypeError('Current page requires a pathname/search route key');
    }
  }

  #getHandoffInitialization(
    input: ExperiencesHandoff,
    parsed: HandoffEnvelope,
    routeKey: string,
    callerIsCurrent: () => boolean
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
    if (current?.routeKey === routeKey && current.key === key && current.isCurrent()) {
      current.callers.add(callerIsCurrent);
      return current;
    }

    const generation = this.#generation;
    const initialization: HandoffInitialization = {
      key,
      routeKey,
      callers: new Set([callerIsCurrent]),
      isCurrent: () =>
        !this.#destroyed &&
        this.#generation === generation &&
        this.#currentInitialization === initialization &&
        [...initialization.callers].some((caller) => caller()),
    };
    // Remember admitted or consent-dropped replay without reviving it or cancelling a
    // newer initialization. A new visitor action carries fresh message IDs.
    if (
      typeof key === 'string' &&
      this.#consumedHandoffs.has(key) &&
      (current?.key !== key || current.routeKey !== routeKey)
    )
      return initialization;
    this.#currentInitialization = initialization;
    return initialization;
  }

  #clearHandoffInitialization(routeKey?: string): void {
    if (routeKey !== undefined && this.#currentInitialization?.routeKey === routeKey) return;
    this.#currentInitialization = undefined;
  }

  #awaitCurrentHandoffIdentity(): Promise<void> | undefined {
    const initialization = this.#currentInitialization;
    if (initialization === undefined || !initialization.isCurrent()) return undefined;
    const pending = initialization.identityReady ?? initialization.hydration;
    return pending?.then(() =>
      this.#currentInitialization !== initialization
        ? this.#awaitCurrentHandoffIdentity()
        : undefined
    );
  }

  #hydrateHandoffState(
    handoff: HandoffEnvelope,
    initialization: HandoffInitialization
  ): Promise<void> {
    if (handoff.replay !== undefined && handoff.replay.routeKey !== initialization.routeKey) {
      return Promise.resolve();
    }
    if (initialization.hydration !== undefined) return initialization.hydration;

    const profileRevision = this.#profileRevision;
    const hydration = Promise.resolve().then(async () => {
      if (!initialization.isCurrent() || this.#profileRevision !== profileRevision) return;
      // Profileless/cacheable hydration declares success without changing continuity.
      await this.#applyOptimizationDataToSignals(
        shouldApplyHandoffProfile(handoff) ? { profile: handoff.state?.profile } : {},
        initialization.isCurrent,
        () => shouldApplyHandoffProfile(handoff)
      );
    });
    initialization.hydration = hydration.catch((error: unknown) => {
      initialization.hydration = undefined;
      throw error;
    });
    return initialization.hydration.finally(() => {
      if (!initialization.isCurrent()) initialization.hydration = undefined;
    });
  }

  #adoptHandoffIdentity(handoff: HandoffEnvelope, isCurrent: () => boolean): string | undefined {
    const profileId = profileSignal.value?.id ?? this.#getAnonymousId() ?? handoff.profileId;
    if (!isCurrent()) return undefined;
    this.#setAdoptedProfileId(profileId);
    return profileId;
  }

  /**
   * Resolve request identity with Optimization's provider-first precedence, then the
   * active profile and an identity adopted from a server handoff.
   */
  #requestIdentity(): string | undefined {
    return this.#getAnonymousId() ?? profileSignal.value?.id ?? this.#adoptedProfileId.value;
  }

  /**
   * Reconciles a captured cookie with the profile held. A cookie for a different visitor
   * than the profile held means that profile is not theirs, so it is reset before the
   * cookie's identity is written, which the cookie helper sequences.
   */
  #reconcileCookie(snapshot: CookieSnapshot): void {
    this.#identity.reconcile(snapshot, {
      currentProfileId: profileSignal.value?.id,
      reset: () => this.reset(),
    });
  }

  #getConsent(): ConsentState {
    return { events: consentSignal.value, persistence: persistenceConsentSignal.value };
  }

  async #applyOptimizationDataToSignals(
    data: ExperienceState,
    isCurrent: () => boolean,
    canApplyProfile: () => boolean = () => true
  ): Promise<void> {
    if (this.#destroyed) return;
    const profileRevision = this.#profileRevision;
    const next = mergeExperienceState(
      data,
      await this.interceptors.state.run(data, mergeExperienceState)
    );
    if (!isCurrent()) return;
    batch(() => {
      if (
        canApplyProfile() &&
        this.#profileRevision === profileRevision &&
        Object.hasOwn(next, 'profile')
      ) {
        if (!isEqual(profileSignal.value, next.profile)) profileSignal.value = next.profile;
        this.#setAdoptedProfileId(undefined);
      }
      experienceRequestStateSignal.value = { status: 'success' };
    });
  }

  #skipPreviewEvent(method: string, args: readonly unknown[]): EventEmissionResult {
    this.#reportBlockedEvent({ reason: 'preview', method, args });
    return { accepted: false, reason: 'preview' };
  }

  #reportBlockedEvent(event: BlockedEvent): void {
    if (this.#destroyed) return;
    const generation = this.#generation;
    try {
      this.onEventBlocked?.(event);
    } catch (error) {
      console.warn(`onEventBlocked callback failed for method "${event.method}"`, error);
    }
    if (!this.#destroyed && this.#generation === generation) blockedEventSignal.value = event;
  }

  #initializeEffects(): void {
    let previousProfile = profileSignal.peek();
    this.#effects.push(
      effect(() => {
        const profile = profileSignal.value;
        if (profile !== previousProfile) {
          previousProfile = profile;
          this.#profileRevision += 1;
        }
      })
    );
    this.#effects.push(
      effect(() => {
        const consent = consentSignal.value;
        // consent() persists explicit decisions before subscribers run. Construction
        // still persists defaults, and an undecided value clears any stored decision.
        if (consent === undefined || LocalStore.consent !== consent) LocalStore.consent = consent;
        untracked(() => this.#interactionTracking?.syncConsent());
      })
    );
    this.#effects.push(
      effect(() => {
        const persistenceConsent = persistenceConsentSignal.value;
        LocalStore.persistenceConsent = persistenceConsent;
        if (this.isPreview) return;
        if (persistenceConsent === true) {
          untracked(() => this.#reconcileCookie(this.#identity.read()));
        }
        if (persistenceConsent === false) {
          this.#identity.clear();
          LocalStore.clearProfileContinuity();
        }
      })
    );
    this.#effects.push(
      effect(() => {
        const profile = profileSignal.value;
        const persistenceConsent = persistenceConsentSignal.value;
        const handoffId = this.#adoptedProfileId.value;
        if (this.isPreview || persistenceConsent !== true) return;
        LocalStore.profile = profile;
        this.#identity.persist(this.#identity.resolve({ profileId: profile?.id, handoffId }));
      })
    );
    this.#effects.push(
      effect(() => {
        if (!onlineSignal.value) return;
        this.experienceQueue.clearScheduledRetry();
        this.insightsQueue.clearScheduledRetry();
        void this.flushQueues(
          { force: true },
          () => !this.#destroyed && onlineSignal.peek() === true
        );
      })
    );
  }

  #disposeEffects(): void {
    for (const dispose of this.#effects.splice(0)) dispose();
  }

  #setAdoptedProfileId(profileId: string | undefined): void {
    if (this.#adoptedProfileId.value === profileId) return;
    this.#identityRevision += 1;
    this.#adoptedProfileId.value = profileId;
  }
}
