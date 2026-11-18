import { normalizeExplicitLocale } from '../browser/locale.js';
import { getPageProperties, getUserAgent } from '../browser/event-context.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from '../sdk-info.js';
import {
  AnalyticsDelivery,
  PersonalizationDelivery,
  DEFAULT_ALLOWED_EVENT_TYPES,
  type AllowedEventType,
  type ConsentInput,
  type Config as BaseConfig,
  resolveQueuePolicy,
  hasEventConsent,
  toConsentState,
  type PreviewSessionOptions,
  resolvePreviewSessionId,
} from '@contentful/experiences-runtime';

import {
  batch,
  consent as consentSignal,
  persistenceConsent as persistenceConsentSignal,
} from '../signals/index.js';

import {
  createInteractionTracking,
  type InteractionTracking,
} from '../tracking/interaction-tracking.js';

import { beaconHandler } from '../browser/beacon.js';
import { createVisibilityChangeListener } from '../browser/visibility.js';
import LocalStore from '../storage/local-store.js';
import { acquireSingleton, releaseSingleton } from '../browser/singleton.js';
import { PreviewSession } from '../preview/preview-session.js';

import type { Config, ExperiencesTrackingApi } from './types.js';
export type * from './types.js';

import { WebContentRuntime } from '../content/web-content-runtime.js';

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

/** Browser activation and request orchestration on one SDK receiver. */
export class ContentfulExperiences extends WebContentRuntime<
  Config & Pick<BaseConfig, 'eventBuilder'>
> {
  protected readonly personalizationQueue: PersonalizationDelivery;
  protected readonly analyticsQueue: AnalyticsDelivery;
  readonly #singletonOwner: string;
  readonly #isPreview: boolean;
  protected readonly previewOptions: PreviewSessionOptions | undefined;
  #preview: PreviewSession | undefined;
  #cleanupVisibilityListener: (() => void) | undefined;
  protected readonly allowedEventTypes: AllowedEventType[];
  protected readonly onEventBlocked: Config['onEventBlocked'];
  #interactionTracking: InteractionTracking | undefined;
  /** Automatic and per-element interaction controls, matching Optimization. */
  readonly tracking: ExperiencesTrackingApi = {
    enable: (type, options) => this.ensureInteractionTracking()?.tracking.enable(type, options),
    disable: (type) => this.ensureInteractionTracking()?.tracking.disable(type),
    enableElement: (type, element, options) =>
      this.ensureInteractionTracking()?.tracking.enableElement(type, element, options),
    disableElement: (type, element) =>
      this.ensureInteractionTracking()?.tracking.disableElement(type, element),
    clearElement: (type, element) =>
      this.ensureInteractionTracking()?.tracking.clearElement(type, element),
  };
  readonly #handleOnline = (): void => {
    this.online = true;
  };
  readonly #handleOffline = (): void => {
    this.online = false;
  };

  constructor(config: Config) {
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
    // Keep super outside try; field lowering otherwise risks touching this before super.
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
    const sessionId = resolvePreviewSessionId(
      new globalThis.URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
    );
    this.#isPreview = config.preview !== undefined && Boolean(sessionId);
    this.previewOptions =
      this.isPreview && config.preview && sessionId
        ? {
            sessionId,
            sessionHost: config.preview.sessionHost,
            resourceResolution: config.preview.resourceResolution,
          }
        : undefined;
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
      this.hasConfiguredIdentityProvider = getAnonymousId !== undefined;
      this.getAnonymousIdProvider =
        getAnonymousId ??
        (() => (persistenceConsentSignal.value === true ? LocalStore.anonymousId : undefined));
      this.initializeBrowserState(defaults, locale);
      this.eventBuilder.getConsent = () => consentSignal.value;
      this.initializeIdentity(cookie);
      this.personalizationQueue = delivery =
        this.initializePersonalizationQueue(resolvedQueuePolicy);
      this.analyticsQueue = analytics = this.initializeAnalyticsQueue(resolvedQueuePolicy);
      this.installCoreBridge();
      const incoming = this.captureIncomingCookie(defaults);
      this.#initializeEffects();
      if (incoming !== undefined) this.reconcileCookie(incoming);
      if (typeof window !== 'undefined') {
        window.addEventListener('online', this.#handleOnline);
        window.addEventListener('offline', this.#handleOffline);
      }
      // Last-chance delivery when the page is hidden or unloaded: end in-progress views
      // and hovers so their final events are queued, then force a final attempt on both
      // queues. Only Analytics uses the Beacon API; each API keeps its own transport.
      this.ensureInteractionTracking();
      this.#cleanupVisibilityListener = createVisibilityChangeListener(async () => {
        await this.#interactionTracking?.endActive();
        await this.flushQueues({ force: true, beacon: beaconHandler });
      });
      if (this.previewOptions) {
        this.#preview = new PreviewSession(this.config, this.previewOptions, this.previewState);
        this.#preview.start();
      }
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

  get isPreview(): boolean {
    return this.#isPreview;
  }

  /**
   * Sets consent for this browser. `true` or `false` sets event and persistence
   * consent together; an object updates either independently. Decisions are stored
   * in LocalStorage, always, so they survive reloads. Denying persistence removes
   * the stored profile but keeps it in memory for the current session.
   */
  consent(input: ConsentInput): void {
    if (this.destroyed) return;
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
        this.withdrawEventConsent(this.#interactionTracking);
      }
      try {
        if (next.persistence === false) {
          this.clearProfilePersistence();
        }
      } finally {
        // Cookie deletion can throw in a restricted document. Queues and old
        // measurements are already discarded; permitted detectors still restart.
        if (next.events === false) {
          this.#interactionTracking?.syncConsent();
          this.flags.retryActive();
        }
      }
    });
  }

  /** Clear live browser state, or cancel this instance's unfinished drain after destroy. */
  reset(): void {
    if (this.destroyed) {
      this.personalizationQueue.reset();
      return;
    }
    batch(() => {
      this.resetToken = {};
      this.contentLifetime += 1;
      this.content.clear();
      this.previewSnapshot = undefined;
      this.#preview?.clear();
      this.#interactionTracking?.reset();
      this.clearCurrentPage();
      this.setAdoptedProfileId(undefined);
      this.personalizationQueue.reset();
      this.flags.clearAttempts();
      this.analyticsQueue.clearQueuedEvents();
      this.resetVisitorState();
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
    this.flags.destroy();
    this.contentLifetime += 1;
    this.content.clear();
    this.#disposeEffects();
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
        this.#preview?.destroy();
      } finally {
        try {
          super.destroy();
        } finally {
          releaseSingleton(this.#singletonOwner);
        }
      }
    }
  }

  protected ensureInteractionTracking(): InteractionTracking | undefined {
    if (this.destroyed) return undefined;
    return (this.#interactionTracking ??= createInteractionTracking(
      this,
      this.config.autoTrackEntryInteraction,
      {
        isAllowed: (method) =>
          !this.isPreview &&
          hasEventConsent(method, this.getEventConsent(), this.allowedEventTypes),
        getResetToken: () => (this.destroyed ? undefined : this.resetToken),
      }
    ));
  }

  protected syncInteractionConsent(): void {
    this.#interactionTracking?.syncConsent();
  }

  #initializeEffects(): void {
    this.effects.push(this.installStateRevisionEffect());
    this.effects.push(this.installConsentEffect());
    this.effects.push(this.installPersistenceConsentEffect());
    this.effects.push(this.installProfilePersistenceEffect());
    this.effects.push(this.installConnectivityEffect());
    this.effects.push(this.flags.installRetryEffect());
  }

  #disposeEffects(): void {
    for (const dispose of this.effects.splice(0)) dispose();
  }
}
