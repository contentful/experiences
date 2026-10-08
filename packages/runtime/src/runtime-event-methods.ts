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
import {
  type AllowedEventType,
  type BlockedEvent,
  type ConsentState,
  type EventMethod,
  hasEventConsent,
} from './consent.js';
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

/**
 * Result of a Personalization method. `{ accepted: false }` means consent blocked
 * the event before it reached the API; `{ accepted: true, data }` carries the response.
 */
export type EventEmissionResult =
  | { readonly accepted: false; readonly data?: never }
  | { readonly accepted: true; readonly data: EventOptimizationData };

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
  /** Current event consent; an undecided state gates events to `allowedEventTypes`. */
  getConsent?: () => ConsentState | undefined;
  /** Event types emitted while event consent is not granted. Defaults to identify and page. */
  allowedEventTypes?: readonly AllowedEventType[];
  /** Called when consent drops an event. Errors thrown here are swallowed. */
  onEventBlocked?: (event: BlockedEvent) => void;
}

/**
 * Event-triggering surface shared by the public Node and Web runtimes.
 * Profile-producing calls are not serialized; await them before another
 * profile-producing or Analytics call on the same bound runtime. A Personalization
 * call blocked by consent resolves `{ accepted: false }`; a blocked Analytics call resolves `false`. In Node
 * handoff mode an Analytics `true` means accepted into the handoff journal,
 * not delivered to the Analytics transport.
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
    return this.sendPersonalizationEvent('identify', args, () =>
      this.eventBuilder.buildIdentify(this.withEventContext(args))
    );
  }

  async page(args: PageViewBuilderArgs = {}): Promise<EventEmissionResult> {
    return this.sendPersonalizationEvent('page', args, () =>
      this.eventBuilder.buildPageView(this.withEventContext(args))
    );
  }

  async track(args: TrackBuilderArgs): Promise<EventEmissionResult> {
    return this.sendPersonalizationEvent('track', args, () =>
      this.eventBuilder.buildTrack(this.withEventContext(args))
    );
  }

  async trackView(args: ViewBuilderArgs): Promise<boolean> {
    return this.sendAnalyticsEvent('trackView', args, () =>
      this.eventBuilder.buildView(this.withEventContext(args))
    );
  }

  async trackClick(args: ClickBuilderArgs): Promise<boolean> {
    return this.sendAnalyticsEvent('trackClick', args, () =>
      this.eventBuilder.buildClick(this.withEventContext(args))
    );
  }

  async trackHover(args: HoverBuilderArgs): Promise<boolean> {
    return this.sendAnalyticsEvent('trackHover', args, () =>
      this.eventBuilder.buildHover(this.withEventContext(args))
    );
  }

  async trackFlagView(args: FlagViewBuilderArgs): Promise<boolean> {
    return this.sendAnalyticsEvent('trackFlagView', args, () =>
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
        gdpr: { ...event.context.gdpr, isConsentGiven: consent.events === true },
      },
    } as TEvent;
  }

  /** Whether `method` may emit; reports a blocked event to `onEventBlocked` otherwise. */
  private admit(method: EventMethod, args: readonly unknown[]): boolean {
    const { getConsent, allowedEventTypes, onEventBlocked } = this.bindings;
    if (getConsent === undefined || hasEventConsent(method, getConsent(), allowedEventTypes)) {
      return true;
    }
    try {
      onEventBlocked?.({ reason: 'consent', method, args });
    } catch {
      // A failing diagnostic callback must not break event delivery.
    }
    return false;
  }

  private async sendPersonalizationEvent(
    method: PersonalizationEventMethod,
    args: unknown,
    build: () => PersonalizationEvent
  ): Promise<EventEmissionResult> {
    if (!this.admit(method, [args])) return { accepted: false };

    const eventWithConsent = this.withConsent(build());
    const profileRevision = this.bindings.getProfileRevision?.();
    const data = await this.dispatch.personalization(eventWithConsent, this.profile);
    if (profileRevision === undefined || this.bindings.getProfileRevision?.() === profileRevision) {
      this.bindings.setProfile(data.profile);
    }
    return { accepted: true, data };
  }

  private async sendAnalyticsEvent(
    method: AnalyticsEventMethod,
    args: unknown,
    build: () => AnalyticsEvent
  ): Promise<boolean> {
    if (!this.admit(method, [args])) return false;
    const profile = this.profile;
    if (profile === undefined) throw new EventProfileRequiredError(method);
    return this.dispatch.analytics(this.withConsent(build()), profile);
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
