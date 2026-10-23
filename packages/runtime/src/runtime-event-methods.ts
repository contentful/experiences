import type {
  ExperienceApiClient as PersonalizationApiClient,
  ExperienceApiClientRequestOptions,
  InsightsApiClient as AnalyticsApiClient,
  InsightsApiClientRequestOptions,
} from '@contentful/optimization-api-client';
import { createScopedLogger } from '@contentful/optimization-api-client/logger';
import {
  PartialProfile as EventProfileSchema,
  InsightsEvent as InsightsEventSchema,
  parseWithFriendlyError as parseOptimizationSchema,
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
  hasEventTypeConsent,
  methodForEventType,
} from './consent.js';
import { validatePersonalizationEvent, type EventInterceptors } from './event-interceptors.js';
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

const eventLogger = createScopedLogger('Experiences:Events');

/** Request-scoped Insights API options a runtime may forward with direct sends. */
export type InsightsRequestOptions = Pick<InsightsApiClientRequestOptions, 'beacon'>;

/** Request-scoped Experience API options a runtime may forward with direct sends. */
export type ExperienceRequestOptions = Pick<
  ExperienceApiClientRequestOptions,
  'ip' | 'locale' | 'plainText'
>;

/** Runtime schema for profiles retained by public runtime leaves. */
export { EventProfileSchema };
export type { EventOptimizationData, EventProfile };

export type PersonalizationEventMethod = 'identify' | 'page' | 'track';
export type AnalyticsEventMethod = 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView';

/** The Optimization API surface used by the shared runtime. */
export interface RuntimeOptimizationApiClient {
  readonly experience: Pick<PersonalizationApiClient, 'upsertProfile'>;
  readonly insights: Pick<AnalyticsApiClient, 'sendBatchEvents'>;
}

/** Internal strategy used by a runtime to commit or stage built events. */
export interface RuntimeEventDispatch {
  personalization(
    event: PersonalizationEvent,
    profile: EventProfile | undefined
  ): Promise<EventEmissionResult>;
  analytics(event: AnalyticsEvent, profile: EventProfile): Promise<void | false>;
}

/** Runtime-owned state and context used to bind otherwise stateless event methods. */
export interface RuntimeEventBindings {
  getProfile: () => EventProfile | undefined;
  getEventContext?: () => UniversalEventBuilderArgs;
  /** Content/request locale for Personalization; event context does not override it. */
  getLocale?: () => string | undefined;
  /** Current event consent; an undecided state gates events to `allowedEventTypes`. */
  getConsent?: () => ConsentState | undefined;
  /** Event types emitted while event consent is not granted. Defaults to identify and page. */
  allowedEventTypes?: readonly AllowedEventType[];
  /** Owner publication when consent drops an event; subscriber errors propagate. */
  reportBlockedEvent?: (event: BlockedEvent) => void;
  /**
   * Whether an Analytics call without a profile throws `EventProfileRequiredError`, as in
   * Optimization's stateless requests. When unset, the call warns and is dropped, as in
   * Optimization's stateful queue.
   */
  requireProfile?: boolean;
  /** Insights API options forwarded with each direct Analytics send, such as `beacon`. */
  getInsightsOptions?: () => InsightsRequestOptions | undefined;
  /** Experience API options forwarded with each direct Personalization send. */
  getExperienceOptions?: () => ExperienceRequestOptions | undefined;
}

/** Owner bindings for the default transport, which publishes returned profiles. */
export interface RuntimeDirectEventBindings extends Omit<
  RuntimeEventBindings,
  'reportBlockedEvent'
> {
  /** Configured diagnostic callback; its errors must not interrupt event delivery. */
  onEventBlocked?: (event: BlockedEvent) => void;
  setProfile: (profile: EventProfile) => void;
  /** Changes when an external session boundary must invalidate an in-flight profile response. */
  getProfileRevision?: () => number;
  /** Instance-owned transformation stage for direct Node emissions. */
  eventInterceptors?: EventInterceptors;
}

/**
 * Event-triggering surface shared by the public Node and Web runtimes.
 * Profile-producing calls are not globally serialized. Prepared replay uses
 * the same Personalization transport through the Web delivery queue. A
 * Personalization call blocked by consent resolves `{ accepted: false }`; a
 * blocked view resolves `{ accepted: false }`; other Analytics methods resolve void.
 */
export interface RuntimeEventMethods {
  readonly profile: EventProfile | undefined;
  identify(args: IdentifyBuilderArgs): Promise<EventEmissionResult>;
  page(args?: PageViewBuilderArgs): Promise<EventEmissionResult>;
  track(args: TrackBuilderArgs): Promise<EventEmissionResult>;
  trackView(args: ViewBuilderArgs): Promise<EventEmissionResult>;
  trackClick(args: ClickBuilderArgs): Promise<void>;
  trackHover(args: HoverBuilderArgs): Promise<void>;
  trackFlagView(args: FlagViewBuilderArgs): Promise<void>;
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
      'identify',
      args,
      this.eventBuilder.buildIdentify(this.withEventContext(args))
    );
  }

  async page(args: PageViewBuilderArgs = {}): Promise<EventEmissionResult> {
    return this.sendPersonalizationEvent(
      'page',
      args,
      this.eventBuilder.buildPageView(this.withEventContext(args))
    );
  }

  async track(args: TrackBuilderArgs): Promise<EventEmissionResult> {
    return this.sendPersonalizationEvent(
      'track',
      args,
      this.eventBuilder.buildTrack(this.withEventContext(args))
    );
  }

  /**
   * Like Optimization's non-sticky view, the result reports consent admission: an admitted
   * view resolves `{ accepted: true }` and a blocked one `{ accepted: false }`. It is not a
   * delivery result, so a view dropped later for want of a profile is still accepted.
   */
  async trackView(args: ViewBuilderArgs): Promise<EventEmissionResult> {
    if (!this.admit('trackView', [args])) return { accepted: false };

    const accepted = await this.sendAnalyticsEvent(
      'trackView',
      args,
      this.eventBuilder.buildView(this.withEventContext(args))
    );
    return { accepted };
  }

  async trackClick(args: ClickBuilderArgs): Promise<void> {
    await this.sendAnalyticsEvent(
      'trackClick',
      args,
      this.eventBuilder.buildClick(this.withEventContext(args))
    );
  }

  async trackHover(args: HoverBuilderArgs): Promise<void> {
    await this.sendAnalyticsEvent(
      'trackHover',
      args,
      this.eventBuilder.buildHover(this.withEventContext(args))
    );
  }

  async trackFlagView(args: FlagViewBuilderArgs): Promise<void> {
    await this.sendAnalyticsEvent(
      'trackFlagView',
      args,
      this.eventBuilder.buildFlagView(this.withEventContext(args))
    );
  }

  private withEventContext<TArgs extends UniversalEventBuilderArgs>(args: TArgs): TArgs {
    return { ...this.bindings.getEventContext?.(), ...args } as TArgs;
  }

  private withConsent<TEvent extends PersonalizationEvent | AnalyticsEvent>(event: TEvent): TEvent {
    const consent = this.bindings.getConsent?.();
    if (consent === undefined) return event;

    return withEventConsent(event, consent.events === true);
  }

  /** Whether `method` may emit; reports a blocked event to its owner otherwise. */
  private admit(method: EventMethod, args: readonly unknown[]): boolean {
    const { getConsent, allowedEventTypes, reportBlockedEvent } = this.bindings;
    if (getConsent === undefined || hasEventConsent(method, getConsent(), allowedEventTypes)) {
      return true;
    }
    reportBlockedEvent?.({ reason: 'consent', method, args });
    return false;
  }

  private async sendPersonalizationEvent(
    method: PersonalizationEventMethod,
    args: unknown,
    event: PersonalizationEvent
  ): Promise<EventEmissionResult> {
    if (!this.admit(method, [args])) return { accepted: false };

    const eventWithConsent = this.withConsent(event);
    return this.dispatch.personalization(eventWithConsent, this.profile);
  }

  private async sendAnalyticsEvent(
    method: AnalyticsEventMethod,
    args: unknown,
    event: AnalyticsEvent
  ): Promise<boolean> {
    if (!this.admit(method, [args])) return false;
    const profile = this.profile;
    if (profile === undefined) {
      // Stateless requests are bound to a profile, so a missing one is a caller error.
      // Stateful runtimes follow Optimization's queue: warn and drop the event.
      if (this.bindings.requireProfile === true) throw new EventProfileRequiredError(method);
      eventLogger.warn('Attempting to emit an event without an Optimization profile');
      return true;
    }
    const admitted = await this.dispatch.analytics(this.withConsent(event), profile);
    return admitted !== false;
  }
}

function createDirectEventDispatch(
  api: RuntimeOptimizationApiClient,
  bindings: RuntimeDirectEventBindings
): RuntimeEventDispatch {
  return {
    personalization: async (event, profile) => {
      const profileRevision = bindings.getProfileRevision?.();
      const interceptors = bindings.eventInterceptors;
      const intercepted =
        interceptors === undefined || interceptors.count?.() === 0
          ? event
          : await interceptors.run(event);
      const validEvent = validatePersonalizationEvent(intercepted);
      if (!admitInterceptedEvent(validEvent, bindings)) return { accepted: false };
      const data = await sendPersonalizationEvents(api.experience, [validEvent], profile?.id, {
        ...bindings.getExperienceOptions?.(),
        locale: bindings.getLocale?.(),
      });
      if (profileRevision === undefined || bindings.getProfileRevision?.() === profileRevision) {
        bindings.setProfile(data.profile);
      }
      return { accepted: true, data };
    },
    analytics: async (event, profile) => {
      const interceptors = bindings.eventInterceptors;
      const intercepted =
        interceptors === undefined || interceptors.count?.() === 0
          ? event
          : await interceptors.run(event);
      const validEvent = parseOptimizationSchema(InsightsEventSchema, intercepted);
      if (!admitInterceptedEvent(validEvent, bindings)) return false;
      const batches = [{ profile, events: [validEvent] }];
      const options = bindings.getInsightsOptions?.();
      // As in Optimization's stateless request, the options argument is omitted when unset.
      if (options === undefined) await api.insights.sendBatchEvents(batches);
      else await api.insights.sendBatchEvents(batches, options);
      return undefined;
    },
  };
}

function admitInterceptedEvent(
  event: PersonalizationEvent | AnalyticsEvent,
  bindings: RuntimeDirectEventBindings
): boolean {
  if (
    bindings.getConsent === undefined ||
    hasEventTypeConsent(event.type, bindings.getConsent(), bindings.allowedEventTypes)
  )
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

export function createRuntimeEventMethods(
  api: RuntimeOptimizationApiClient,
  eventBuilder: EventBuilder,
  ...args:
    | [bindings: RuntimeDirectEventBindings]
    | [bindings: RuntimeEventBindings, dispatch: RuntimeEventDispatch]
): RuntimeEventMethods {
  if (args.length === 2) return new BoundRuntimeEventMethods(eventBuilder, args[0], args[1]);
  const { onEventBlocked, ...bindings } = args[0];
  return new BoundRuntimeEventMethods(
    eventBuilder,
    {
      ...bindings,
      reportBlockedEvent: (event) => {
        try {
          onEventBlocked?.(event);
        } catch {
          // A failing diagnostic callback must not break event delivery.
        }
      },
    },
    createDirectEventDispatch(api, args[0])
  );
}
