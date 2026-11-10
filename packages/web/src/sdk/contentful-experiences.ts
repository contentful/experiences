import {
  type AllowedEventType,
  AnalyticsDelivery,
  type AnalyticsFlushOptions,
  DEFAULT_ALLOWED_EVENT_TYPES,
  hasEventConsent,
  PersonalizationDelivery,
  resolveQueuePolicy,
  type FetchExperienceOptions,
} from '@contentful/experiences-runtime';
import { installCoreBridgeCapabilities } from '../bridge-support/capabilities.js';
import {
  batch,
  changes as changesSignal,
  blockedEvent as blockedEventSignal,
  consent as consentSignal,
  event as eventSignal,
  personalizationRequestState as personalizationRequestStateSignal,
  persistenceConsent as persistenceConsentSignal,
  profile as profileSignal,
} from '../signals/index.js';
import { normalizeExplicitLocale } from '../state/locale.js';

import { beaconHandler } from '../browser/beacon.js';
import { IdentityCookie } from '../browser/identity-cookie.js';
import { createVisibilityChangeListener } from '../browser/visibility.js';
import { PreviewSession } from '../preview/session.js';
import { acquireSingleton, releaseSingleton } from './singleton.js';
import LocalStore from '../storage/local-store.js';
import {
  createInteractionTracking,
  type InteractionTracking,
} from '../tracking/interaction-tracking.js';

import { flushPersonalizationOnDestroy } from '../events/destroy-drains.js';
import { HandoffRuntime } from '../handoff/runtime.js';
import { createRuntimeConfig } from './config.js';
import type { ExperiencesTrackingApi, Config } from './types.js';

/** Browser configuration, tracking and ordered SDK lifetime orchestration. */
export class ContentfulExperiences extends HandoffRuntime {
  readonly #singletonOwner: string;
  protected readonly personalizationQueue: PersonalizationDelivery;
  protected readonly analyticsQueue: AnalyticsDelivery;
  #cleanupVisibilityListener: (() => void) | undefined;
  protected readonly allowedEventTypes: AllowedEventType[];
  protected readonly onEventBlocked: Config['onEventBlocked'];
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
  readonly #handleOnline = (): void => {
    this.online = true;
  };
  readonly #handleOffline = (): void => {
    this.online = false;
  };

  constructor(config: Config) {
    const { allowedEventTypes, onEventBlocked, getAnonymousId, queuePolicy, defaults, cookie } =
      config;
    const locale = normalizeExplicitLocale(config.locale);
    // `super()` must come before anything that could touch `this`, and must not sit
    // inside a `try`: when a bundler lowers private fields and arrow-function fields,
    // it hoists `var _this = this` to the top of the constructor, which then runs
    // before `super()` and throws a ReferenceError. Next.js (SWC) does exactly this.
    super(createRuntimeConfig(config, locale));
    if (config.livePreview !== undefined && config.isPreview === false) {
      throw new TypeError('livePreview cannot be combined with isPreview: false');
    }
    this.previewMode =
      (config.livePreview !== undefined ? true : config.isPreview) ??
      (typeof window !== 'undefined' &&
        Boolean(
          new globalThis.URLSearchParams(window.location.search).get('preview_session_id')?.trim()
        ));
    // The lock is taken after the base class has validated its configuration, so a
    // failed construction never holds it. Construction is synchronous, so nothing
    // else can acquire it in between.
    const singletonOwner = acquireSingleton();
    this.#singletonOwner = singletonOwner;
    const resolvedQueuePolicy = resolveQueuePolicy(queuePolicy);
    let delivery: PersonalizationDelivery | undefined;
    let analytics: AnalyticsDelivery | undefined;
    try {
      this.allowedEventTypes = [...(allowedEventTypes ?? DEFAULT_ALLOWED_EVENT_TYPES)];
      this.onEventBlocked = onEventBlocked;
      this.initializeState(defaults, locale, getAnonymousId);
      this.eventBuilder.getConsent = () => consentSignal.value;
      this.identity = new IdentityCookie(LocalStore, cookie);
      this.personalizationQueue = delivery = new PersonalizationDelivery({
        api: this.api.personalization,
        getProfileId: () => this.requestIdentity(),
        getProfileRevision: () => this.stateRevision,
        getOnline: () => this.online,
        getLocale: () => this.locale,
        flushPolicy: resolvedQueuePolicy.flush,
        maxEvents: resolvedQueuePolicy.offlineMaxEvents,
        personalizationRequestState: personalizationRequestStateSignal,
        eventInterceptors: this.interceptors.event,
        publishEvent: this.publishEvent,
        admitEvent: (event) => this.admitEvent(event, true),
        applyOptimizationData: (data, isCurrent) =>
          this.applyOptimizationDataToSignals(data, isCurrent),
      });
      this.analyticsQueue = analytics = new AnalyticsDelivery({
        api: this.api.analytics,
        getOnline: () => this.online,
        getResetToken: () => (this.destroyed ? undefined : this.resetToken),
        flushPolicy: resolvedQueuePolicy.flush,
        eventInterceptors: this.interceptors.event,
        publishEvent: this.publishEvent,
        admitEvent: (event) => this.admitEvent(event, true),
      });
      installCoreBridgeCapabilities(this, (data) => {
        const token = this.resetToken;
        return this.applyOptimizationDataToSignals(data, () => this.isCurrent(token));
      });
      if (this.isPreview && (defaults?.persistenceConsent ?? defaults?.consent) === false) {
        LocalStore.clearProfileContinuity();
        this.identity.clear();
      }
      // Capture the incoming cookie before the profile-persistence effect can replace it.
      const incoming =
        !this.isPreview && persistenceConsentSignal.value === true
          ? this.identity.read()
          : undefined;
      this.initializeEffects();
      if (incoming !== undefined) this.reconcileCookie(incoming);
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
      if (config.livePreview) this.preview = new PreviewSession(this.config, config.livePreview);
    } catch (error) {
      this.preview?.destroy();
      this.#interactionTracking?.destroy();
      this.disposeEffects();
      this.#cleanupVisibilityListener?.();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.#handleOnline);
        window.removeEventListener('offline', this.#handleOffline);
      }
      try {
        if (delivery !== undefined) flushPersonalizationOnDestroy(delivery);
        if (analytics !== undefined) {
          this.destroyed = true;
          analytics.clearPeriodicFlushTimer();
          analytics.clearScheduledRetry();
        }
      } finally {
        try {
          super.destroy();
        } finally {
          releaseSingleton(this.#singletonOwner);
        }
      }
      throw error;
    }
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
    await this.analyticsQueue.flush(options);
    if (!isCurrent()) return;
    await this.personalizationQueue.flush({ force: options.force });
  }
  protected withdrawEventConsent(): void {
    this.resetToken = {};
    this.personalizationQueue.clearQueue();
    this.clearFlagViews();
    this.analyticsQueue.clearQueuedEvents();
    this.stateRevision += 1;
    // A discarded queued page must not leave its route looking admitted, or a later
    // permitted attempt for the same route would be answered from the cache and
    // never sent. This also forgets routes already sent, so one can be sent again
    // after a withdrawal and a new grant.
    // The token invalidates pending work while retaining the current route
    // owner for Optimization's page retry after a later consent grant.
    this.currentPage.reset();
    // Even allowlisted detectors must discard the previous lifecycle's intervals
    // and capture the new token. Sync explicitly: repeated denials do not change
    // the consent signal and therefore do not rerun its effect.
    this.#interactionTracking?.reset(true);
  }
  protected syncTrackingConsent(): void {
    this.#interactionTracking?.syncConsent();
  }

  /** Clear live browser state, or cancel this instance's unfinished drain after destroy. */
  reset(): void {
    if (this.destroyed) {
      this.personalizationQueue.reset();
      return;
    }
    batch(() => {
      this.resetToken = {};
      this.invalidateContent();
      this.preview?.clear();
      this.#interactionTracking?.reset();
      this.clearCurrentPage();
      this.setAdoptedProfileId(undefined);
      this.personalizationQueue.reset();
      this.clearFlagViews();
      this.analyticsQueue.clearQueuedEvents();
      this.stateRevision += 1;
      LocalStore.reset();
      this.identity.clear();
      profileSignal.value = undefined;
      changesSignal.value = undefined;
      eventSignal.value = undefined;
      blockedEventSignal.value = undefined;
      personalizationRequestStateSignal.value = { status: 'idle' };
      // Resume only after old work is invalidated and the new visitor token exists.
      this.#interactionTracking?.syncConsent();
    });
  }

  /** Stop browser-owned work before releasing SDK ownership. */
  override destroy(): void {
    if (this.destroyed) return;
    // Start the final forced flushes while the lifecycle token is still live,
    // then end the lifetime and cancel the queue timers. The
    // Analytics request captures the live token, so it is sent, and its late result no
    // longer applies once the token reads `undefined`.
    if (!this.isPreview) {
      void this.analyticsQueue.flush({ force: true }).catch((error: unknown) => {
        console.warn(
          '[@contentful/experiences] Failed to flush Analytics queue during destroy()',
          error
        );
      });
      flushPersonalizationOnDestroy(this.personalizationQueue);
    }
    this.destroyed = true;
    this.clearFlagViews(true);
    this.invalidateContent();
    this.disposeEffects();
    this.analyticsQueue.clearPeriodicFlushTimer();
    this.analyticsQueue.clearScheduledRetry();
    this.clearCurrentPage();
    try {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', this.#handleOnline);
        window.removeEventListener('offline', this.#handleOffline);
      }
      this.#cleanupVisibilityListener?.();
      this.#cleanupVisibilityListener = undefined;
      this.setAdoptedProfileId(undefined);
      this.#interactionTracking?.destroy();
      this.#interactionTracking = undefined;
    } finally {
      try {
        this.preview?.destroy();
      } finally {
        try {
          super.destroy();
        } finally {
          releaseSingleton(this.#singletonOwner);
        }
      }
    }
  }

  #ensureInteractionTracking(): InteractionTracking | undefined {
    if (this.destroyed) return undefined;
    return (this.#interactionTracking ??= createInteractionTracking(
      this,
      this.config.autoTrackEntryInteraction,
      {
        isAllowed: (method) =>
          !this.isPreview && hasEventConsent(method, this.getConsent(), this.allowedEventTypes),
        getResetToken: () => (this.destroyed ? undefined : this.resetToken),
      }
    ));
  }

  protected withTrackingSourceMap(options: FetchExperienceOptions): FetchExperienceOptions {
    return this.#ensureInteractionTracking()?.hasAutoTracking()
      ? {
          ...options,
          extensions: { ...options.extensions, sourceMap: options.extensions?.sourceMap ?? {} },
        }
      : options;
  }
}
