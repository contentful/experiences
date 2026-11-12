import { describe, expect, it } from 'vitest';
import { serializePersonalization } from './personalization.js';

const page = {
  path: '/',
  query: { q: 'search', tag: ['a', 'b'] },
  referrer: '',
  search: '?tag=a&tag=b',
  url: 'https://example.com/',
};
const base = {
  channel: 'web',
  messageId: 'message-1',
  timestamp: '2026-11-04T00:00:00.000Z',
  originalTimestamp: '2026-11-04T00:00:00.000Z',
  sentAt: '2026-11-04T00:00:00.000Z',
  context: {
    campaign: {},
    library: { name: 'caller', version: '1' },
    page: { ...page, title: 'Home' },
    gdpr: { isConsentGiven: true },
  },
};
const events = [
  { ...base, type: 'page', properties: { ...page, title: 'Home' } },
  { ...base, type: 'track', event: 'Purchased', properties: { amount: 1 } },
  { ...base, type: 'identify', userId: 'user-1', traits: { interests: ['a'] } },
  {
    ...base,
    type: 'screen',
    name: 'Home',
    context: { ...base.context, screen: { name: 'Home' } },
    properties: { extra: true },
  },
  { ...base, type: 'component', componentId: 'component-1', componentType: 'Entry' },
];

describe('serializePersonalization', () => {
  it('preserves all generated event variants, query arrays and caller-owned context', () => {
    const input = { profileId: 'profile-1', events, extra: { caller: true } };
    const before = globalThis.structuredClone(input);
    const output = serializePersonalization(input);
    expect(output).toEqual(input);
    expect(input).toEqual(before);
    expect(output).not.toBe(input);
    expect(output.events).not.toBe(input.events);
    expect(output.events?.[0]?.context).not.toBe(input.events[0]?.context);
  });

  it.each([{ profileId: 123 }, { preflight: null }, { preflight: 'false' }, { preflight: 0 }])(
    'rejects invalid personalization options %j',
    (input) => {
      expect(() => serializePersonalization(input)).toThrow(
        new TypeError('Invalid Experience personalization options')
      );
    }
  );

  it.each([
    { ...events[0], properties: { ...page, query: { tag: [1] } } },
    { ...events[0], properties: { ...page, url: undefined } },
    { ...events[1], event: undefined },
    { ...events[2], traits: undefined },
    { ...events[2], userId: 1 },
    { ...events[3], name: undefined },
    { ...events[4], componentType: 'Unknown' },
    { ...events[4], componentId: undefined },
    { ...events[4], variantIndex: '1' },
    { ...events[0], channel: 'unknown' },
    { ...events[0], context: { ...base.context, library: { name: 'caller' } } },
    { ...events[0], context: { ...base.context, app: { name: 'app' } } },
    { ...events[0], context: { ...base.context, campaign: { source: 1 } } },
    { ...events[0], context: { ...base.context, location: { coordinates: { latitude: 1 } } } },
    { ...events[0], context: { ...base.context, gdpr: { isConsentGiven: 'yes' } } },
    { ...events[0], context: { ...base.context, page: { ...page, title: 1 } } },
  ])('rejects invalid generated fields %#', (event) => {
    expect(() => serializePersonalization({ events: [event] })).toThrow(
      new TypeError('Invalid Experience personalization options')
    );
  });
});
