import { describe, expect, it, vi } from 'vitest';
import { buildAutoPagePayload, composePagePayload } from './page-payload.js';

describe('page payload composition', () => {
  it('merges nested records in router, static, dynamic order without changing inputs', () => {
    const router = { properties: { path: '/products', query: { tab: 'featured', sort: 'name' } } };
    const pagePayload = {
      properties: {
        title: 'Products',
        campaign: { source: 'email', details: { season: 'spring', placement: 'banner' } },
        query: { tab: 'static' },
      },
    };
    const dynamic = {
      locale: 'de-DE',
      properties: {
        query: { tab: 'dynamic' },
        campaign: { details: { placement: 'header' } },
      },
    };
    const originals = globalThis.structuredClone({ router, pagePayload, dynamic });
    const context = {
      context: { pathname: '/products' },
      routeKey: '/products',
      isInitialEmission: false,
    };
    const getPagePayload = vi.fn(() => dynamic);
    expect(buildAutoPagePayload(router, { pagePayload, getPagePayload }, context)).toEqual({
      locale: 'de-DE',
      properties: {
        path: '/products',
        title: 'Products',
        query: { tab: 'dynamic', sort: 'name' },
        campaign: { source: 'email', details: { season: 'spring', placement: 'header' } },
      },
    });
    expect(getPagePayload).toHaveBeenCalledExactlyOnceWith(context);
    expect({ router, pagePayload, dynamic }).toEqual(originals);
  });

  it('skips absent layers and replaces non-record values, including arrays and explicit undefined', () => {
    expect(composePagePayload(undefined, undefined)).toEqual({});
    expect(
      composePagePayload(
        { locale: 'en-US', properties: { labels: ['old'], campaign: { source: 'email' } } },
        undefined,
        { locale: undefined, properties: { labels: ['new'], campaign: null } }
      )
    ).toEqual({ locale: undefined, properties: { labels: ['new'], campaign: null } });
  });
});
