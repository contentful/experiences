import type {
  ExperienceApiClient as PersonalizationApiClient,
  InsightsApiClient as AnalyticsApiClient,
} from '@contentful/optimization-api-client';
import {
  PartialProfile as EventProfileSchema,
  type ExperienceEvent as PersonalizationEvent,
  type InsightsEvent as AnalyticsEvent,
  type OptimizationData as EventOptimizationData,
  type PartialProfile as EventProfile,
} from '@contentful/optimization-api-client/api-schemas';
import type EventBuilder from './event-builder.js';
import type {
  ClickBuilderArgs,
  FlagViewBuilderArgs,
  HoverBuilderArgs,
  IdentifyBuilderArgs,
  PageViewBuilderArgs,
  TrackBuilderArgs,
  UniversalEventBuilderArgs,
  ViewBuilderArgs,
} from './event-builder.js';

/** Runtime schema for profiles retained by public runtime leaves. */
export { EventProfileSchema };
export type { EventOptimizationData, EventProfile };

export type PersonalizationEventMethod = 'identify' | 'page' | 'track';
export type AnalyticsEventMethod = 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView';

/** The Optimization API surface used by the shared runtime. */
export interface RuntimeOptimizationApiClient {
  readonly personalization: Pick<PersonalizationApiClient, 'upsertProfile'>;
  readonly analytics: Pick<AnalyticsApiClient, 'sendBatchEvents'>;
}

/** Internal strategy used by a runtime to commit or stage built events. */
export interface RuntimeEventDispatch {
  personalization(
    event: PersonalizationEvent,
    profile: EventProfile | undefined
  ): Promise<EventOptimizationData>;
  analytics(event: AnalyticsEvent, profile: EventProfile): Promise<boolean>;
}

/** Runtime-owned state and context used to bind otherwise stateless event methods. */
export interface RuntimeEventBindings {
  getProfile: () => EventProfile | undefined;
  setProfile: (profile: EventProfile) => void;
  /** Changes when an external session boundary must invalidate an in-flight profile response. */
  getProfileRevision?: () => number;
  getEventContext?: () => UniversalEventBuilderArgs;
  getConsent?: () => boolean | undefined;
}

/**
 * Event-triggering surface shared by the public Node and Web runtimes.
 * Profile-producing calls are not serialized; await them before another
 * profile-producing or Analytics call on the same bound runtime. In Node
 * handoff mode an Analytics `true` means accepted into the handoff journal,
 * not delivered to the Analytics transport.
 */
export interface RuntimeEventMethods {
  readonly profile: EventProfile | undefined;
  identify(args: IdentifyBuilderArgs): Promise<EventOptimizationData>;
  page(args?: PageViewBuilderArgs): Promise<EventOptimizationData>;
  track(args: TrackBuilderArgs): Promise<EventOptimizationData>;
  trackView(args: ViewBuilderArgs): Promise<boolean>;
  trackClick(args: ClickBuilderArgs): Promise<boolean>;
  trackHover(args: HoverBuilderArgs): Promise<boolean>;
  trackFlagView(args: FlagViewBuilderArgs): Promise<boolean>;
}

/** Thrown when an Analytics event is triggered before a profile is available. */
export class EventProfileRequiredError extends Error {
  readonly method: AnalyticsEventMethod;

  constructor(method: AnalyticsEventMethod) {
    super(
      `${method}() requires a current event profile. Supply an initial profile or await identify(), page(), or track() first.`
    );
    this.name = 'EventProfileRequiredError';
    this.method = method;
  }
}

class BoundRuntimeEventMethods implements RuntimeEventMethods {
  constructor(
    private readonly eventBuilder: EventBuilder,
    private readonly bindings: RuntimeEventBindings,
    private readonly dispatch: RuntimeEventDispatch
  ) {}

  get profile(): EventProfile | undefined {
    return this.bindings.getProfile();
  }

  async identify(args: IdentifyBuilderArgs): Promise<EventOptimizationData> {
    return this.sendPersonalizationEvent(
      this.eventBuilder.buildIdentify(this.withEventContext(args))
    );
  }

  async page(args: PageViewBuilderArgs = {}): Promise<EventOptimizationData> {
    return this.sendPersonalizationEvent(
      this.eventBuilder.buildPageView(this.withEventContext(args))
    );
  }

  async track(args: TrackBuilderArgs): Promise<EventOptimizationData> {
    return this.sendPersonalizationEvent(this.eventBuilder.buildTrack(this.withEventContext(args)));
  }

  async trackView(args: ViewBuilderArgs): Promise<boolean> {
    return this.sendAnalyticsEvent(
      'trackView',
      this.eventBuilder.buildView(this.withEventContext(args))
    );
  }

  async trackClick(args: ClickBuilderArgs): Promise<boolean> {
    return this.sendAnalyticsEvent(
      'trackClick',
      this.eventBuilder.buildClick(this.withEventContext(args))
    );
  }

  async trackHover(args: HoverBuilderArgs): Promise<boolean> {
    return this.sendAnalyticsEvent(
      'trackHover',
      this.eventBuilder.buildHover(this.withEventContext(args))
    );
  }

  async trackFlagView(args: FlagViewBuilderArgs): Promise<boolean> {
    return this.sendAnalyticsEvent(
      'trackFlagView',
      this.eventBuilder.buildFlagView(this.withEventContext(args))
    );
  }

  private withEventContext<TArgs extends UniversalEventBuilderArgs>(args: TArgs): TArgs {
    return { ...this.bindings.getEventContext?.(), ...args } as TArgs;
  }

  private withConsent<TEvent extends PersonalizationEvent | AnalyticsEvent>(event: TEvent): TEvent {
    const consent = this.bindings.getConsent?.();
    if (consent === undefined) return event;

    return {
      ...event,
      context: {
        ...event.context,
        gdpr: { ...event.context.gdpr, isConsentGiven: consent },
      },
    } as TEvent;
  }

  private async sendPersonalizationEvent(
    event: PersonalizationEvent
  ): Promise<EventOptimizationData> {
    const eventWithConsent = this.withConsent(event);
    const profileRevision = this.bindings.getProfileRevision?.();
    const data = await this.dispatch.personalization(eventWithConsent, this.profile);
    if (profileRevision === undefined || this.bindings.getProfileRevision?.() === profileRevision) {
      this.bindings.setProfile(data.profile);
    }
    return data;
  }

  private async sendAnalyticsEvent(
    method: AnalyticsEventMethod,
    event: AnalyticsEvent
  ): Promise<boolean> {
    const profile = this.profile;
    if (profile === undefined) throw new EventProfileRequiredError(method);
    return this.dispatch.analytics(this.withConsent(event), profile);
  }
}

function createDirectEventDispatch(api: RuntimeOptimizationApiClient): RuntimeEventDispatch {
  return {
    personalization: (event, profile) =>
      api.personalization.upsertProfile(
        { profileId: profile?.id, events: [event] },
        { locale: event.context.locale }
      ),
    analytics: (event, profile) => api.analytics.sendBatchEvents([{ profile, events: [event] }]),
  };
}

export function createRuntimeEventMethods(
  api: RuntimeOptimizationApiClient,
  eventBuilder: EventBuilder,
  bindings: RuntimeEventBindings,
  dispatch: RuntimeEventDispatch = createDirectEventDispatch(api)
): RuntimeEventMethods {
  return new BoundRuntimeEventMethods(eventBuilder, bindings, dispatch);
}
