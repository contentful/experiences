import { describe, expect, it } from 'vitest';
import { createRequestHandoffFromData, type EventProfile } from './index.js';

function completeProfile(id: string): EventProfile {
  return {
    id,
    stableId: id,
    random: 0.5,
    audiences: [],
    traits: {},
    location: {},
    session: {
      isReturningVisitor: false,
      landingPage: { path: '/', query: {}, referrer: '', search: '', url: 'https://example.com/' },
      count: 1,
      activeSessionLength: 0,
      averageSessionLength: 0,
    },
  };
}

const scope = { spaceId: 'space', environmentId: 'environment' };
const changes = [
  {
    type: 'Variable' as const,
    key: 'flag',
    value: false,
    meta: { experienceId: 'experiment', variantIndex: 0 },
  },
];

describe('createRequestHandoffFromData', () => {
  it('packages an ID-only profile as private continuation identity', () => {
    expect(
      createRequestHandoffFromData({ ...scope, data: { profile: { id: 'visitor' } } })
    ).toEqual({
      ...scope,
      cache: { scope: 'private-request' },
      profileId: 'visitor',
    });
  });

  it.each([undefined, {}, { profile: undefined }, { changes: undefined }])(
    'omits absent state (%j)',
    (data) => {
      const handoff = createRequestHandoffFromData({ ...scope, data });
      expect(handoff).toEqual({
        ...scope,
        cache: { scope: 'private-request' },
      });
    }
  );

  it('preserves a private cache key', () => {
    const input = {
      ...scope,
      cache: { scope: 'private-request' as const, key: 'request' },
      data: { profile: { id: 'visitor' } },
    };
    expect(createRequestHandoffFromData(input).cache).toEqual(input.cache);
  });

  it.each([{ changes }, { changes: [] }])(
    'packages flag-only state without replay or identity (%j)',
    ({ changes }) => {
      const handoff = createRequestHandoffFromData({ ...scope, data: { changes } });
      expect(handoff).toEqual({
        ...scope,
        cache: { scope: 'private-request' },
        state: { changes },
      });
      expect(JSON.parse(JSON.stringify(handoff))).toEqual(handoff);
    }
  );

  it('packages profile and changes together', () => {
    const data = { profile: completeProfile('visitor'), changes };
    expect(createRequestHandoffFromData({ ...scope, data }).state).toEqual(data);
  });

  it('retains flag state with ID-only continuation identity', () => {
    const handoff = createRequestHandoffFromData({
      ...scope,
      data: { profile: { id: 'visitor' }, changes },
    });
    expect(handoff.profileId).toBe('visitor');
    expect(handoff.state).toEqual({ changes });
  });

  it('rejects malformed flag data through the shared schema', () => {
    expect(() =>
      createRequestHandoffFromData({
        ...scope,
        data: { changes: [{ ...changes[0], value: undefined }] as never },
      })
    ).toThrow();
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
