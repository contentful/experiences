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
import type { EventEmissionResult } from './event-emission-result.js';
import { sendPersonalizationEvents } from './personalization-delivery.js';
import { withEventConsent } from './prepared-events.js';
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
  ): Promise<EventEmissionResult>;
  analytics(event: AnalyticsEvent, profile: EventProfile): Promise<boolean>;
}

/** Runtime-owned state and context used to bind otherwise stateless event methods. */
export interface RuntimeEventBindings {
  getProfile: () => EventProfile | undefined;
  setProfile: (profile: EventProfile) => void;
  /** Changes when an external session boundary must invalidate an in-flight profile response. */
  getProfileRevision?: () => number;
  getEventContext?: () => UniversalEventBuilderArgs;
  /** Content/request locale for Personalization; event context does not override it. */
  getLocale?: () => string | undefined;
  getConsent?: () => boolean | undefined;
}

/**
 * Event-triggering surface shared by the public Node and Web runtimes.
 * Profile-producing calls are not globally serialized. Prepared replay uses
 * the same Personalization transport through the Web delivery queue.
 */
export interface RuntimeEventMethods {
  readonly profile: EventProfile | undefined;
  identify(args: IdentifyBuilderArgs): Promise<EventEmissionResult>;
  page(args?: PageViewBuilderArgs): Promise<EventEmissionResult>;
  track(args: TrackBuilderArgs): Promise<EventEmissionResult>;
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

  async identify(args: IdentifyBuilderArgs): Promise<EventEmissionResult> {
    return this.sendPersonalizationEvent(
      this.eventBuilder.buildIdentify(this.withEventContext(args))
    );
  }

  async page(args: PageViewBuilderArgs = {}): Promise<EventEmissionResult> {
    return this.sendPersonalizationEvent(
      this.eventBuilder.buildPageView(this.withEventContext(args))
    );
  }

  async track(args: TrackBuilderArgs): Promise<EventEmissionResult> {
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

    return withEventConsent(event, consent);
  }

  private async sendPersonalizationEvent(
    event: PersonalizationEvent
  ): Promise<EventEmissionResult> {
    const eventWithConsent = this.withConsent(event);
    const profileRevision = this.bindings.getProfileRevision?.();
    const result = await this.dispatch.personalization(eventWithConsent, this.profile);
    if (
      result.data !== undefined &&
      (profileRevision === undefined || this.bindings.getProfileRevision?.() === profileRevision)
    ) {
      this.bindings.setProfile(result.data.profile);
    }
    return result;
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

function createDirectEventDispatch(
  api: RuntimeOptimizationApiClient,
  bindings: RuntimeEventBindings
): RuntimeEventDispatch {
  return {
    personalization: async (event, profile) => ({
      accepted: true,
      data: await sendPersonalizationEvents(api.personalization, [event], profile?.id, {
        locale: bindings.getLocale?.(),
      }),
    }),
    analytics: (event, profile) => api.analytics.sendBatchEvents([{ profile, events: [event] }]),
  };
}

export function createRuntimeEventMethods(
  api: RuntimeOptimizationApiClient,
  eventBuilder: EventBuilder,
  bindings: RuntimeEventBindings,
  dispatch: RuntimeEventDispatch = createDirectEventDispatch(api, bindings)
): RuntimeEventMethods {
  return new BoundRuntimeEventMethods(eventBuilder, bindings, dispatch);
}
