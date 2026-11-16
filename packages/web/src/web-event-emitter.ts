import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  EventProfileSchema,
  hasEventConsent,
  warnMissingEventProfile,
  withEventConsent,
  type AllowedEventType,
  type AnalyticsDelivery,
  type AnalyticsEventMethod,
  type BlockedEvent,
  type Config as RuntimeConfig,
  type ConsentState,
  type EventEmissionResult,
  type EventMethod,
  type EventMethods,
  type PersonalizationDelivery,
  type PersonalizationEventMethod,
} from '@contentful/experiences-runtime';
import { profile as profileSignal } from './signals/index.js';

/** Browser event policy on the SDK receiver; delivery queues own final admission. */
export abstract class WebEventEmitter<
  TConfig extends RuntimeConfig,
> extends RuntimeContentfulExperiences<TConfig> {
  protected abstract readonly personalizationQueue: PersonalizationDelivery;
  protected abstract readonly analyticsQueue: AnalyticsDelivery;
  protected abstract readonly allowedEventTypes: readonly AllowedEventType[];
  protected abstract get eventEmissionActive(): boolean;
  protected abstract getEventConsent(): ConsentState;
  protected abstract reportBlockedEvent(event: BlockedEvent): void;
  abstract get isPreview(): boolean;

  readonly identify: EventMethods['identify'] = async (args) => {
    const skipped = this.#skipEvent('identify', args);
    if (skipped) return skipped;
    return this.#sendPersonalizationEvent(
      'identify',
      args,
      this.eventBuilder.buildIdentify({ ...args })
    );
  };

  readonly page: EventMethods['page'] = async (args = {}) => {
    const skipped = this.#skipEvent('page', args);
    if (skipped) return skipped;
    return this.#sendPersonalizationEvent(
      'page',
      args,
      this.eventBuilder.buildPageView({ ...args })
    );
  };

  readonly track: EventMethods['track'] = async (args) => {
    const skipped = this.#skipEvent('track', args);
    if (skipped) return skipped;
    return this.#sendPersonalizationEvent('track', args, this.eventBuilder.buildTrack({ ...args }));
  };

  readonly trackView: EventMethods['trackView'] = async (args) => {
    const skipped = this.#skipEvent('trackView', args);
    if (skipped) return skipped;
    if (!this.#admit('trackView', [args])) return { accepted: false };
    return this.#sendAnalyticsEvent('trackView', args, this.eventBuilder.buildView({ ...args }));
  };

  readonly trackClick: EventMethods['trackClick'] = async (args) => {
    const skipped = this.#skipEvent('trackClick', args);
    if (skipped) return skipped;
    return this.#sendAnalyticsEvent('trackClick', args, this.eventBuilder.buildClick({ ...args }));
  };

  readonly trackHover: EventMethods['trackHover'] = async (args) => {
    const skipped = this.#skipEvent('trackHover', args);
    if (skipped) return skipped;
    return this.#sendAnalyticsEvent('trackHover', args, this.eventBuilder.buildHover({ ...args }));
  };

  readonly trackFlagView: EventMethods['trackFlagView'] = async (args) => {
    const skipped = this.#skipEvent('trackFlagView', args);
    if (skipped) return skipped;
    return this.#sendAnalyticsEvent(
      'trackFlagView',
      args,
      this.eventBuilder.buildFlagView({ ...args })
    );
  };

  #skipEvent(method: EventMethod, args: unknown): EventEmissionResult | undefined {
    if (!this.eventEmissionActive) return { accepted: false };
    if (!this.isPreview) return undefined;
    this.reportBlockedEvent({ reason: 'preview', method, args: [args] });
    return { accepted: false, reason: 'preview' };
  }

  #admit(method: EventMethod, args: readonly unknown[]): boolean {
    if (hasEventConsent(method, this.getEventConsent(), this.allowedEventTypes)) return true;
    this.reportBlockedEvent({ reason: 'consent', method, args });
    return false;
  }

  async #sendPersonalizationEvent(
    method: PersonalizationEventMethod,
    args: unknown,
    event: Parameters<PersonalizationDelivery['send']>[0]
  ): Promise<EventEmissionResult> {
    if (!this.#admit(method, [args])) return { accepted: false };
    return this.personalizationQueue.send(
      withEventConsent(event, this.getEventConsent().events === true)
    );
  }

  async #sendAnalyticsEvent(
    method: AnalyticsEventMethod,
    args: unknown,
    event: Parameters<AnalyticsDelivery['send']>[0]
  ): Promise<EventEmissionResult> {
    if (!this.#admit(method, [args])) return { accepted: false };
    const profile = EventProfileSchema.safeParse(profileSignal.value);
    if (!profile.success) {
      warnMissingEventProfile();
      return { accepted: true };
    }
    const admitted = await this.analyticsQueue.send(
      withEventConsent(event, this.getEventConsent().events === true),
      profile.data
    );
    return { accepted: admitted !== false };
  }
}
