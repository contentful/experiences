import type {
  ExperienceApiClient as PersonalizationApiClient,
  ExperienceApiClientRequestOptions as PersonalizationApiClientRequestOptions,
  InsightsApiClient as AnalyticsApiClient,
  InsightsApiClientRequestOptions as AnalyticsApiClientRequestOptions,
} from '@contentful/optimization-api-client';
import { createScopedLogger } from '@contentful/optimization-api-client/logger';
import {
  Profile as EventProfileSchema,
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
} from './consent.js';
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

/** Warn when stateful Analytics cannot emit without a complete profile. */
export function warnMissingEventProfile(): void {
  eventLogger.warn('Attempting to emit an event without a complete Optimization profile');
}

/** Request-scoped Analytics API options a runtime may forward with direct sends. */
export type AnalyticsRequestOptions = Pick<AnalyticsApiClientRequestOptions, 'beacon'>;

/** Request-scoped Personalization API options a runtime may forward with direct sends. */
export type PersonalizationRequestOptions = Pick<
  PersonalizationApiClientRequestOptions,
  'ip' | 'locale' | 'plainText'
>;

/** Runtime schema for profiles retained by public runtime leaves. */
export { EventProfileSchema };
export type { EventOptimizationData, EventProfile };

export type PersonalizationEventMethod = 'identify' | 'page' | 'track';
export type AnalyticsEventMethod = 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView';

/** The Optimization API surface used by the shared runtime. */
export interface EventApi {
  readonly personalization: Pick<PersonalizationApiClient, 'upsertProfile'>;
  readonly analytics: Pick<AnalyticsApiClient, 'sendBatchEvents'>;
}

/** @internal Live policy supplied by the Node request or Web event owner. */
export interface EventOwner {
  isActive: () => boolean;
  getIsPreview: () => boolean;
  getEventContext?: () => UniversalEventBuilderArgs;
  getConsent: () => ConsentState;
  getAllowedEventTypes: () => readonly AllowedEventType[] | undefined;
  reportBlockedEvent: (event: BlockedEvent) => void;
}

/** @internal Analytics policy; state remains with the leaf owner. */
export interface AnalyticsEventOwner extends EventOwner {
  getProfile: () => EventProfile | Pick<EventProfile, 'id'> | undefined;
  onMissingProfile: (method: AnalyticsEventMethod) => void;
}

/**
 * Event-triggering surface shared by the public Node and Web runtimes.
 * Profile-producing calls are not globally serialized. Prepared replay uses
 * the same Personalization transport through the Web delivery queue. A
 * Personalization call blocked by consent resolves `{ accepted: false }`; a
 * blocked Analytics call resolves `{ accepted: false }`.
 */
export interface EventMethods {
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

type PreparedEvent<TEvent> = { event: TEvent } | { result: EventEmissionResult };

function admit(owner: EventOwner, method: EventMethod, args: unknown): boolean {
  if (hasEventConsent(method, owner.getConsent(), owner.getAllowedEventTypes())) return true;
  owner.reportBlockedEvent({ reason: 'consent', method, args: [args] });
  return false;
}

function prepareEvent<TArgs extends UniversalEventBuilderArgs, TEvent>(
  owner: EventOwner,
  method: EventMethod,
  args: TArgs,
  build: (args: TArgs) => TEvent
): PreparedEvent<TEvent> {
  if (!owner.isActive()) return { result: { accepted: false } };
  if (owner.getIsPreview()) {
    owner.reportBlockedEvent({ reason: 'preview', method, args: [args] });
    return { result: { accepted: false, reason: 'preview' } };
  }
  if (!admit(owner, method, args)) return { result: { accepted: false } };
  const event = build({ ...owner.getEventContext?.(), ...args });
  // Application context providers can change consent during construction.
  if (!admit(owner, method, args)) return { result: { accepted: false } };
  return { event };
}

function stampConsent<TEvent extends PersonalizationEvent | AnalyticsEvent>(
  owner: EventOwner,
  event: TEvent
): TEvent {
  return withEventConsent(event, owner.getConsent().events === true);
}

/** @internal Shared call ordering; the leaf owns delivery, interception and final admission. */
export async function emitPersonalizationEvent<TArgs extends UniversalEventBuilderArgs>(
  owner: EventOwner,
  method: PersonalizationEventMethod,
  args: TArgs,
  build: (args: TArgs) => PersonalizationEvent,
  send: (event: PersonalizationEvent) => Promise<EventEmissionResult>
): Promise<EventEmissionResult> {
  const prepared = prepareEvent(owner, method, args, build);
  if ('result' in prepared) return prepared.result;
  return send(stampConsent(owner, prepared.event));
}

/** @internal Shared Analytics preparation with the leaf's missing-profile policy. */
export async function emitAnalyticsEvent<TArgs extends UniversalEventBuilderArgs>(
  owner: AnalyticsEventOwner,
  method: AnalyticsEventMethod,
  args: TArgs,
  build: (args: TArgs) => AnalyticsEvent,
  send: (event: AnalyticsEvent, profile: EventProfile) => Promise<void | false>
): Promise<EventEmissionResult> {
  const prepared = prepareEvent(owner, method, args, build);
  if ('result' in prepared) return prepared.result;
  const profile = EventProfileSchema.safeParse(owner.getProfile());
  if (!profile.success) {
    owner.onMissingProfile(method);
    return { accepted: false };
  }
  const admitted = await send(stampConsent(owner, prepared.event), profile.data);
  return { accepted: admitted !== false };
}
