import { describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((location: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { location });
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/navigation.js', () => navigation);
vi.mock('next/headers.js', () => ({ cookies: vi.fn(), headers: vi.fn() }));

import { applyAppRouterOutcome } from './app-router-server.js';
import { getRequestOutcome } from './request-outcome.js';
import type { RequestResult } from './request-result.js';

const base: RequestResult = {
  requestId: 'r',
  routeKey: '/old',
  experience: { destinationId: 'dest', path: '/old' },
};

describe('primary request outcomes', () => {
  it('routes redirects through App Router redirect() with optional location mapping', () => {
    expect(() =>
      applyAppRouterOutcome(
        { ...base, redirect: { path: '/new' } },
        { redirectLocation: (path) => `/en${path}` }
      )
    ).toThrow('NEXT_REDIRECT');
    expect(navigation.redirect).toHaveBeenCalledWith('/en/new');
  });

  it('routes missing content through notFound() and leaves other results untouched', () => {
    expect(() => applyAppRouterOutcome({ ...base, notFound: true })).toThrow('NEXT_NOT_FOUND');
    const content = { ...base, contentError: 'Experience content unavailable.' };
    expect(applyAppRouterOutcome(content)).toBe(content);
    expect(getRequestOutcome(content)).toBeUndefined();
  });

  it('prefers the redirect when a result carries both outcomes', () => {
    expect(getRequestOutcome({ ...base, redirect: { path: '/a' }, notFound: true })).toEqual({
      kind: 'redirect',
      location: '/a',
    });
  });
});
