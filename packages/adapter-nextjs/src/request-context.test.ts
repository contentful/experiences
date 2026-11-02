import { describe, expect, it } from 'vitest';
import {
  createNextjsPageContext,
  createNextjsRequestContext,
  createNextjsRouteKey,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
} from './request-context.js';

describe('explicit Next request context', () => {
  it('normalizes encodings, preserves duplicate order, removes transport and hash', () => {
    const url = '/base/en/page?q=hello%20world&a=first&_rsc=transport&a=last#anchor';
    expect(createNextjsRouteKey(url)).toBe('/base/en/page?q=hello+world&a=first&a=last');
    expect(createNextjsRouteKey(url)).toBe(
      createNextjsRouteKey('/base/en/page?q=hello+world&a=first&a=last')
    );
    expect(
      createNextjsPageContext({
        path: '/page',
        origin: 'https://example.com',
        searchParams: { a: ['first', 'last'], _rsc: 'transport' },
      })
    ).toEqual({
      path: '/page',
      search: '?a=first&a=last&_rsc=transport',
      query: { a: 'last', _rsc: 'transport' },
      referrer: '',
      url: 'https://example.com/page?a=first&a=last&_rsc=transport',
    });
  });

  it('preserves path/search inputs independently of an explicit unnormalized URL', () => {
    const result = createNextjsPageContext({
      path: '/supplied',
      origin: 'https://ignored.test',
      url: 'https://example.com/chosen?__proto__=safe&x=1&x=2&q=hello%20world&_rsc=transport#hash',
      searchParams: new globalThis.URLSearchParams('__proto__=safe&x=1&x=2&q=hello%20world'),
    });
    expect(result).toEqual({
      path: '/supplied',
      search: '?__proto__=safe&x=1&x=2&q=hello+world',
      query: JSON.parse('{"__proto__":"safe","x":"2","q":"hello world"}'),
      referrer: '',
      url: 'https://example.com/chosen?__proto__=safe&x=1&x=2&q=hello%20world&_rsc=transport#hash',
    });
  });

  it('preserves explicit path and URL verbatim even when they cannot be parsed as URLs', () => {
    expect(createNextjsPageContext({ path: 'route/../page', url: 'http://[invalid' })).toEqual({
      path: 'route/../page',
      search: '',
      query: {},
      referrer: '',
      url: 'http://[invalid',
    });
    expect(
      createNextjsPageContext({ path: '/page', searchParams: { omitted: undefined, empty: [] } })
    ).toEqual({
      path: '/page',
      search: '',
      query: {},
      referrer: '',
      url: '/page',
    });
  });

  it.each(['request', 'forwarded'] as const)(
    'preserves raw %s URL semantics in derived page context',
    (source) => {
      const url = 'https://EXAMPLE.com/base/en/page?q=hello%20world&a=first&_rsc=x&a=last#hash';
      const headers = new globalThis.Headers({
        referer: 'https://referrer.test',
        'user-agent': 'browser',
        [NEXTJS_EXPERIENCES_REQUEST_URL_HEADER]: url,
      });
      expect(
        createNextjsRequestContext({
          ...(source === 'request' ? { request: { url, headers } } : { headers }),
        })
      ).toEqual({
        page: {
          path: '/base/en/page',
          search: '?q=hello%20world&a=first&_rsc=x&a=last',
          query: { q: 'hello world', a: 'last', _rsc: 'x' },
          referrer: 'https://referrer.test',
          url: 'https://example.com/base/en/page?q=hello%20world&a=first&_rsc=x&a=last#hash',
        },
        userAgent: 'browser',
      });
    }
  );

  it('does not restore request headers removed by explicit empty headers', () => {
    expect(
      createNextjsRequestContext({
        request: {
          url: 'https://example.com/request',
          headers: new globalThis.Headers({ referer: 'old', 'user-agent': 'old' }),
        },
        headers: new globalThis.Headers(),
      })
    ).toEqual({
      page: {
        path: '/request',
        search: '',
        query: {},
        referrer: '',
        url: 'https://example.com/request',
      },
    });
  });

  it('layers explicit context over derived context without trusting proxy IP headers', () => {
    const result = createNextjsRequestContext({
      request: {
        url: 'https://example.com/request?a=1',
        headers: new globalThis.Headers({ 'user-agent': 'old', referer: 'old' }),
      },
      headers: new globalThis.Headers({
        'user-agent': 'effective',
        'x-forwarded-for': 'untrusted',
      }),
      eventContext: {
        locale: 'fr',
        userAgent: 'explicit',
        page: createNextjsPageContext({ path: '/event' }),
      },
      locale: 'de',
      page: { path: '/explicit', searchParams: { q: 'x' } },
    });
    expect(result).toMatchObject({
      locale: 'de',
      userAgent: 'explicit',
      page: { path: '/explicit', query: { q: 'x' } },
    });
    expect(result).not.toHaveProperty('ip');
  });

  it('derives forwarded URL only from explicit supplied headers', () => {
    expect(
      createNextjsRequestContext({
        headers: new globalThis.Headers({
          [NEXTJS_EXPERIENCES_REQUEST_URL_HEADER]: 'https://example.com/forwarded?_rsc=x&q=y#z',
        }),
      }).page
    ).toEqual({
      path: '/forwarded',
      search: '?_rsc=x&q=y',
      query: { _rsc: 'x', q: 'y' },
      url: 'https://example.com/forwarded?_rsc=x&q=y#z',
      referrer: '',
    });
    expect(createNextjsRequestContext({})).toEqual({});
  });
});
