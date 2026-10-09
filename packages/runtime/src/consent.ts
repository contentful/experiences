import type {
  ExperienceEvent as PersonalizationEvent,
  InsightsEvent as AnalyticsEvent,
} from '@contentful/optimization-api-client/api-schemas';

/** LocalStorage key for the persisted consent state. @internal */
export const CONSENT_CACHE_KEY = '__ctfl_opt_consent__';

/** Wire event types the runtime can emit. */
export type EventType = (PersonalizationEvent | AnalyticsEvent)['type'];

/**
 * Selectors accepted by `allowedEventTypes`. `flag` narrows `trackFlagView`
 * admission without admitting every `component` view event.
 */
export type AllowedEventType = EventType | 'flag';

/** Event types emitted while event consent is not granted, matching the Optimization SDK. */
export const DEFAULT_ALLOWED_EVENT_TYPES: readonly AllowedEventType[] = ['identify', 'page'];

/** Event methods subject to the consent gate. */
export type EventMethod =
  'identify' | 'page' | 'track' | 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView';

/**
 * Consent decisions. `undefined` means undecided and is treated as not granted.
 *
 * @public
 */
export interface ConsentState {
  /** Whether events outside `allowedEventTypes` may be emitted. */
  events?: boolean;
  /** Whether the profile (and consent) may be persisted across sessions. */
  persistence?: boolean;
}

/**
 * Consent accepted by `consent()`. A boolean sets event and persistence consent
 * together; an object updates either axis independently.
 */
export type ConsentInput = boolean | ConsentState;

/** Why an event was dropped at the SDK boundary. Blocked events are never replayed. */
export interface BlockedEvent {
  reason: 'consent';
  method: EventMethod;
  args: readonly unknown[];
}

/** Resolves a {@link ConsentInput} to the axes it sets. */
export function toConsentState(input: ConsentInput): ConsentState {
  if (typeof input === 'boolean') return { events: input, persistence: input };
  const state: ConsentState = {};
  if (input.events !== undefined) state.events = input.events;
  if (input.persistence !== undefined) state.persistence = input.persistence;
  return state;
}

/** Whether `method` may emit under `consent`, mirroring the Optimization SDK's method mapping. */
export function hasEventConsent(
  method: EventMethod,
  consent: ConsentState | undefined,
  allowedEventTypes: readonly AllowedEventType[] = DEFAULT_ALLOWED_EVENT_TYPES
): boolean {
  if (consent?.events === true) return true;

  switch (method) {
    case 'trackView':
      return allowedEventTypes.includes('component');
    case 'trackFlagView':
      return allowedEventTypes.includes('flag') || allowedEventTypes.includes('component');
    case 'trackClick':
      return allowedEventTypes.includes('component_click');
    case 'trackHover':
      return allowedEventTypes.includes('component_hover');
    default:
      return allowedEventTypes.includes(method);
  }
}

/**
 * Wire event types mapped to the method that emits them. Replayed handoffs and
 * caller-built XDA events carry only the wire type, so the gate needs this to
 * apply the same rules as a direct method call.
 */
const METHOD_BY_EVENT_TYPE: Readonly<Partial<Record<string, EventMethod>>> = {
  identify: 'identify',
  page: 'page',
  track: 'track',
  exo_node_view: 'trackView',
  exo_node_click: 'trackClick',
  exo_node_hover: 'trackHover',
  component: 'trackFlagView',
};

/**
 * The method that emits wire event `type`, or `undefined` for a type this SDK
 * does not emit (for example `screen`, which only exists for caller-built events).
 */
export function methodForEventType(type: string): EventMethod | undefined {
  return METHOD_BY_EVENT_TYPE[type];
}

/**
 * Whether an already-built event of wire `type` may be emitted. Unknown types
 * fail closed unless explicitly listed in `allowedEventTypes`.
 */
export function hasEventTypeConsent(
  type: string,
  consent: ConsentState | undefined,
  allowedEventTypes: readonly AllowedEventType[] = DEFAULT_ALLOWED_EVENT_TYPES
): boolean {
  const method = methodForEventType(type);
  if (method !== undefined) return hasEventConsent(method, consent, allowedEventTypes);
  if (consent?.events === true) return true;
  return allowedEventTypes.some((allowed) => allowed === type);
}

/** Parses a persisted consent value, ignoring anything malformed. */
export function parseConsentState(value: unknown): ConsentState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { events, persistence } = value as Record<string, unknown>;
  const state: ConsentState = {};
  if (typeof events === 'boolean') state.events = events;
  if (typeof persistence === 'boolean') state.persistence = persistence;
  return state;
}
