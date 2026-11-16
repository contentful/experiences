import { describe, expect, it } from 'vitest';
import EventBuilder from './event-builder.js';
import { validatePreparedEvents, withEventConsent } from './prepared-events.js';

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

    expect(parsed).toEqual(events);
    expect(parsed.map((event) => event.messageId)).toEqual(events.map((event) => event.messageId));
    expect(parsed.map((event) => event.context.locale)).toEqual(['de-DE', 'de-DE', 'de-DE']);
    expect(parsed.map((event) => event.type)).toEqual(['identify', 'track', 'page']);
    expect(validatePreparedEvents([builder.buildPageView()])).toHaveLength(1);
  });

  it('accepts the SDK handoff limits and rejects the next event', () => {
    const identify = builder.buildIdentify({ userId: 'visitor' });
    const track = builder.buildTrack({ event: 'opened' });
    const page = builder.buildPageView();

    expect(
      validatePreparedEvents([...Array(50).fill(identify), ...Array(49).fill(track), page])
    ).toHaveLength(100);
    expect(validatePreparedEvents(Array(100).fill(track))).toHaveLength(100);
    expect(
      validatePreparedEvents([...Array(50).fill(identify), ...Array(50).fill(track)])
    ).toHaveLength(100);
    expect(() => validatePreparedEvents(Array(101).fill(track))).toThrow(
      'within the SDK handoff limits'
    );
    expect(() => validatePreparedEvents(Array(51).fill(identify))).toThrow(
      'within the SDK handoff limits'
    );
    expect(() => validatePreparedEvents([...Array(100).fill(track), page])).toThrow(
      'within the SDK handoff limits'
    );
    expect(() => validatePreparedEvents([...Array(51).fill(identify), page])).toThrow(
      'within the SDK handoff limits'
    );
  });

  it('accepts identify-only, track-only and mixed batches without inventing a page', () => {
    const identify = builder.buildIdentify({ userId: 'visitor' });
    const track = builder.buildTrack({ event: 'opened' });

    for (const events of [[identify], [track], [identify, track], [track, identify]]) {
      expect(validatePreparedEvents(events)).toEqual(events);
    }
  });

  it('rejects empty batches and duplicate or nonfinal pages', () => {
    const page = builder.buildPageView();
    const track = builder.buildTrack({ event: 'opened' });

    expect(() => validatePreparedEvents([])).toThrow('final page');
    expect(() => validatePreparedEvents([page, track])).toThrow('final page');
    expect(() => validatePreparedEvents([page, page])).toThrow('final page');
    expect(() => validatePreparedEvents([track, page, page])).toThrow('final page');
  });

  it('preserves exact finalized event bodies and leaves frozen input unchanged', () => {
    const event = withEventConsent(
      builder.buildTrack({
        event: 'opened',
        locale: 'de-DE',
        properties: { nested: { campaign: 'spring' } },
      }),
      true
    );
    const before = globalThis.structuredClone(event);
    Object.freeze(event.context.gdpr);
    Object.freeze(event.context.library);
    Object.freeze(event.context);
    Object.freeze(event.properties);
    Object.freeze(event);
    const events = Object.freeze([event]);

    const parsed = validatePreparedEvents(events);

    expect(parsed).toEqual([before]);
    expect(events).toEqual([before]);
    expect(parsed).not.toBe(events);
    expect(parsed[0]).not.toBe(event);
    expect(parsed[0]?.context).not.toBe(event.context);
  });

  it('rejects malformed and unsupported event types', () => {
    for (const event of [
      null,
      { type: 'track' },
      { ...builder.buildTrack({ event: 'opened' }), context: { locale: 42 } },
      { ...builder.buildTrack({ event: 'opened' }), type: 'group' },
      builder.buildFlagView({ componentId: 'feature', experienceId: 'experience' }),
    ]) {
      expect(() => validatePreparedEvents([event])).toThrow();
    }
  });

  it('rejects schema transformations instead of silently changing evaluated bodies', () => {
    const events = [{ ...builder.buildTrack({ event: 'opened' }), unexpected: 'evaluated' }];
    const before = globalThis.structuredClone(events);

    expect(() => validatePreparedEvents(events)).toThrow(
      'cannot change the evaluated event bodies'
    );
    expect(events).toEqual(before);
  });
});

describe('withEventConsent', () => {
  it('copies consent metadata without changing the caller event', () => {
    const event = withEventConsent(builder.buildIdentify({ userId: 'visitor' }), false);
    const before = globalThis.structuredClone(event);
    const received = withEventConsent(event, true);

    expect(received).toEqual({
      ...before,
      context: { ...before.context, gdpr: { isConsentGiven: true } },
    });
    expect(event).toEqual(before);
    expect(received.context).not.toBe(event.context);
    expect(received.context.gdpr).not.toBe(event.context.gdpr);
  });
});
