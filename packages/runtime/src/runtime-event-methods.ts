import type {
  ExperienceApiClient as PersonalizationApiClient,
  ExperienceApiClientRequestOptions as PersonalizationApiClientRequestOptions,
  InsightsApiClient as AnalyticsApiClient,
  InsightsApiClientRequestOptions as AnalyticsApiClientRequestOptions,
} from '@contentful/optimization-api-client';
import { createScopedLogger } from '@contentful/optimization-api-client/logger';
import {
  InsightsEvent as AnalyticsEventSchema,
  Profile,
  parseWithFriendlyError as parseOptimizationSchema,
  type ExperienceEvent as PersonalizationEvent,
  type InsightsEvent as AnalyticsEvent,
  type OptimizationData as EventOptimizationData,
} from '@contentful/optimization-api-client/api-schemas';
import * as z from 'zod/mini';
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

/** Request-scoped Analytics API options a runtime may forward with direct sends. */
export type AnalyticsRequestOptions = Pick<AnalyticsApiClientRequestOptions, 'beacon'>;

/** Request-scoped Personalization API options a runtime may forward with direct sends. */
export type PersonalizationRequestOptions = Pick<
  PersonalizationApiClientRequestOptions,
  'ip' | 'locale' | 'plainText'
>;

/**
 * Runtime schema for profiles retained by public runtime leaves: a complete Personalization API
 * profile, or only its id when the runtime learned the id without the profile (for example
 * from a Delivery response). Personalization needs only the id; Analytics needs a complete
 * profile.
 */
export const EventProfileSchema = z.union([
  Profile,
  z.catchall(z.object({ id: z.string() }), z.json()),
]);
export type EventProfile = z.infer<typeof EventProfileSchema>;
export type { EventOptimizationData };

export type PersonalizationEventMethod = 'identify' | 'page' | 'track';
export type AnalyticsEventMethod = 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView';

/** The Optimization API surface used by the shared runtime. */
export interface EventApi {
  readonly personalization: Pick<PersonalizationApiClient, 'upsertProfile'>;
  readonly analytics: Pick<AnalyticsApiClient, 'sendBatchEvents'>;
}

/** Internal strategy used by a runtime to commit or stage built events. */
export interface RuntimeEventDispatch {
  personalization(
    event: PersonalizationEvent,
    profile: EventProfile | undefined
  ): Promise<EventEmissionResult>;
  analytics(event: AnalyticsEvent, profile: Profile): Promise<void | false>;
}

/** Runtime-owned state and context used to bind otherwise stateless event methods. */
export interface RuntimeEventBindings {
  getProfile: () => EventProfile | undefined;
  /** Fixed preview intent of the owning instance/request. */
  getIsPreview?: () => boolean;
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
  /** Analytics API options forwarded with each direct Analytics send, such as `beacon`. */
  getAnalyticsOptions?: () => AnalyticsRequestOptions | undefined;
  /** Personalization API options forwarded with each direct Personalization send. */
  getPersonalizationOptions?: () => PersonalizationRequestOptions | undefined;
}

/** Owner bindings for the default transport, which publishes returned profiles. */
export interface DirectEventBindings extends Omit<RuntimeEventBindings, 'reportBlockedEvent'> {
  /** Configured diagnostic callback; its errors must not interrupt event delivery. */
  onEventBlocked?: (event: BlockedEvent) => void;
  setProfile: (profile: EventProfile) => void;
  /** Changes when an external session boundary must invalidate an in-flight profile response. */
  getProfileRevision?: () => number;
  /** Request disposal guard for transport admission and late profile publication. */
  isActive?: () => boolean;
  /** Instance-owned transformation stage for direct Node emissions. */
  eventInterceptors?: EventInterceptors;
}

/**
 * Event-triggering surface shared by the public Node and Web runtimes.
 * Profile-producing calls are not globally serialized. Prepared replay uses
 * the same Personalization transport through the Web delivery queue. A
 * Personalization call blocked by consent resolves `{ accepted: false }`; a
 * blocked Analytics call resolves `{ accepted: false }`.
 */
export interface RuntimeEventMethods {
  readonly profile: EventProfile | undefined;
  identify(args: IdentifyBuilderArgs): Promise<EventEmissionResult>;
  page(args?: PageViewBuilderArgs): Promise<EventEmissionResult>;
  track(args: TrackBuilderArgs): Promise<EventEmissionResult>;
  trackView(args: ViewBuilderArgs): Promise<EventEmissionResult>;
  trackClick(args: ClickBuilderArgs): Promise<EventEmissionResult>;
  trackHover(args: HoverBuilderArgs): Promise<EventEmissionResult>;
  trackFlagView(args: FlagViewBuilderArgs): Promise<EventEmissionResult>;
}

/** Thrown when an Analytics event is triggered before a profile is available. */
export class EventProfileRequiredError extends Error {
  readonly method: AnalyticsEventMethod;

  constructor(method: AnalyticsEventMethod) {
    super(
      `${method}() requires a complete event profile. Supply an initial profile or await identify(), page(), or track() first.`
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
    const skipped = this.skipPreview('identify', args);
    if (skipped) return skipped;
    return this.sendPersonalizationEvent(
      'identify',
      args,
      this.eventBuilder.buildIdentify(this.withEventContext(args))
    );
  }

  async page(args: PageViewBuilderArgs = {}): Promise<EventEmissionResult> {
    const skipped = this.skipPreview('page', args);
    if (skipped) return skipped;
    return this.sendPersonalizationEvent(
      'page',
      args,
      this.eventBuilder.buildPageView(this.withEventContext(args))
    );
  }

  async track(args: TrackBuilderArgs): Promise<EventEmissionResult> {
    const skipped = this.skipPreview('track', args);
    if (skipped) return skipped;
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
    const skipped = this.skipPreview('trackView', args);
    if (skipped) return skipped;
    if (!this.admit('trackView', [args])) return { accepted: false };

    return this.sendAnalyticsEvent(
      'trackView',
      args,
      this.eventBuilder.buildView(this.withEventContext(args))
    );
  }

  async trackClick(args: ClickBuilderArgs): Promise<EventEmissionResult> {
    const skipped = this.skipPreview('trackClick', args);
    if (skipped) return skipped;
    return this.sendAnalyticsEvent(
      'trackClick',
      args,
      this.eventBuilder.buildClick(this.withEventContext(args))
    );
  }

  async trackHover(args: HoverBuilderArgs): Promise<EventEmissionResult> {
    const skipped = this.skipPreview('trackHover', args);
    if (skipped) return skipped;
    return this.sendAnalyticsEvent(
      'trackHover',
      args,
      this.eventBuilder.buildHover(this.withEventContext(args))
    );
  }

  async trackFlagView(args: FlagViewBuilderArgs): Promise<EventEmissionResult> {
    const skipped = this.skipPreview('trackFlagView', args);
    if (skipped) return skipped;
    return this.sendAnalyticsEvent(
      'trackFlagView',
      args,
      this.eventBuilder.buildFlagView(this.withEventContext(args))
    );
  }

  private skipPreview(method: EventMethod, args: unknown): EventEmissionResult | undefined {
    if (this.bindings.getIsPreview?.() !== true) return undefined;
    this.bindings.reportBlockedEvent?.({ reason: 'preview', method, args: [args] });
    return { accepted: false, reason: 'preview' };
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
  ): Promise<EventEmissionResult> {
    if (!this.admit(method, [args])) return { accepted: false };
    // Analytics requires a complete profile, as in Optimization; an id-only profile counts as missing.
    const profile = completeProfile(this.profile);
    if (profile === undefined) {
      // Stateless requests are bound to a profile, so a missing one is a caller error.
      // Stateful runtimes follow Optimization's queue: warn and drop the event.
      if (this.bindings.requireProfile === true) throw new EventProfileRequiredError(method);
      eventLogger.warn('Attempting to emit an event without an Optimization profile');
      return { accepted: true };
    }
    const admitted = await this.dispatch.analytics(this.withConsent(event), profile);
    return { accepted: admitted !== false };
  }
}

function completeProfile(profile: EventProfile | undefined): Profile | undefined {
  const result = Profile.safeParse(profile);
  return result.success ? result.data : undefined;
}

function createDirectEventDispatch(
  api: EventApi,
  bindings: DirectEventBindings
): RuntimeEventDispatch {
  return {
    personalization: async (event, profile) => {
      const profileRevision = bindings.getProfileRevision?.();
      const interceptors = bindings.eventInterceptors;
      if (interceptors !== undefined && interceptors.count?.() !== 0) {
        event = validatePersonalizationEvent(await interceptors.run(event));
        if (!admitInterceptedEvent(event, bindings)) return { accepted: false };
      }
      if (bindings.isActive?.() === false) return { accepted: false };
      const data = await sendPersonalizationEvents(api.personalization, [event], profile?.id, {
        ...bindings.getPersonalizationOptions?.(),
        locale: bindings.getLocale?.(),
      });
      if (
        bindings.isActive?.() !== false &&
        (profileRevision === undefined || bindings.getProfileRevision?.() === profileRevision)
      ) {
        bindings.setProfile(data.profile);
      }
      return { accepted: true, data };
    },
    analytics: async (event, profile) => {
      const interceptors = bindings.eventInterceptors;
      if (interceptors !== undefined && interceptors.count?.() !== 0) {
        event = parseOptimizationSchema(AnalyticsEventSchema, await interceptors.run(event));
        if (!admitInterceptedEvent(event, bindings)) return false;
      }
      if (bindings.isActive?.() === false) return false;
      const batches = [{ profile, events: [event] }];
      const options = bindings.getAnalyticsOptions?.();
      // As in Optimization's stateless request, the options argument is omitted when unset.
      if (options === undefined) await api.analytics.sendBatchEvents(batches);
      else await api.analytics.sendBatchEvents(batches, options);
      return undefined;
    },
  };
}

function admitInterceptedEvent(
  event: PersonalizationEvent | AnalyticsEvent,
  bindings: DirectEventBindings
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
  api: EventApi,
  eventBuilder: EventBuilder,
  ...args:
    | [bindings: DirectEventBindings]
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
