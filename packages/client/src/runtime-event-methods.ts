import type {
  ExperienceApiClient as OptimizationExperienceApiClient,
  InsightsApiClient as OptimizationInsightsApiClient,
} from '@contentful/optimization-api-client';
import type {
  ExperienceEvent as OptimizationExperienceEvent,
  InsightsEvent as OptimizationInsightsEvent,
  OptimizationData as OptimizationApiData,
  PartialProfile as OptimizationPartialProfile,
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

export type EventProfile = OptimizationPartialProfile;
export type EventOptimizationData = OptimizationApiData;

export type ExperienceEventMethod = 'identify' | 'page' | 'track';
export type InsightsEventMethod = 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView';

/** The Optimization API surface used by the shared runtime. */
export interface RuntimeOptimizationApiClient {
  readonly experience: Pick<OptimizationExperienceApiClient, 'upsertProfile'>;
  readonly insights: Pick<OptimizationInsightsApiClient, 'sendBatchEvents'>;
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
 * Direct event-triggering surface shared by the public Node and Web runtimes.
 * Profile-producing calls are not serialized; await them before another
 * profile-producing or Insights call on the same bound runtime.
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

/** Thrown when an Insights event is triggered before a profile is available. */
export class EventProfileRequiredError extends Error {
  readonly method: InsightsEventMethod;

  constructor(method: InsightsEventMethod) {
    super(
      `${method}() requires a current event profile. Supply an initial profile or await identify(), page(), or track() first.`
    );
    this.name = 'EventProfileRequiredError';
    this.method = method;
  }
}

class BoundRuntimeEventMethods implements RuntimeEventMethods {
  constructor(
    private readonly api: RuntimeOptimizationApiClient,
    private readonly eventBuilder: EventBuilder,
    private readonly bindings: RuntimeEventBindings
  ) {}

  get profile(): EventProfile | undefined {
    return this.bindings.getProfile();
  }

  async identify(args: IdentifyBuilderArgs): Promise<EventOptimizationData> {
    return this.sendExperienceEvent(this.eventBuilder.buildIdentify(this.withEventContext(args)));
  }

  async page(args: PageViewBuilderArgs = {}): Promise<EventOptimizationData> {
    return this.sendExperienceEvent(this.eventBuilder.buildPageView(this.withEventContext(args)));
  }

  async track(args: TrackBuilderArgs): Promise<EventOptimizationData> {
    return this.sendExperienceEvent(this.eventBuilder.buildTrack(this.withEventContext(args)));
  }

  async trackView(args: ViewBuilderArgs): Promise<boolean> {
    return this.sendInsightsEvent(
      'trackView',
      this.eventBuilder.buildView(this.withEventContext(args))
    );
  }

  async trackClick(args: ClickBuilderArgs): Promise<boolean> {
    return this.sendInsightsEvent(
      'trackClick',
      this.eventBuilder.buildClick(this.withEventContext(args))
    );
  }

  async trackHover(args: HoverBuilderArgs): Promise<boolean> {
    return this.sendInsightsEvent(
      'trackHover',
      this.eventBuilder.buildHover(this.withEventContext(args))
    );
  }

  async trackFlagView(args: FlagViewBuilderArgs): Promise<boolean> {
    return this.sendInsightsEvent(
      'trackFlagView',
      this.eventBuilder.buildFlagView(this.withEventContext(args))
    );
  }

  private withEventContext<TArgs extends UniversalEventBuilderArgs>(args: TArgs): TArgs {
    return { ...this.bindings.getEventContext?.(), ...args } as TArgs;
  }

  private withConsent<TEvent extends OptimizationExperienceEvent | OptimizationInsightsEvent>(
    event: TEvent
  ): TEvent {
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

  private async sendExperienceEvent(
    event: OptimizationExperienceEvent
  ): Promise<EventOptimizationData> {
    const eventWithConsent = this.withConsent(event);
    const profileRevision = this.bindings.getProfileRevision?.();
    const data = await this.api.experience.upsertProfile(
      {
        profileId: this.profile?.id,
        events: [eventWithConsent],
      },
      { locale: eventWithConsent.context.locale }
    );

    if (profileRevision === undefined || this.bindings.getProfileRevision?.() === profileRevision) {
      this.bindings.setProfile(data.profile);
    }
    return data;
  }

  private async sendInsightsEvent(
    method: InsightsEventMethod,
    event: OptimizationInsightsEvent
  ): Promise<boolean> {
    const profile = this.profile;
    if (profile === undefined) throw new EventProfileRequiredError(method);

    return this.api.insights.sendBatchEvents([
      {
        profile,
        events: [this.withConsent(event)],
      },
    ]);
  }
}

export function createRuntimeEventMethods(
  api: RuntimeOptimizationApiClient,
  eventBuilder: EventBuilder,
  bindings: RuntimeEventBindings
): RuntimeEventMethods {
  return new BoundRuntimeEventMethods(api, eventBuilder, bindings);
}
