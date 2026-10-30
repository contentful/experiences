import type { PersonalizationOptions } from './fetch-experience.js';

const EVENT_TYPES = ['page', 'track', 'identify', 'screen', 'component'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validate the envelope of caller-built events and drop what XDA rejects.
 *
 * `@contentful/experience-delivery` no longer ships request schemas (dev.11 removed
 * `./serialization`, AIS-809), so this checks the fields every event shares rather
 * than each event type's full shape.
 */
export function serializePersonalization(personalization: unknown): PersonalizationOptions {
  try {
    if (!isRecord(personalization)) throw new Error('Expected an object');
    const { profileId, events } = personalization;
    if (profileId !== undefined && typeof profileId !== 'string') {
      throw new Error('profileId must be a string');
    }
    if (events !== undefined && !Array.isArray(events)) throw new Error('events must be an array');
    return {
      ...(profileId === undefined ? {} : { profileId }),
      ...(events === undefined ? {} : { events: events.map(serializeEvent) }),
    } as PersonalizationOptions;
  } catch (cause) {
    throw new TypeError('Invalid Experience personalization options', { cause });
  }
}

function serializeEvent(event: unknown): unknown {
  if (!isRecord(event) || !EVENT_TYPES.includes(event.type as string)) {
    throw new Error('Unknown event type');
  }
  for (const key of ['channel', 'messageId', 'timestamp']) {
    if (typeof event[key] !== 'string') throw new Error(`${key} must be a string`);
  }
  if (!isRecord(event.context) || !isRecord(event.context.library)) {
    throw new Error('context.library is required');
  }
  // XDA's embedded event schema is narrower than EventBuilder's: it rejects
  // context.gdpr (consent), context.screen and context.page.title. Serialize without them.
  const { gdpr: _gdpr, screen: _screen, page, ...context } = event.context;
  if (!isRecord(page)) return { ...event, context };
  const { title: _title, ...xdaPage } = page;
  return { ...event, context: { ...context, page: xdaPage } };
}
