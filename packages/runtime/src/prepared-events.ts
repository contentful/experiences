import {
  ExperienceEventArray as PersonalizationEventArray,
  type ExperienceEvent as PersonalizationEvent,
} from '@contentful/optimization-api-client/api-schemas';
import { isEqual } from 'es-toolkit/predicate';

/** SDK handoff and browser queue capacity, not an API request limit. */
export const MAX_PREPARED_EVENTS = 100;
const MAX_IDENTIFY_EVENTS = 50;

/** Event types permitted in a finalized evaluated replay. */
export type PreparedExperienceEvent = Extract<
  PersonalizationEvent,
  { type: 'identify' | 'track' | 'page' }
>;

/** Copy an event with the receiving owner's event-consent metadata. */
export function withEventConsent<
  TEvent extends { context: { library: unknown; gdpr?: { isConsentGiven: boolean } } },
>(event: TEvent, isConsentGiven: boolean): TEvent {
  return {
    ...event,
    context: { ...event.context, gdpr: { ...event.context?.gdpr, isConsentGiven } },
  };
}

/** Validate one prepared Personalization batch without rebuilding its events. */
export function validatePreparedEvents(
  events: readonly unknown[]
): readonly PreparedExperienceEvent[] {
  const validEvents = PersonalizationEventArray.parse(events);
  if (
    validEvents.length > MAX_PREPARED_EVENTS ||
    validEvents.filter(({ type }) => type === 'identify').length > MAX_IDENTIFY_EVENTS ||
    validEvents.length === 0 ||
    validEvents.some(({ type }, index) =>
      type === 'page' ? index !== validEvents.length - 1 : type !== 'identify' && type !== 'track'
    )
  ) {
    throw new TypeError(
      'A replay requires a nonempty identify/track batch with at most one final page, within the SDK handoff limits.'
    );
  }
  if (!isEqual(validEvents, events)) {
    throw new TypeError('Prepared replay cannot change the evaluated event bodies');
  }
  return validEvents as readonly PreparedExperienceEvent[];
}
