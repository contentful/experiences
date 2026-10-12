import { describe, expect, it } from 'vitest';
import EventBuilder from './event-builder.js';
import {
  assertExperiencesCacheSafety,
  assertExperiencesHandoffScope,
  createExperiencesHandoff,
  createRequestHandoffFromData,
  getExperiencesCacheSafetyWarnings,
  parseExperiencesHandoff,
  type ExperiencesHandoff,
} from './experiences-handoff.js';
import type { EventOptimizationData } from './runtime-event-methods.js';

const builder = new EventBuilder({
  channel: 'server',
  library: { name: '@contentful/experiences-node', version: 'test' },
});
const scope = { spaceId: 'space', environmentId: 'master' };

function privateHandoff(): ExperiencesHandoff {
  return {
    ...scope,
    cache: { scope: 'private-request' },
    profileId: 'profile-1',
    replay: {
      routeKey: '/home?view=one',
      locale: 'de-DE',
      events: [
        builder.buildTrack({ event: 'opened', locale: 'de-DE' }),
        builder.buildPageView({ locale: 'de-DE' }),
      ],
    },
  };
}

describe('Experiences handoff', () => {
  it('creates and parses the same scoped, prepared event bodies through JSON', () => {
    const handoff = createExperiencesHandoff(privateHandoff());
    const received = parseExperiencesHandoff(JSON.parse(JSON.stringify(handoff)), scope);

    expect(received).toEqual(handoff);
    expect(received.replay?.events.map((event) => event.messageId)).toEqual(
      handoff.replay?.events.map((event) => event.messageId)
    );
    expect(received.replay?.events.map((event) => event.context.locale)).toEqual([
      'de-DE',
      'de-DE',
    ]);
  });

  it('rejects another space or environment before a consumer can adopt the handoff', () => {
    const handoff = privateHandoff();
    expect(() => assertExperiencesHandoffScope(handoff, { ...scope, spaceId: 'other' })).toThrow(
      'does not match this space or environment'
    );
    expect(() => parseExperiencesHandoff(handoff, { ...scope, environmentId: 'other' })).toThrow(
      'does not match this space or environment'
    );
    expect(handoff.profileId).toBe('profile-1');
  });

  it('rejects malformed replay data and route keys', () => {
    const handoff = privateHandoff();
    expect(() =>
      parseExperiencesHandoff({ ...handoff, replay: { ...handoff.replay, routeKey: 'home' } })
    ).toThrow('pathname/search route key');
    expect(() =>
      parseExperiencesHandoff({ ...handoff, replay: { routeKey: '/home', events: [] } })
    ).toThrow('one page');
    expect(() =>
      parseExperiencesHandoff({
        ...handoff,
        replay: { routeKey: '/home', events: [builder.buildPageView(), builder.buildPageView()] },
      })
    ).toThrow('one page');
    expect(() =>
      parseExperiencesHandoff({
        ...handoff,
        replay: { routeKey: '/home', events: [{ type: 'page' }] },
      })
    ).toThrow();
  });

  it('reports and rejects private profile, identity, or replay in public/static cache scopes', () => {
    const handoff = privateHandoff();
    const publicHandoff = {
      ...handoff,
      cache: { scope: 'public-permutation' as const, key: 'safe-key' },
      state: { profile: { id: 'profile-1' } },
    };
    expect(getExperiencesCacheSafetyWarnings(publicHandoff)).toEqual([
      expect.objectContaining({
        code: 'profile-state-in-public-cache',
        path: ['state', 'profile'],
      }),
    ]);
    expect(() => assertExperiencesCacheSafety(publicHandoff)).toThrow('Profile state');
    expect(() => createExperiencesHandoff(publicHandoff)).toThrow('Profile state');

    const { state: _, ...withoutState } = publicHandoff;
    expect(getExperiencesCacheSafetyWarnings(withoutState)[0]?.path).toEqual(['profileId']);
    const { profileId: __, ...withoutIdentity } = withoutState;
    expect(getExperiencesCacheSafetyWarnings(withoutIdentity)[0]?.path).toEqual(['replay']);
    expect(() =>
      createExperiencesHandoff({ ...withoutIdentity, cache: { scope: 'static' } })
    ).toThrow('Profile state');
  });

  it('requires a nonempty public permutation key and accepts profileless public/static state', () => {
    const publicHandoff: ExperiencesHandoff = {
      ...scope,
      cache: { scope: 'public-permutation', key: ' ' },
      state: {},
    };
    expect(getExperiencesCacheSafetyWarnings(publicHandoff)).toEqual([
      expect.objectContaining({
        code: 'missing-public-permutation-cache-key',
        path: ['cache', 'key'],
      }),
    ]);
    expect(() => createExperiencesHandoff(publicHandoff)).toThrow('nonempty cache.key');
    expect(createExperiencesHandoff({ ...publicHandoff, cache: { scope: 'static' } })).toEqual({
      ...scope,
      cache: { scope: 'static' },
      state: {},
    });
    expect(
      createExperiencesHandoff({
        ...publicHandoff,
        cache: { scope: 'public-permutation', key: 'experience:revision:locale' },
      }).cache
    ).toEqual({ scope: 'public-permutation', key: 'experience:revision:locale' });
  });

  it('packages evaluated profile state privately', () => {
    const handoff = privateHandoff();
    const data = {
      profile: { id: 'evaluated-profile' },
      changes: [],
      selectedOptimizations: [],
    } as unknown as EventOptimizationData;
    const packaged = createRequestHandoffFromData({ handoff, data });

    expect(packaged.state).toEqual({ profile: { id: 'evaluated-profile' } });
    expect(packaged.profileId).toBe('profile-1');
    expect(packaged.replay?.events.map((event) => event.messageId)).toEqual(
      handoff.replay?.events.map((event) => event.messageId)
    );
    expect(() =>
      createRequestHandoffFromData({ handoff: { ...handoff, cache: { scope: 'static' } }, data })
    ).toThrow('private-request');
  });

  it('preserves an in-memory explicit profile clear', () => {
    const handoff = createExperiencesHandoff({
      ...scope,
      cache: { scope: 'private-request' },
      state: { profile: undefined },
    });

    expect(Object.prototype.hasOwnProperty.call(handoff.state, 'profile')).toBe(true);
  });
});
