import { effect, online as onlineSignal } from '../signals/index.js';
import {
  buildFetchPersonalization,
  type PersonalizationOptions,
} from '@contentful/experiences-runtime';
import { serializePersonalization } from '@contentful/experiences-client';
import type { BuiltFetchOptions, PendingFetchOptions } from './fetch-personalization-types.js';
import {
  AnalyticsDelivery,
  PersonalizationDelivery,
  hasEventConsent,
  hasEventTypeConsent,
  methodForEventType,
  warnMissingEventProfile,
  emitPersonalizationEvent,
  emitAnalyticsEvent,
  type AnalyticsEventOwner,
  withEventConsent,
  type validatePreparedEvents,
  type Config as RuntimeConfig,
  type AnalyticsFlushOptions,
  type AllowedEventType,
  type BlockedEvent,
  type ConsentState,
  type EventEmissionResult,
  type EventMethods,
  type resolveQueuePolicy,
} from '@contentful/experiences-runtime';
import {
  profile as profileSignal,
  consent as consentSignal,
  persistenceConsent as persistenceConsentSignal,
  blockedEvent as blockedEventSignal,
  personalizationRequestState as personalizationRequestStateSignal,
} from '../signals/index.js';
import { WebStateRuntime } from '../sdk/web-state-runtime.js';
import type { Config } from '../sdk/types.js';
import { publishEvent } from './publication.js';

type ResolvedQueuePolicy = ReturnType<typeof resolveQueuePolicy>;

/** Event policy and queues operate on the same receiver as browser state. */
export abstract class WebEventRuntime<
  TConfig extends RuntimeConfig,
> extends WebStateRuntime<TConfig> {
  protected abstract readonly personalizationQueue: PersonalizationDelivery;
  protected abstract readonly analyticsQueue: AnalyticsDelivery;
  protected abstract readonly allowedEventTypes: readonly AllowedEventType[];
  protected abstract readonly onEventBlocked: Config['onEventBlocked'];
  readonly #eventOwner: AnalyticsEventOwner = {
    isActive: () => !this.destroyed,
    getIsPreview: () => this.isPreview,
    getConsent: () => this.getEventConsent(),
    getAllowedEventTypes: () => this.allowedEventTypes,
    reportBlockedEvent: (event) => this.reportBlockedEvent(event),
    getProfile: () => profileSignal.value,
    onMissingProfile: warnMissingEventProfile,
  };

  readonly identify: EventMethods['identify'] = (args) =>
    emitPersonalizationEvent(
      this.#eventOwner,
      'identify',
      args,
      (input) => this.eventBuilder.buildIdentify(input),
      (event) => this.personalizationQueue.send(event)
    );

  readonly page: EventMethods['page'] = (args = {}) =>
    emitPersonalizationEvent(
      this.#eventOwner,
      'page',
      args,
      (input) => this.eventBuilder.buildPageView(input),
      (event) => this.personalizationQueue.send(event)
    );

  readonly track: EventMethods['track'] = (args) =>
    emitPersonalizationEvent(
      this.#eventOwner,
      'track',
      args,
      (input) => this.eventBuilder.buildTrack(input),
      (event) => this.personalizationQueue.send(event)
    );

  readonly trackView: EventMethods['trackView'] = (args) =>
    emitAnalyticsEvent(
      this.#eventOwner,
      'trackView',
      args,
      (input) => this.eventBuilder.buildView(input),
      (event, profile) => this.analyticsQueue.send(event, profile)
    );

  readonly trackClick: EventMethods['trackClick'] = (args) =>
    emitAnalyticsEvent(
      this.#eventOwner,
      'trackClick',
      args,
      (input) => this.eventBuilder.buildClick(input),
      (event, profile) => this.analyticsQueue.send(event, profile)
    );

  readonly trackHover: EventMethods['trackHover'] = (args) =>
    emitAnalyticsEvent(
      this.#eventOwner,
      'trackHover',
      args,
      (input) => this.eventBuilder.buildHover(input),
      (event, profile) => this.analyticsQueue.send(event, profile)
    );

  readonly trackFlagView: EventMethods['trackFlagView'] = (args) =>
    emitAnalyticsEvent(
      this.#eventOwner,
      'trackFlagView',
      args,
      (input) => this.eventBuilder.buildFlagView(input),
      (event, profile) => this.analyticsQueue.send(event, profile)
    );

  /** Whether event consent or the configured allowlist admits this method/type. */
  hasConsent(name: string): boolean {
    return hasEventConsent(name, this.getEventConsent(), this.allowedEventTypes);
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

  /** Whether an already-built event may be emitted; reports it to `onEventBlocked` otherwise. */
  protected admitEvent(event: { type: string }, reportUnmapped = false): boolean {
    if (
      !this.isPreview &&
      hasEventTypeConsent(event.type, this.getEventConsent(), this.allowedEventTypes)
    )
      return true;
    const method = methodForEventType(event.type);
    if (method !== undefined || reportUnmapped) {
      this.reportBlockedEvent({
        reason: this.isPreview ? 'preview' : 'consent',
        method: method ?? event.type,
        args: [event],
      });
    }
    return false;
  }

  /** Consent applies to the whole evaluated batch; report every live refusal in order. */
  protected admitPreparedEvents(
    events: ReturnType<typeof validatePreparedEvents>,
    isCurrent: () => boolean
  ): boolean {
    let allowed = true;
    for (const event of events) {
      if (!this.admitEvent(event, true)) allowed = false;
      if (!isCurrent()) return false;
    }
    return allowed;
  }

  /** Queue evaluated bodies unchanged except for the browser owner's current consent. */
  protected queuePreparedEvents(
    events: ReturnType<typeof validatePreparedEvents>,
    profileId: string | undefined,
    locale: string | undefined,
    isCurrent: () => boolean
  ): EventEmissionResult {
    const admitted = events.map((event) => withEventConsent(event, consentSignal.value === true));
    const result = this.personalizationQueue.sendPrepared(admitted, { profileId, locale });
    if (result.accepted && isCurrent() && profileSignal.value === undefined)
      this.setAdoptedProfileId(profileId ?? this.adoptedProfileId.value);
    return result;
  }

  protected getEventConsent(): ConsentState {
    return { events: consentSignal.value, persistence: persistenceConsentSignal.value };
  }

  protected skipPreviewEvent(method: string, args: readonly unknown[]): EventEmissionResult {
    this.reportBlockedEvent({ reason: 'preview', method, args });
    return { accepted: false, reason: 'preview' };
  }

  protected reportBlockedEvent(event: BlockedEvent): void {
    if (this.destroyed) return;
    const token = this.resetToken;
    try {
      this.onEventBlocked?.(event);
    } catch (error) {
      console.warn(`onEventBlocked callback failed for method "${event.method}"`, error);
    }
    if (this.isCurrent(token)) blockedEventSignal.value = event;
  }
  protected initializePersonalizationQueue(
    resolvedQueuePolicy: ResolvedQueuePolicy
  ): PersonalizationDelivery {
    return new PersonalizationDelivery({
      api: this.api.personalization,
      getProfileId: () => this.requestIdentity(),
      getProfileRevision: () => this.stateRevision,
      getOnline: () => this.online,
      getLocale: () => this.locale,
      flushPolicy: resolvedQueuePolicy.flush,
      maxEvents: resolvedQueuePolicy.offlineMaxEvents,
      personalizationRequestState: personalizationRequestStateSignal,
      eventInterceptors: this.interceptors.event,
      publishEvent: publishEvent,
      admitEvent: (event) => this.admitEvent(event, true),
      applyOptimizationData: (data, isCurrent) =>
        this.applyOptimizationDataToSignals(data, isCurrent),
    });
  }

  protected initializeAnalyticsQueue(resolvedQueuePolicy: ResolvedQueuePolicy): AnalyticsDelivery {
    return new AnalyticsDelivery({
      api: this.api.analytics,
      getOnline: () => this.online,
      getResetToken: () => (this.destroyed ? undefined : this.resetToken),
      flushPolicy: resolvedQueuePolicy.flush,
      eventInterceptors: this.interceptors.event,
      publishEvent: publishEvent,
      admitEvent: (event) => this.admitEvent(event, true),
    });
  }

  protected async prepareContentRequest<T extends { personalization?: PersonalizationOptions }>(
    options: T,
    assertCurrent: () => void
  ): Promise<BuiltFetchOptions<T>> {
    const gated = this.gatePersonalizationEvents(options);
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
          const admitted = this.admitEvent(event, true);
          assertCurrent();
          return admitted;
        }),
      };
    }
    assertCurrent();
    return { ...gated, personalization: valid } as BuiltFetchOptions<T>;
  }

  /**
   * Drops event intent that consent does not admit before building. The profile id
   * still travels, since it is not an event.
   */
  protected gatePersonalizationEvents<T extends { personalization?: PersonalizationOptions }>(
    options: T
  ): PendingFetchOptions<T> {
    if (this.isPreview) {
      for (const event of options.personalization?.events ?? []) this.admitEvent(event, true);
      return { ...options, personalization: undefined };
    }
    const events = options.personalization?.events;
    if (events === undefined) {
      return {
        ...options,
        personalization: buildFetchPersonalization(options.personalization, this.eventBuilder),
      };
    }

    const admitted = events.filter((event) => this.admitEvent(event));
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
  protected installConnectivityEffect(): () => void {
    return effect(() => {
      if (!onlineSignal.value) return;
      this.personalizationQueue.clearScheduledRetry();
      this.analyticsQueue.clearScheduledRetry();
      void this.flushQueues({ force: true }, () => !this.destroyed && onlineSignal.peek() === true);
    });
  }

  protected withdrawEventConsent(): void {
    this.resetToken = {};
    this.personalizationQueue.clearQueue();
    this.flags.clearAttempts();
    this.analyticsQueue.clearQueuedEvents();
    this.stateRevision += 1;
  }

  protected get online(): boolean {
    return onlineSignal.value ?? false;
  }
  protected set online(isOnline: boolean) {
    onlineSignal.value = isOnline;
  }
}
