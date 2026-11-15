import { afterEach, describe, expect, inject, it } from 'vitest';
import { getPageProperties, getUserAgent } from './event-context.js';

describe.runIf(inject('webTestEnvironment') === 'browser')('getPageProperties in a browser', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('maps a query key that appears once to its value', () => {
    window.history.replaceState({}, '', '/pricing?utm_source=newsletter');

    expect(getPageProperties().query).toEqual({ utm_source: 'newsletter' });
  });

  it('keeps every value of a repeated query key, in order', () => {
    window.history.replaceState({}, '', '/shop?tag=a&tag=b&sort=asc&tag=c');

    expect(getPageProperties().query).toEqual({ tag: ['a', 'b', 'c'], sort: 'asc' });
  });

  it('keeps a __proto__ query key as a plain entry', () => {
    window.history.replaceState({}, '', '/?__proto__=a&__proto__=b&tag=c');

    const { query } = getPageProperties();

    expect(Object.getPrototypeOf(query)).toBe(Object.prototype);
    expect(Object.entries(query)).toEqual([
      ['__proto__', ['a', 'b']],
      ['tag', 'c'],
    ]);
  });

  it('returns an empty query when the URL has none', () => {
    window.history.replaceState({}, '', '/');

    expect(getPageProperties().query).toEqual({});
  });
});

describe.runIf(inject('webTestEnvironment') === 'node')('event context in Node', () => {
  it('returns safe page and user-agent fallbacks without browser globals', () => {
    expect(getPageProperties()).toEqual({
      path: '',
      query: {},
      referrer: '',
      search: '',
      title: '',
      url: '',
    });
    expect(getUserAgent()).toBeUndefined();
  });
});
