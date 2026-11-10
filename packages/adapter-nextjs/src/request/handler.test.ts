import { serverConfig } from '../test/fixtures/request.js';
import { NextRequest, NextResponse } from 'next/server.js';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { MaybePromise, RuntimeLivePreviewOptions } from '@contentful/experiences-node';
import {
  createNextjsExperiencesContextHandler,
  type NextjsLivePreviewResolver,
} from './handler.js';
import { configureNextjsServerExperiences } from './server-request.js';
import {
  NEXTJS_EXPERIENCES_REQUEST_HEADER_PREFIX,
  NEXTJS_EXPERIENCES_REQUEST_URL_HEADER,
} from './request-context.js';

const sdk = () => configureNextjsServerExperiences(serverConfig());

function forwarded(response: NextResponse, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`);
}

describe('Next context middleware', () => {
  it.each([true, false])(
    'composes browser-readable identity and scoped withdrawal with a real NextResponse (persistence %s)',
    async (persistence) => {
      const runtime = sdk();
      const forRequest = runtime.forRequest.bind(runtime);
      const destroy = vi.fn();
      const bind = vi.spyOn(runtime, 'forRequest').mockImplementation((context) => {
        const request = forRequest(context);
        const destroyRequest = request.destroy.bind(request);
        vi.spyOn(request, 'destroy').mockImplementation(() => {
          destroy();
          destroyRequest();
        });
        return request;
      });
      const incoming = new NextRequest('https://example.com/app/page', {
        headers: { cookie: 'browser-id=incoming' },
      });
      const response = NextResponse.rewrite('https://example.com/internal', {
        request: { headers: new globalThis.Headers({ cookie: 'browser-id=effective' }) },
      });
      response.cookies.set('browser-id', 'old', {
        path: '/app',
        domain: 'example.com',
        httpOnly: true,
      });
      response.cookies.set('host', 'one');
      response.headers.set('vary', 'RSC, Next-Router-State-Tree');
      const cookieOptions = { path: '/app', domain: 'example.com', secure: true, httpOnly: true };
      const result = await createNextjsExperiencesContextHandler({
        sdk: runtime,
        consent: { persistence },
        anonymousIdCookieName: 'browser-id',
        cookieOptions,
      })(incoming, response);
      expect(result).toBe(response);
      expect(bind).toHaveBeenCalledOnce();
      expect(bind.mock.calls[0]![0]?.profile).toEqual(
        persistence ? { id: 'effective' } : undefined
      );
      expect(bind.mock.calls[0]![0]).not.toHaveProperty('cookieOptions');
      expect(bind.mock.calls[0]![0]).not.toHaveProperty('deleteWhenProfileCannotPersist');
      expect(destroy).toHaveBeenCalledOnce();
      result.cookies.set('later', 'two');
      expect(result.cookies.get('browser-id')).toMatchObject({
        value: persistence ? 'effective' : '',
        path: '/app',
        domain: 'example.com',
        secure: true,
        httpOnly: false,
        ...(!persistence ? { maxAge: 0, expires: new Date(0) } : {}),
      });
      const identity = result.headers
        .getSetCookie()
        .filter((value) => value.startsWith('browser-id='));
      expect(identity).toHaveLength(1);
      expect(identity[0]).not.toContain('HttpOnly');
      expect(identity[0]).not.toContain('old');
      expect(result.headers.get('x-middleware-set-cookie')).toContain(
        `browser-id=${persistence ? 'effective' : ''};`
      );
      expect(result.headers.get('x-middleware-set-cookie')).not.toContain('HttpOnly');
      expect(result.cookies.get('host')?.value).toBe('one');
      expect(result.cookies.get('later')?.value).toBe('two');
      expect(result.headers.get('vary')).toBe('RSC, Next-Router-State-Tree');
      expect(result.headers.get('cache-control')).toBe('private, no-store');
      expect(result.headers.get('x-middleware-rewrite')).toBe('https://example.com/internal');
      expect(cookieOptions.httpOnly).toBe(true);
    }
  );

  it('destroys the direct request when response cookie persistence fails', async () => {
    const runtime = sdk();
    const forRequest = runtime.forRequest.bind(runtime);
    const destroy = vi.fn();
    vi.spyOn(runtime, 'forRequest').mockImplementation((context) => {
      const request = forRequest(context);
      const destroyRequest = request.destroy.bind(request);
      vi.spyOn(request, 'destroy').mockImplementation(() => {
        destroy();
        destroyRequest();
      });
      return request;
    });
    await expect(
      createNextjsExperiencesContextHandler({
        sdk: runtime,
        consent: true,
        profile: { id: 'id' },
        cookieOptions: { path: '/; invalid' },
      })(new NextRequest('https://example.com'))
    ).rejects.toThrow('scope');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('sanitizes SDK headers and forwards normalized URL without visitor work', async () => {
    const request = new NextRequest(
      'https://example.com/page?q=hello%20world&_rsc=transport&q=last#hash',
      {
        headers: {
          [`${NEXTJS_EXPERIENCES_REQUEST_HEADER_PREFIX}profile`]: 'untrusted',
          [NEXTJS_EXPERIENCES_REQUEST_URL_HEADER]: 'https://attacker.test',
          'x-host': 'preserved',
        },
      }
    );
    const result = await createNextjsExperiencesContextHandler()(request);
    expect(forwarded(result, NEXTJS_EXPERIENCES_REQUEST_URL_HEADER)).toBe(
      'https://example.com/page?q=hello+world&q=last'
    );
    expect(forwarded(result, `${NEXTJS_EXPERIENCES_REQUEST_HEADER_PREFIX}profile`)).toBeNull();
    expect(forwarded(result, 'x-host')).toBe('preserved');
    expect(result.headers.has('set-cookie')).toBe(false);
  });

  it('preserves the actual origin for paths with leading duplicate slashes', async () => {
    const result = await createNextjsExperiencesContextHandler()(
      new NextRequest('https://example.com//page?q=hello%20world&_rsc=x#hash')
    );
    expect(forwarded(result, NEXTJS_EXPERIENCES_REQUEST_URL_HEADER)).toBe(
      'https://example.com//page?q=hello+world'
    );
  });

  it('honors overrides including removed cookies and preserves rewrite/body/response headers', async () => {
    const runtime = sdk();
    const bind = vi.spyOn(runtime, 'forRequest');
    const request = new NextRequest('https://example.com/page', {
      headers: { cookie: 'ctfl-opt-aid=incoming', 'x-old': 'removed' },
    });
    const response = NextResponse.rewrite('https://example.com/internal', {
      request: {
        headers: new globalThis.Headers({
          'x-kept': 'effective',
          [`${NEXTJS_EXPERIENCES_REQUEST_HEADER_PREFIX}profile`]: 'spoofed',
        }),
      },
    });
    response.headers.set('vary', 'RSC');
    response.headers.append('set-cookie', 'host=1; Path=/');
    const consent = vi.fn(({ cookies }) => {
      expect(cookies.get('ctfl-opt-aid')).toBeUndefined();
      return { persistence: true };
    });
    const result = await createNextjsExperiencesContextHandler({ sdk: runtime, consent })(
      request,
      response
    );
    expect(result).toBe(response);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(bind.mock.calls[0]![0]?.profile).toBeUndefined();
    expect(forwarded(result, 'cookie')).toBeNull();
    expect(forwarded(result, 'x-old')).toBeNull();
    expect(forwarded(result, 'x-kept')).toBe('effective');
    expect(result.headers.get('x-middleware-rewrite')).toBe('https://example.com/internal');
    expect(result.headers.get('vary')).toBe('RSC');
    expect(result.headers.getSetCookie()).toEqual(['host=1; Path=/']);
    expect(result.headers.get('cache-control')).toBe('private, no-store');
  });

  it.each([
    NextResponse.redirect('https://example.com/redirect'),
    new NextResponse('terminal', { status: 403 }),
  ])('preserves terminal response before consent/preview/binding', async (response) => {
    const runtime = sdk();
    const bind = vi.spyOn(runtime, 'forRequest');
    const consent = vi.fn(() => true);
    const livePreview = vi.fn(() => undefined);
    expect(
      await createNextjsExperiencesContextHandler({ sdk: runtime, consent, livePreview })(
        new NextRequest('https://example.com'),
        response
      )
    ).toBe(response);
    expect(bind).not.toHaveBeenCalled();
    expect(consent).not.toHaveBeenCalled();
    expect(livePreview).not.toHaveBeenCalled();
    expect(response.headers.has(NEXTJS_EXPERIENCES_REQUEST_URL_HEADER)).toBe(false);
  });

  it('resolves preview before binding and never writes or expires visitor identity', async () => {
    const runtime = sdk();
    const bind = vi.spyOn(runtime, 'forRequest');
    const livePreview = {
      experienceId: 'home',
      sessionId: 'session',
      loadImplementation: async () => {
        throw new Error('must stay lazy');
      },
    };
    const result = await createNextjsExperiencesContextHandler({
      sdk: runtime,
      consent: true,
      livePreview: async ({ request }) => {
        expect(request.url).toBe('https://example.com/');
        expect(bind).not.toHaveBeenCalled();
        return livePreview;
      },
    })(new NextRequest('https://example.com', { headers: { cookie: 'ctfl-opt-aid=visitor' } }));
    expect(bind.mock.calls[0]![0]).toMatchObject({ livePreview, profile: undefined });
    expect(bind.mock.results[0]!.value.isPreview).toBe(true);
    expect(result.headers.has('set-cookie')).toBe(false);
  });

  it('aborts on resolver failure without mutating supplied response', async () => {
    const runtime = sdk();
    const bind = vi.spyOn(runtime, 'forRequest');
    const response = NextResponse.next();
    const before = response.headers.get('x-middleware-next');
    await expect(
      createNextjsExperiencesContextHandler({
        sdk: runtime,
        consent: false,
        livePreview: () => {
          throw new Error('preview resolver failed');
        },
      })(new NextRequest('https://example.com'), response)
    ).rejects.toThrow('preview resolver failed');
    expect(bind).not.toHaveBeenCalled();
    expect(response.headers.get('x-middleware-next')).toEqual(before);
    expect(response.headers.has('x-middleware-override-headers')).toBe(false);
  });
});

it.each([false, true])(
  'keeps the existing static isPreview option when livePreview resolves undefined (%s)',
  async (isPreview) => {
    const runtime = sdk();
    const bind = vi.spyOn(runtime, 'forRequest');
    const livePreview = vi.fn<NextjsLivePreviewResolver>().mockResolvedValue(undefined);
    await createNextjsExperiencesContextHandler({
      sdk: runtime,
      consent: false,
      isPreview,
      livePreview,
    })(new NextRequest('https://example.com'));
    expect(livePreview).toHaveBeenCalledOnce();
    expect(bind.mock.calls[0]![0]).toMatchObject({ isPreview, livePreview: undefined });
    expect(bind.mock.results[0]!.value.isPreview).toBe(isPreview);
  }
);

it('types livePreview as an application resolver returning an initializer or absence', () => {
  expectTypeOf<NextjsLivePreviewResolver>().returns.toEqualTypeOf<
    MaybePromise<RuntimeLivePreviewOptions | undefined>
  >();
});
