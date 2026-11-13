import { describe, expect, it } from 'vitest';
import {
  createPageContext,
  createEventContext,
  createRouteKey,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
} from './request-context.js';

describe('explicit Next request context', () => {
  it('normalizes encodings, preserves duplicate order, removes transport and hash', () => {
    const url = '/base/en/page?q=hello%20world&a=first&_rsc=transport&a=last#anchor';
    expect(createRouteKey(url)).toBe('/base/en/page?q=hello+world&a=first&a=last');
    expect(createRouteKey(url)).toBe(createRouteKey('/base/en/page?q=hello+world&a=first&a=last'));
    expect(
      createPageContext({
        path: '/page',
        origin: 'https://example.com',
        searchParams: { a: ['first', 'last'], _rsc: 'transport' },
      })
    ).toEqual({
      path: '/page',
      search: '?a=first&a=last&_rsc=transport',
      query: { a: ['first', 'last'], _rsc: 'transport' },
      referrer: '',
      url: 'https://example.com/page?a=first&a=last&_rsc=transport',
    });
  });

  it('preserves path/search inputs independently of an explicit unnormalized URL', () => {
    const result = createPageContext({
      path: '/supplied',
      origin: 'https://ignored.test',
      url: 'https://example.com/chosen?__proto__=safe&x=1&x=2&q=hello%20world&_rsc=transport#hash',
      searchParams: new globalThis.URLSearchParams(
        '__proto__=safe&__proto__=also-safe&x=1&x=2&q=hello%20world'
      ),
    });
    expect(result).toEqual({
      path: '/supplied',
      search: '?__proto__=safe&__proto__=also-safe&x=1&x=2&q=hello+world',
      query: JSON.parse('{"__proto__":["safe","also-safe"],"x":["1","2"],"q":"hello world"}'),
      referrer: '',
      url: 'https://example.com/chosen?__proto__=safe&x=1&x=2&q=hello%20world&_rsc=transport#hash',
    });
  });

  it('preserves explicit path and URL verbatim even when they cannot be parsed as URLs', () => {
    expect(createPageContext({ path: 'route/../page', url: 'http://[invalid' })).toEqual({
      path: 'route/../page',
      search: '',
      query: {},
      referrer: '',
      url: 'http://[invalid',
    });
    expect(
      createPageContext({ path: '/page', searchParams: { omitted: undefined, empty: [] } })
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
        createEventContext({
          ...(source === 'request' ? { request: { url, headers } } : { headers }),
        })
      ).toEqual({
        page: {
          path: '/base/en/page',
          search: '?q=hello%20world&a=first&_rsc=x&a=last',
          query: { q: 'hello world', a: ['first', 'last'], _rsc: 'x' },
          referrer: 'https://referrer.test',
          url: 'https://example.com/base/en/page?q=hello%20world&a=first&_rsc=x&a=last#hash',
        },
        userAgent: 'browser',
      });
    }
  );

  it('does not restore request headers removed by explicit empty headers', () => {
    expect(
      createEventContext({
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

  it.each(['request', 'event'] as const)(
    'inherits omitted page fields from %s context while honoring explicit overrides',
    (source) => {
      const options = {
        request: {
          url: 'https://example.com/request?a=1',
          headers: new globalThis.Headers({ 'user-agent': 'old', referer: 'old' }),
        },
        headers: new globalThis.Headers({
          'user-agent': 'effective',
          referer: 'https://referrer.test',
          'x-forwarded-for': 'untrusted',
        }),
        eventContext: {
          locale: 'fr',
          userAgent: 'explicit',
          ...(source === 'event'
            ? {
                page: createPageContext({
                  path: '/event',
                  origin: 'https://event.test',
                  referrer: 'https://event-referrer.test',
                }),
              }
            : {}),
        },
        locale: 'de',
        page: { path: '/explicit', searchParams: { q: 'x', utm_source: 'email' } },
      };
      const result = createEventContext(options);
      expect(result).toMatchObject({
        locale: 'de',
        userAgent: 'explicit',
        page: {
          path: '/explicit',
          search: '?q=x&utm_source=email',
          query: { q: 'x', utm_source: 'email' },
          referrer: source === 'event' ? 'https://event-referrer.test' : 'https://referrer.test',
          url: `${source === 'event' ? 'https://event.test' : 'https://example.com'}/explicit?q=x&utm_source=email`,
        },
      });
      expect(result).not.toHaveProperty('ip');
      expect(
        createEventContext({
          ...options,
          page: { ...options.page, origin: 'https://override.test', referrer: '' },
        }).page
      ).toMatchObject({
        url: 'https://override.test/explicit?q=x&utm_source=email',
        referrer: '',
      });
      expect(
        createEventContext({
          ...options,
          page: { ...options.page, origin: 'https://ignored.test', url: 'http://[invalid' },
        }).page?.url
      ).toBe('http://[invalid');
    }
  );

  it('derives forwarded URL only from explicit supplied headers', () => {
    expect(
      createEventContext({
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
    expect(createEventContext({})).toEqual({});
  });
});
