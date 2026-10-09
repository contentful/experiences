import { describe, expect, it } from 'vitest';
import EventBuilder, { DEFAULT_PAGE_PROPERTIES } from './event-builder.js';
import { buildPreparedEvents, validatePreparedEvents } from './prepared-events.js';

const builder = new EventBuilder({
  channel: 'server',
  library: { name: '@contentful/experiences-node', version: 'test' },
});

describe('validatePreparedEvents', () => {
  it('accepts an ordered identify/track prefix and one final page without changing the built data', () => {
    const events = [
      builder.buildIdentify({ userId: 'visitor', locale: 'de-DE' }),
      builder.buildTrack({ event: 'opened', locale: 'de-DE' }),
      builder.buildPageView({ locale: 'de-DE' }),
    ];

    const parsed = validatePreparedEvents(events);

    expect(parsed.map((event) => event.messageId)).toEqual(events.map((event) => event.messageId));
    expect(parsed.map((event) => event.context.locale)).toEqual(['de-DE', 'de-DE', 'de-DE']);
    expect(parsed.map((event) => event.type)).toEqual(['identify', 'track', 'page']);
    expect(validatePreparedEvents([builder.buildPageView()])).toHaveLength(1);
  });

  it('accepts the single-profile limits and rejects the next event', () => {
    const identify = builder.buildIdentify({ userId: 'visitor' });
    const track = builder.buildTrack({ event: 'opened' });
    const page = builder.buildPageView();

    expect(
      validatePreparedEvents([...Array(50).fill(identify), ...Array(149).fill(track), page])
    ).toHaveLength(200);
    expect(() => validatePreparedEvents([...Array(200).fill(track), page])).toThrow(
      'within the single-profile request limits'
    );
    expect(() => validatePreparedEvents([...Array(51).fill(identify), page])).toThrow(
      'within the single-profile request limits'
    );
  });

  it('rejects missing, misplaced, and non-Personalization events', () => {
    const page = builder.buildPageView();
    const track = builder.buildTrack({ event: 'opened' });

    expect(() => validatePreparedEvents([])).toThrow('one page');
    expect(() => validatePreparedEvents([track])).toThrow('one page');
    expect(() => validatePreparedEvents([page, track])).toThrow('one page');
    expect(() => validatePreparedEvents([page, page])).toThrow('one page');
    expect(() =>
      validatePreparedEvents([
        builder.buildClick({ entityId: 'hero', entityKind: 'Experience' }),
        page,
      ])
    ).toThrow();
    expect(() => validatePreparedEvents([{ type: 'page' }])).toThrow();
  });
});

describe('buildPreparedEvents', () => {
  it('captures context, page properties, consent metadata, and event identity once', () => {
    const events = buildPreparedEvents({
      eventBuilder: builder,
      eventContext: {
        locale: 'de-DE',
        page: { ...DEFAULT_PAGE_PROPERTIES, path: '/home', url: 'https://example.com/home' },
      },
      initialEvents: [
        { type: 'identify', userId: 'visitor' },
        { type: 'track', event: 'opened', locale: 'fr-FR' },
      ],
      page: { properties: { title: 'Home' } },
      eventConsent: true,
    });

    expect(events.map(({ type }) => type)).toEqual(['identify', 'track', 'page']);
    expect(events.map(({ context }) => context.locale)).toEqual(['de-DE', 'fr-FR', 'de-DE']);
    expect(events.map(({ context }) => context.gdpr?.isConsentGiven)).toEqual([true, true, true]);
    expect(new Set(events.map(({ messageId }) => messageId)).size).toBe(3);
    expect(events[2]).toMatchObject({
      properties: { path: '/home', url: 'https://example.com/home', title: 'Home' },
    });
  });

  it('keeps denied-consent metadata on prepared events without treating it as a permission gate', () => {
    const events = buildPreparedEvents({ eventBuilder: builder, eventConsent: false });
    expect(events).toHaveLength(1);
    expect(events[0]?.context.gdpr?.isConsentGiven).toBe(false);
  });

  it('rejects an invalid initial event rather than preparing a partial prefix', () => {
    expect(() =>
      buildPreparedEvents({
        eventBuilder: builder,
        initialEvents: [{ type: 'page' } as never],
      })
    ).toThrow('identify or track');
  });
});
