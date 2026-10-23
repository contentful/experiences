import { describe, expect, it, vi } from 'vitest';
import { createRequestHandoffFromData } from './index.js';

const scope = { spaceId: 'space', environmentId: 'environment' };

describe('createRequestHandoffFromData', () => {
  it('packages an ID-only profile in a private state-only handoff', () => {
    expect(
      createRequestHandoffFromData({ ...scope, data: { profile: { id: 'visitor' } } })
    ).toEqual({
      ...scope,
      cache: { scope: 'private-request' },
      state: { profile: { id: 'visitor' } },
    });
  });

  it.each([undefined, {}, { profile: undefined }])('omits absent profile state (%j)', (data) => {
    const handoff = createRequestHandoffFromData({ ...scope, data });
    expect(Object.hasOwn(handoff, 'state')).toBe(false);
    expect(JSON.parse(JSON.stringify(handoff))).toEqual({
      ...scope,
      cache: { scope: 'private-request' },
    });
    expect(handoff).not.toHaveProperty('profileId');
    expect(handoff).not.toHaveProperty('replay');
  });

  it('preserves a private cache key and leaves supplied inputs unchanged', () => {
    const input = {
      ...scope,
      cache: { scope: 'private-request' as const, key: 'request' },
      data: { profile: { id: 'visitor' } },
    };
    const before = globalThis.structuredClone(input);
    expect(createRequestHandoffFromData(input).cache).toEqual(input.cache);
    expect(input).toEqual(before);
  });

  it.each(['static', 'public-permutation'])(
    'rejects %s even without profile data',
    (cacheScope) => {
      expect(() =>
        createRequestHandoffFromData({
          ...scope,
          cache: { scope: cacheScope, key: 'public' } as never,
        })
      ).toThrow(TypeError);
    }
  );

  it.each([
    { spaceId: 123 },
    { environmentId: null },
    { data: { profile: { id: 123 } } },
    { cache: { scope: 'private-request', key: 123 } },
  ])('propagates Runtime validation errors for %j', (invalid) => {
    expect(() => createRequestHandoffFromData({ ...scope, ...invalid } as never)).toThrow();
  });

  it('does not fetch or emit an event', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      createRequestHandoffFromData(scope);
      createRequestHandoffFromData({ ...scope, data: { profile: { id: 'visitor' } } });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
