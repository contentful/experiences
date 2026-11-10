import {
  serializePersonalization,
  type PersonalizationOptions as BuiltPersonalizationOptions,
} from '@contentful/experiences-client';
import {
  AnalyticsDelivery,
  buildFetchPersonalization,
  EventProfileSchema,
  hasEventConsent,
  hasEventTypeConsent,
  methodForEventType,
  PersonalizationDelivery,
  ContentfulExperiences as RuntimeContentfulExperiences,
  withEventConsent,
  type AllowedEventType,
  type BlockedEvent,
  type ConsentState,
  type Config as BaseConfig,
  type EventEmissionResult,
  type OptimizationEventStreamEvent,
  type PersonalizationOptions,
} from '@contentful/experiences-runtime';
import {
  blockedEvent as blockedEventSignal,
  consent as consentSignal,
  event as eventSignal,
  profile as profileSignal,
} from '../signals/index.js';
import { type LifecycleInterceptors } from '../state/interceptors.js';

import { warnMissingEventProfile, type EventBuilder } from '@contentful/experiences-runtime';
import type { Config, EventMethods } from '../sdk/types.js';
type BuiltFetchOptions<T> = Omit<T, 'personalization'> & {
  personalization?: BuiltPersonalizationOptions;
};

/** Browser event policy and dispatch on the SDK receiver. Runtime queues retain interception and final validation. */
export abstract class EventEmitter extends RuntimeContentfulExperiences<
  Config & Pick<BaseConfig, 'eventBuilder'>
> {
  protected abstract readonly personalizationQueue: PersonalizationDelivery;
  protected abstract readonly analyticsQueue: AnalyticsDelivery;
  protected abstract readonly allowedEventTypes: AllowedEventType[];
  protected abstract readonly onEventBlocked: Config['onEventBlocked'];
  abstract readonly interceptors: LifecycleInterceptors;
  protected abstract destroyed: boolean;
  protected abstract resetToken: object;
  protected abstract isCurrent(token: object): boolean;
  protected abstract getConsent(): ConsentState;
  abstract get isPreview(): boolean;

  readonly identify: EventMethods['identify'] = async (args) => {
    if (this.destroyed) return { accepted: false };
    if (this.isPreview) return this.skipPreviewEvent('identify', [args]);
    return this.sendPersonalizationEvent(
      'identify',
      args,
      this.eventBuilder.buildIdentify({ ...args })
    );
  };

  readonly page: EventMethods['page'] = async (args = {}) => {
    if (this.destroyed) return { accepted: false };
    if (this.isPreview) return this.skipPreviewEvent('page', [args]);
    return this.sendPersonalizationEvent(
      'page',
      args,
      this.eventBuilder.buildPageView({ ...args })
    );
  };

  readonly track: EventMethods['track'] = async (args) => {
    if (this.destroyed) return { accepted: false };
    if (this.isPreview) return this.skipPreviewEvent('track', [args]);
    return this.sendPersonalizationEvent('track', args, this.eventBuilder.buildTrack({ ...args }));
  };

  readonly trackView: EventMethods['trackView'] = async (args) => {
    if (this.destroyed) return { accepted: false };
    if (this.isPreview) return this.skipPreviewEvent('trackView', [args]);
    if (!this.admitMethod('trackView', args)) return { accepted: false };
    return this.sendAnalyticsEvent('trackView', args, this.eventBuilder.buildView({ ...args }));
  };

  readonly trackClick: EventMethods['trackClick'] = async (args) => {
    if (this.destroyed) return { accepted: false };
    if (this.isPreview) return this.skipPreviewEvent('trackClick', [args]);
    return this.sendAnalyticsEvent('trackClick', args, this.eventBuilder.buildClick({ ...args }));
  };

  readonly trackHover: EventMethods['trackHover'] = async (args) => {
    if (this.destroyed) return { accepted: false };
    if (this.isPreview) return this.skipPreviewEvent('trackHover', [args]);
    return this.sendAnalyticsEvent('trackHover', args, this.eventBuilder.buildHover({ ...args }));
  };

  readonly trackFlagView: EventMethods['trackFlagView'] = async (args) => {
    if (this.destroyed) return { accepted: false };
    if (this.isPreview) return this.skipPreviewEvent('trackFlagView', [args]);
    return this.sendAnalyticsEvent(
      'trackFlagView',
      args,
      this.eventBuilder.buildFlagView({ ...args })
    );
  };

  private admitMethod(method: string, args: unknown): boolean {
    if (this.hasConsent(method)) return true;
    this.reportBlockedEvent({ reason: 'consent', method, args: [args] });
    return false;
  }
  private async sendPersonalizationEvent(
    method: string,
    args: unknown,
    event:
      | ReturnType<EventBuilder['buildPageView']>
      | ReturnType<EventBuilder['buildTrack']>
      | ReturnType<EventBuilder['buildIdentify']>
  ): Promise<EventEmissionResult> {
    if (!this.admitMethod(method, args)) return { accepted: false };
    return this.personalizationQueue.send(withEventConsent(event, consentSignal.value === true));
  }
  private async sendAnalyticsEvent(
    method: string,
    args: unknown,
    event: Parameters<AnalyticsDelivery['send']>[0]
  ): Promise<EventEmissionResult> {
    if (!this.admitMethod(method, args)) return { accepted: false };
    const profile = EventProfileSchema.safeParse(profileSignal.value);
    if (!profile.success) {
      warnMissingEventProfile();
      return { accepted: true };
    }
    const admitted = await this.analyticsQueue.send(
      withEventConsent(event, consentSignal.value === true),
      profile.data
    );
    return { accepted: admitted !== false };
  }

  protected readonly publishEvent = (event: OptimizationEventStreamEvent): void => {
    try {
      eventSignal.value = event;
    } catch (error) {
      console.warn('Event stream subscriber failed', error);
    }
  };

  /** Whether event consent or the configured allowlist admits this method/type. */
  hasConsent(name: string): boolean {
    return hasEventConsent(name, this.getConsent(), this.allowedEventTypes);
  }

  /** Whether an already-built event may be emitted; reports it to `onEventBlocked` otherwise. */
  protected admitEvent(event: { type: string }, reportUnmapped = false): boolean {
    if (
      !this.isPreview &&
      hasEventTypeConsent(event.type, this.getConsent(), this.allowedEventTypes)
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

  /**
   * Drops event intent that consent does not admit before building. The profile id
   * still travels, since it is not an event.
   */
  protected gatePersonalizationEvents<T extends { personalization?: PersonalizationOptions }>(
    options: T
  ): BuiltFetchOptions<T> {
    if (this.isPreview) {
      for (const event of options.personalization?.events ?? []) this.admitEvent(event, true);
      return { ...options, personalization: undefined };
    }
    const events = options.personalization?.events;
    if (events === undefined) return options as BuiltFetchOptions<T>;

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
    return { ...gated, personalization: valid };
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
}
