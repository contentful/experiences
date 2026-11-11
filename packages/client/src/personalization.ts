import {
  IdentifyEvent,
  PageViewEvent,
  ScreenViewEvent,
  TrackEvent,
  ViewEvent,
} from '@contentful/optimization-api-client/api-schemas';
import * as z from 'zod/mini';
import type { PersonalizationOptions } from './fetch-experience.js';

// XDA supports these Personalization variants, but not exo_node_view.
const eventSchema = z.union([IdentifyEvent, PageViewEvent, ScreenViewEvent, TrackEvent, ViewEvent]);
const personalizationSchema = z.object({
  profileId: z.optional(z.string()),
  events: z.optional(z.array(eventSchema)),
  preflight: z.optional(z.boolean()),
});

type Event = z.infer<typeof eventSchema>;
type XdaEvent = NonNullable<PersonalizationOptions['events']>[number];
const containsNull = (value: unknown): boolean =>
  value === null ||
  (typeof value === 'object' && Object.values(value).some((item) => containsNull(item)));

function isXdaEvent(event: Event): event is Event & XdaEvent {
  const values =
    event.type === 'identify'
      ? event.traits
      : event.type === 'track' || event.type === 'screen'
        ? event.properties
        : undefined;
  // Optimization permits null JSON leaves; XDA's generated property contract does not.
  return !containsNull(values);
}

/** Validate caller-built events with the canonical Personalization schemas. */
export function serializePersonalization(personalization: unknown): PersonalizationOptions {
  try {
    const { events: parsedEvents, ...valid } = personalizationSchema.parse(personalization);
    const events = parsedEvents?.map((event) => {
      if (!isXdaEvent(event))
        throw new TypeError('XDA event properties and traits cannot contain null');
      return event;
    });
    return { ...valid, ...(events === undefined ? {} : { events }) };
  } catch (cause) {
    throw new TypeError('Invalid Experience personalization options', { cause });
  }
}
