import { afterEach, describe, expect, it } from 'vitest';
import { getPageProperties } from './browser-event-context.js';

describe('getPageProperties', () => {
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

  it('returns an empty query when the URL has none', () => {
    window.history.replaceState({}, '', '/');

    expect(getPageProperties().query).toEqual({});
  });
});
