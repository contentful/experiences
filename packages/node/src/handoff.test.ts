import { describe, expect, it } from 'vitest';
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

  it.each([undefined, { profile: undefined }])('omits absent profile state (%j)', (data) => {
    const handoff = createRequestHandoffFromData({ ...scope, data });
    expect(handoff).toEqual({
      ...scope,
      cache: { scope: 'private-request' },
    });
  });

  it('preserves a private cache key', () => {
    const input = {
      ...scope,
      cache: { scope: 'private-request' as const, key: 'request' },
      data: { profile: { id: 'visitor' } },
    };
    expect(createRequestHandoffFromData(input).cache).toEqual(input.cache);
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
});
