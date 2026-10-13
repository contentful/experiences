import {
  ExperienceEventArray,
  type ExperienceEvent,
  type InsightsEvent,
} from '@contentful/optimization-api-client/api-schemas';
import type EventBuilder from './event-builder.js';
import type {
  IdentifyBuilderArgs,
  PageViewBuilderArgs,
  TrackBuilderArgs,
  UniversalEventBuilderArgs,
} from './event-builder.js';

/** SDK handoff and browser queue capacity, not an API request limit. */
export const MAX_PREPARED_EVENTS = 100;
const MAX_IDENTIFY_EVENTS = 50;

export type InitialPersonalizationEvent =
  | ({ readonly type: 'identify' } & IdentifyBuilderArgs)
  | ({ readonly type: 'track' } & TrackBuilderArgs);

export interface BuildPreparedEventsOptions {
  readonly eventBuilder: EventBuilder;
  readonly initialEvents?: readonly InitialPersonalizationEvent[];
  readonly page?: PageViewBuilderArgs;
  readonly eventContext?: UniversalEventBuilderArgs;
  /** Existing request event-consent metadata; this does not gate event delivery. */
  readonly eventConsent?: boolean;
}

/** Change only GDPR metadata on an already-built event. */
export function withEventConsent<TEvent extends ExperienceEvent | InsightsEvent>(
  event: TEvent,
  isConsentGiven: boolean
): TEvent {
  return {
    ...event,
    context: { ...event.context, gdpr: { ...event.context.gdpr, isConsentGiven } },
  };
}

/** Validate one prepared Personalization batch without rebuilding its events. */
export function validatePreparedEvents(events: readonly unknown[]): readonly ExperienceEvent[] {
  const validEvents = ExperienceEventArray.parse(events);
  if (
    validEvents.length > MAX_PREPARED_EVENTS ||
    validEvents.filter(({ type }) => type === 'identify').length > MAX_IDENTIFY_EVENTS ||
    validEvents.at(-1)?.type !== 'page' ||
    validEvents.slice(0, -1).some(({ type }) => type !== 'identify' && type !== 'track')
  ) {
    throw new TypeError(
      'A handoff requires identify/track events followed by one page, within the SDK handoff limits.'
    );
  }
  return validEvents;
}

/** Build each event once, then validate the complete Personalization batch. */
export function buildPreparedEvents({
  eventBuilder,
  initialEvents = [],
  page = {},
  eventContext = {},
  eventConsent,
}: BuildPreparedEventsOptions): readonly ExperienceEvent[] {
  const events: ExperienceEvent[] = [];
  for (const input of initialEvents) {
    const { type, ...args } = input;
    if (type === 'identify') {
      events.push(eventBuilder.buildIdentify({ ...eventContext, ...args } as IdentifyBuilderArgs));
    } else if (type === 'track') {
      events.push(eventBuilder.buildTrack({ ...eventContext, ...args } as TrackBuilderArgs));
    } else {
      throw new TypeError('Initial handoff events must be identify or track inputs');
    }
  }

  events.push(
    eventBuilder.buildPageView({
      ...eventContext,
      ...page,
      properties: { ...eventContext.page, ...page.properties },
    })
  );

  return validatePreparedEvents(
    eventConsent === undefined
      ? events
      : events.map((event) => withEventConsent(event, eventConsent))
  );
}
