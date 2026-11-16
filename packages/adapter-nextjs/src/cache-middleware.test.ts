import { expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server.js';
import { createNextjsPublicPermutationCacheMiddleware } from './cache-middleware.js';
import { createNextjsExperiencesContextHandler } from './request-handler.js';

const cache = {
  scope: 'public-permutation' as const,
  key: 'revision/locale/selection',
  tags: ['content:home'],
};

it.each(['cache-only', 'context-first', 'cache-first'] as const)(
  'rewrites an approved key with sanitized context and retained response data (%s)',
  async (order) => {
    const request = new NextRequest('https://example.com/home?x=1&tag=one&tag=two&_rsc=transport', {
      headers: {
        cookie: 'visitor=old',
        'x-ctfl-exp-request-url': 'spoofed',
        'x-ctfl-exp-profile': 'spoofed',
      },
    });
    const response = NextResponse.next({
      request: {
        headers: new globalThis.Headers({
          'x-host': 'kept',
          'x-ctfl-exp-request-url': 'spoofed',
          'x-ctfl-exp-profile': 'spoofed',
        }),
      },
    });
    response.headers.set('vary', 'RSC');
    response.cookies.set('host', 'value');
    const middleware = createNextjsPublicPermutationCacheMiddleware({ resolveCache: () => cache });
    const handler = createNextjsExperiencesContextHandler();
    if (order === 'context-first') expect(await handler(request, response)).toBe(response);
    expect(await middleware(request, response)).toBe(response);
    if (order === 'cache-first') expect(await handler(request, response)).toBe(response);
    expect(
      new URL(response.headers.get('x-middleware-rewrite')!).searchParams.get('ctfl-exp-cache-key')
    ).toBe(cache.key);
    expect(response.headers.get('x-middleware-request-x-host')).toBe('kept');
    expect(response.headers.has('x-middleware-request-cookie')).toBe(false);
    expect(response.headers.get('x-middleware-request-x-ctfl-exp-request-url')).toBe(
      'https://example.com/home?x=1&tag=one&tag=two'
    );
    expect(response.headers.has('x-middleware-request-x-ctfl-exp-profile')).toBe(false);
    expect(response.headers.get('vary')).toBe('RSC');
    expect(response.cookies.get('host')?.value).toBe('value');
  }
);

it.each([false, true])(
  'continues without rewriting when no cache is selected (response: %s)',
  async (existing) => {
    const request = new NextRequest('https://example.com/home');
    const response = existing ? NextResponse.next() : undefined;
    const middleware = createNextjsPublicPermutationCacheMiddleware({
      resolveCache: () => undefined,
    });
    const result = await middleware(request, response);
    if (response) expect(result).toBe(response);
    expect(result.headers.get('x-middleware-next')).toBe('1');
    expect(result.headers.has('x-middleware-rewrite')).toBe(false);
  }
);

it('uses the pinned custom rewrite convention and preserves terminal responses', async () => {
  const request = new NextRequest('https://example.com/home');
  const resolveCache = vi.fn(() => cache);
  const middleware = createNextjsPublicPermutationCacheMiddleware({
    resolveCache,
    rewrite: ({ pathname, encodedCacheKey }) => `/public/${encodedCacheKey}${pathname}`,
  });
  const response = await middleware(request);
  expect(response.headers.get('x-middleware-rewrite')).toBe(
    `https://example.com/public/${encodeURIComponent(cache.key)}/home`
  );
  expect(response.headers.get('x-middleware-request-x-ctfl-exp-request-url')).toBe(request.url);
  resolveCache.mockClear();
  for (const terminal of [
    NextResponse.redirect('https://example.com/login'),
    NextResponse.rewrite('https://example.com/public'),
    new NextResponse('error', { status: 500 }),
  ])
    expect(await middleware(request, terminal)).toBe(terminal);
  expect(resolveCache).not.toHaveBeenCalled();
});

it('rejects invalid public metadata at the routing boundary', async () => {
  const request = new NextRequest('https://example.com/home');
  await expect(
    createNextjsPublicPermutationCacheMiddleware({ resolveCache: () => ({ ...cache, key: '' }) })(
      request
    )
  ).rejects.toThrow('key');
  await expect(
    createNextjsPublicPermutationCacheMiddleware({
      resolveCache: () => ({ ...cache, tags: ['bad,tag'] }),
    })(request)
  ).rejects.toThrow('tags');
});
