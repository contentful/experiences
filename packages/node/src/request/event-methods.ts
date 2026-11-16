import {
  emitAnalyticsEvent,
  emitPersonalizationEvent,
  EventProfileRequiredError,
  hasEventTypeConsent,
  methodForEventType,
  validateAnalyticsEvent,
  validatePersonalizationEvent,
  type AnalyticsEvent,
  type AnalyticsEventOwner,
  type AllowedEventType,
  type ApiClient,
  type BlockedEvent,
  type ConsentState,
  type EventBuilder,
  type EventEmissionResult,
  type EventInterceptors,
  type EventMethods,
  type EventProfile,
  type PersonalizationEvent,
  type PersonalizationRequestOptions,
  type AnalyticsRequestOptions,
  type UniversalEventBuilderArgs,
  type IdentifyBuilderArgs,
  type PageViewBuilderArgs,
  type TrackBuilderArgs,
  type ViewBuilderArgs,
  type ClickBuilderArgs,
  type HoverBuilderArgs,
  type FlagViewBuilderArgs,
} from '@contentful/experiences-runtime';

export type EventApi = {
  personalization: Pick<ApiClient['personalization'], 'upsertProfile'>;
  analytics: Pick<ApiClient['analytics'], 'sendBatchEvents'>;
};

/** Owner bindings for direct transport, which publishes returned profiles. */
export interface DirectEventBindings {
  getProfile: () => EventProfile | Pick<EventProfile, 'id'> | undefined;
  /** Fixed preview intent of the owning instance/request. */
  getIsPreview: () => boolean;
  getEventContext?: () => UniversalEventBuilderArgs;
  /** Content/request locale for Personalization; event context does not override it. */
  getLocale?: () => string | undefined;
  /** Current event consent; an undecided state gates events to `allowedEventTypes`. */
  getConsent: () => ConsentState;
  /** Event types emitted while event consent is not granted. Defaults to identify and page. */
  allowedEventTypes?: readonly AllowedEventType[];
  /** Analytics API options forwarded with each direct Analytics send, such as `beacon`. */
  getAnalyticsOptions?: () => AnalyticsRequestOptions | undefined;
  /** Personalization API options forwarded with each direct Personalization send. */
  getPersonalizationOptions?: () => PersonalizationRequestOptions | undefined;
  /** Configured diagnostic callback; its errors must not interrupt event delivery. */
  onEventBlocked?: (event: BlockedEvent) => void;
  setProfile: (profile: EventProfile) => void;
  /** Changes when an external session boundary must invalidate an in-flight profile response. */
  getProfileRevision?: () => number;
  /** Request disposal guard for transport admission and late profile publication. */
  isActive: () => boolean;
  /** Instance-owned transformation stage for direct Node emissions. */
  eventInterceptors?: EventInterceptors;
}

class BoundEventMethods implements EventMethods {
  readonly #owner: AnalyticsEventOwner;

  constructor(
    private readonly api: EventApi,
    private readonly eventBuilder: EventBuilder,
    private readonly bindings: DirectEventBindings
  ) {
    const { onEventBlocked } = bindings;
    this.#owner = {
      ...bindings,
      getAllowedEventTypes: () => bindings.allowedEventTypes,
      reportBlockedEvent: (event) => {
        try {
          onEventBlocked?.(event);
        } catch {
          // Diagnostic callbacks must not interrupt initial event admission.
        }
      },
      onMissingProfile: (method) => {
        throw new EventProfileRequiredError(method);
      },
    };
  }

  get profile(): EventMethods['profile'] {
    return this.bindings.getProfile();
  }

  async identify(args: IdentifyBuilderArgs): Promise<EventEmissionResult> {
    return emitPersonalizationEvent(
      this.#owner,
      'identify',
      args,
      (input) => this.eventBuilder.buildIdentify(input),
      (event) => this.sendPersonalization(event)
    );
  }

  async page(args: PageViewBuilderArgs = {}): Promise<EventEmissionResult> {
    return emitPersonalizationEvent(
      this.#owner,
      'page',
      args,
      (input) => this.eventBuilder.buildPageView(input),
      (event) => this.sendPersonalization(event)
    );
  }

  async track(args: TrackBuilderArgs): Promise<EventEmissionResult> {
    return emitPersonalizationEvent(
      this.#owner,
      'track',
      args,
      (input) => this.eventBuilder.buildTrack(input),
      (event) => this.sendPersonalization(event)
    );
  }

  async trackView(args: ViewBuilderArgs): Promise<EventEmissionResult> {
    return emitAnalyticsEvent(
      this.#owner,
      'trackView',
      args,
      (input) => this.eventBuilder.buildView(input),
      (event, profile) => this.sendAnalytics(event, profile)
    );
  }

  async trackClick(args: ClickBuilderArgs): Promise<EventEmissionResult> {
    return emitAnalyticsEvent(
      this.#owner,
      'trackClick',
      args,
      (input) => this.eventBuilder.buildClick(input),
      (event, profile) => this.sendAnalytics(event, profile)
    );
  }

  async trackHover(args: HoverBuilderArgs): Promise<EventEmissionResult> {
    return emitAnalyticsEvent(
      this.#owner,
      'trackHover',
      args,
      (input) => this.eventBuilder.buildHover(input),
      (event, profile) => this.sendAnalytics(event, profile)
    );
  }

  async trackFlagView(args: FlagViewBuilderArgs): Promise<EventEmissionResult> {
    return emitAnalyticsEvent(
      this.#owner,
      'trackFlagView',
      args,
      (input) => this.eventBuilder.buildFlagView(input),
      (event, profile) => this.sendAnalytics(event, profile)
    );
  }

  private async sendPersonalization(event: PersonalizationEvent): Promise<EventEmissionResult> {
    const { bindings, api } = this;
    const profile = this.profile;
    const profileRevision = bindings.getProfileRevision?.();
    const interceptors = bindings.eventInterceptors;
    if (interceptors !== undefined && interceptors.count?.() !== 0) {
      event = validatePersonalizationEvent(await interceptors.run(event));
      if (!admitInterceptedEvent(event, bindings)) return { accepted: false };
    }
    const options = { ...bindings.getPersonalizationOptions?.(), locale: bindings.getLocale?.() };
    if (!bindings.isActive()) return { accepted: false };
    const data = await api.personalization.upsertProfile(
      { profileId: profile?.id, events: [event] },
      options
    );
    if (
      bindings.isActive() &&
      (profileRevision === undefined || bindings.getProfileRevision?.() === profileRevision)
    )
      bindings.setProfile(data.profile);
    return { accepted: true, data };
  }

  private async sendAnalytics(event: AnalyticsEvent, profile: EventProfile): Promise<void | false> {
    const { bindings, api } = this;
    const interceptors = bindings.eventInterceptors;
    if (interceptors !== undefined && interceptors.count?.() !== 0) {
      event = validateAnalyticsEvent(await interceptors.run(event));
      if (!admitInterceptedEvent(event, bindings)) return false;
    }
    if (!bindings.isActive()) return false;
    const batches = [{ profile, events: [event] }];
    const options = bindings.getAnalyticsOptions?.();
    // Omit the options argument when unset, matching the stateless transport contract.
    if (options === undefined) await api.analytics.sendBatchEvents(batches);
    else await api.analytics.sendBatchEvents(batches, options);
  }
}

function admitInterceptedEvent(
  event: PersonalizationEvent | AnalyticsEvent,
  bindings: DirectEventBindings
): boolean {
  if (hasEventTypeConsent(event.type, bindings.getConsent(), bindings.allowedEventTypes))
    return true;
  try {
    bindings.onEventBlocked?.({
      reason: 'consent',
      method: methodForEventType(event.type) ?? event.type,
      args: [event],
    });
  } catch {
    // Diagnostic callbacks do not interrupt direct event admission.
  }
  return false;
}

/** Direct request delivery; browser delivery remains queue-owned. */
export function createEventMethods(
  api: EventApi,
  eventBuilder: EventBuilder,
  bindings: DirectEventBindings
): EventMethods {
  return new BoundEventMethods(api, eventBuilder, bindings);
}
