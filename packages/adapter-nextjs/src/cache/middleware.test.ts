import { expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server.js';
import { createPublicPermutationCacheMiddleware } from './middleware.js';

const cache = {
  scope: 'public-permutation' as const,
  key: 'revision/locale/selection',
  tags: ['content:home'],
};

it('rewrites an approved key while retaining response data and authoritative header removals', async () => {
  const request = new NextRequest('https://example.com/home?x=1', {
    headers: { cookie: 'visitor=old', 'x-ctfl-exp-request-url': 'spoofed' },
  });
  const response = NextResponse.next({
    request: {
      headers: new globalThis.Headers({ 'x-host': 'kept', 'x-ctfl-exp-request-url': 'spoofed' }),
    },
  });
  response.headers.set('vary', 'RSC');
  response.cookies.set('host', 'value');
  const middleware = createPublicPermutationCacheMiddleware({ resolveCache: () => cache });
  expect(await middleware(request, response)).toBe(response);
  expect(
    new URL(response.headers.get('x-middleware-rewrite')!).searchParams.get('ctfl-exp-cache-key')
  ).toBe(cache.key);
  expect(response.headers.get('x-middleware-request-x-host')).toBe('kept');
  expect(response.headers.has('x-middleware-request-cookie')).toBe(false);
  expect(response.headers.has('x-middleware-request-x-ctfl-exp-request-url')).toBe(false);
  expect(response.headers.get('vary')).toBe('RSC');
  expect(response.cookies.get('host')?.value).toBe('value');
});

it('uses the pinned custom rewrite convention and preserves terminal responses', async () => {
  const request = new NextRequest('https://example.com/home');
  const resolveCache = vi.fn(() => cache);
  const middleware = createPublicPermutationCacheMiddleware({
    resolveCache,
    rewrite: ({ pathname, encodedCacheKey }) => `/public/${encodedCacheKey}${pathname}`,
  });
  const response = await middleware(request);
  expect(response.headers.get('x-middleware-rewrite')).toBe(
    `https://example.com/public/${encodeURIComponent(cache.key)}/home`
  );
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
    createPublicPermutationCacheMiddleware({ resolveCache: () => ({ ...cache, key: '' }) })(request)
  ).rejects.toThrow('key');
  await expect(
    createPublicPermutationCacheMiddleware({
      resolveCache: () => ({ ...cache, tags: ['bad,tag'] }),
    })(request)
  ).rejects.toThrow('tags');
});
