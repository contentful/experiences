import type {
  ExperienceApiClient as PersonalizationApiClient,
  ExperienceApiClientRequestOptions,
  InsightsApiClient as AnalyticsApiClient,
  InsightsApiClientRequestOptions,
} from '@contentful/optimization-api-client';
import { createScopedLogger } from '@contentful/optimization-api-client/logger';
import {
  Profile as EventProfileSchema,
  InsightsEvent as InsightsEventSchema,
  parseWithFriendlyError as parseOptimizationSchema,
  type ExperienceEvent as PersonalizationEvent,
  type InsightsEvent as AnalyticsEvent,
  type OptimizationData as EventOptimizationData,
  type Profile as EventProfile,
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

/** @internal Shared warning for Analytics attempts without a complete profile. */
export function warnMissingEventProfile(): void {
  eventLogger.warn('Attempting to emit an event without a complete Optimization profile');
}

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
interface RuntimeEventDispatch {
  personalization(
    event: PersonalizationEvent,
    profile: EventProfile | Pick<EventProfile, 'id'> | undefined
  ): Promise<EventEmissionResult>;
  analytics(event: AnalyticsEvent, profile: EventProfile): Promise<void | false>;
}

/** Request owner bindings for direct transport and returned-profile publication. */
export interface RuntimeDirectEventBindings {
  getProfile: () => EventProfile | Pick<EventProfile, 'id'> | undefined;
  /** Fixed preview intent of the owning instance/request. */
  getIsPreview?: () => boolean;
  getEventContext?: () => UniversalEventBuilderArgs;
  /** Content/request locale for Personalization; event context does not override it. */
  getLocale?: () => string | undefined;
  /** Current event consent; an undecided state gates events to `allowedEventTypes`. */
  getConsent?: () => ConsentState | undefined;
  /** Event types emitted while event consent is not granted. Defaults to identify and page. */
  allowedEventTypes?: readonly AllowedEventType[];
  /** Insights API options forwarded with each direct Analytics send, such as `beacon`. */
  getInsightsOptions?: () => InsightsRequestOptions | undefined;
  /** Experience API options forwarded with each direct Personalization send. */
  getExperienceOptions?: () => ExperienceRequestOptions | undefined;
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
  readonly profile: EventProfile | Pick<EventProfile, 'id'> | undefined;
  identify(args: IdentifyBuilderArgs): Promise<EventEmissionResult>;
  page(args?: PageViewBuilderArgs): Promise<EventEmissionResult>;
  track(args: TrackBuilderArgs): Promise<EventEmissionResult>;
  trackView(args: ViewBuilderArgs): Promise<EventEmissionResult>;
  trackClick(args: ClickBuilderArgs): Promise<EventEmissionResult>;
  trackHover(args: HoverBuilderArgs): Promise<EventEmissionResult>;
  trackFlagView(args: FlagViewBuilderArgs): Promise<EventEmissionResult>;
}

/** Thrown when an Analytics event is triggered before a complete profile is available. */
export class EventProfileRequiredError extends Error {
  readonly method: AnalyticsEventMethod;

  constructor(method: AnalyticsEventMethod) {
    super(
      `${method}() requires a complete event profile. Supply a complete initial profile or await identify(), page(), or track() first.`
    );
    this.name = 'EventProfileRequiredError';
    this.method = method;
  }
}

class BoundRuntimeEventMethods implements RuntimeEventMethods {
  constructor(
    private readonly eventBuilder: EventBuilder,
    private readonly bindings: RuntimeDirectEventBindings,
    private readonly dispatch: RuntimeEventDispatch
  ) {}

  get profile(): EventProfile | Pick<EventProfile, 'id'> | undefined {
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

  /** The early consent guard precedes view validation, as in Optimization. */
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
    reportBlockedEvent(this.bindings, { reason: 'preview', method, args: [args] });
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
    const { getConsent, allowedEventTypes } = this.bindings;
    if (getConsent === undefined || hasEventConsent(method, getConsent(), allowedEventTypes)) {
      return true;
    }
    reportBlockedEvent(this.bindings, { reason: 'consent', method, args });
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
    const profile = EventProfileSchema.safeParse(this.profile);
    if (!profile.success) throw new EventProfileRequiredError(method);
    const admitted = await this.dispatch.analytics(this.withConsent(event), profile.data);
    return { accepted: admitted !== false };
  }
}

/** @internal Deliver a finalized, admitted batch and publish only to its current owner. */
export async function deliverPersonalizationEvents(
  api: RuntimeOptimizationApiClient['experience'],
  events: readonly PersonalizationEvent[],
  profileId: string | undefined,
  options: (ExperienceRequestOptions & { preflight?: boolean }) | undefined,
  bindings: Pick<RuntimeDirectEventBindings, 'setProfile' | 'getProfileRevision' | 'isActive'>,
  profileRevision = bindings.getProfileRevision?.()
): Promise<EventEmissionResult> {
  if (bindings.isActive?.() === false) return { accepted: false };
  const data = await api.upsertProfile({ profileId, events: [...events] }, options);
  if (
    bindings.isActive?.() !== false &&
    (profileRevision === undefined || bindings.getProfileRevision?.() === profileRevision)
  ) {
    bindings.setProfile(data.profile);
  }
  return { accepted: true, data };
}

function createDirectEventDispatch(
  api: RuntimeOptimizationApiClient,
  bindings: RuntimeDirectEventBindings
): RuntimeEventDispatch {
  return {
    personalization: async (event, profile) => {
      const profileRevision = bindings.getProfileRevision?.();
      const interceptors = bindings.eventInterceptors;
      if (interceptors !== undefined && interceptors.count?.() !== 0) {
        event = validatePersonalizationEvent(await interceptors.run(event));
        if (!admitInterceptedEvent(event, bindings)) return { accepted: false };
      }
      return deliverPersonalizationEvents(
        api.experience,
        [event],
        profile?.id,
        { ...bindings.getExperienceOptions?.(), locale: bindings.getLocale?.() },
        bindings,
        profileRevision
      );
    },
    analytics: async (event, profile) => {
      const interceptors = bindings.eventInterceptors;
      if (interceptors !== undefined && interceptors.count?.() !== 0) {
        event = parseOptimizationSchema(InsightsEventSchema, await interceptors.run(event));
        if (!admitInterceptedEvent(event, bindings)) return false;
      }
      if (bindings.isActive?.() === false) return false;
      const batches = [{ profile, events: [event] }];
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
  reportBlockedEvent(bindings, {
    reason: 'consent',
    method: methodForEventType(event.type) ?? event.type,
    args: [event],
  });
  return false;
}

function reportBlockedEvent(bindings: RuntimeDirectEventBindings, event: BlockedEvent): void {
  const onEventBlocked = bindings.onEventBlocked;
  try {
    onEventBlocked?.(event);
  } catch {
    // Diagnostic callbacks do not interrupt direct event admission.
  }
}

export function createRuntimeEventMethods(
  api: RuntimeOptimizationApiClient,
  eventBuilder: EventBuilder,
  bindings: RuntimeDirectEventBindings
): RuntimeEventMethods {
  return new BoundRuntimeEventMethods(
    eventBuilder,
    bindings,
    createDirectEventDispatch(api, bindings)
  );
}
