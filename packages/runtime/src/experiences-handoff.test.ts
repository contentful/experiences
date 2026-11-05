import { describe, expect, it } from 'vitest';
import EventBuilder from './event-builder.js';
import {
  assertExperiencesCacheSafety,
  assertExperiencesHandoffScope,
  createExperiencesHandoff,
  getExperiencesCacheSafetyWarnings,
  parseExperiencesHandoff,
  parseExperiencesHandoffEnvelope,
  type ExperiencesHandoff,
} from './experiences-handoff.js';

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

  it('accepts 100 prepared events and rejects 101 in both producer and consumer validation', () => {
    const identify = Array.from({ length: 50 }, (_, index) =>
      builder.buildIdentify({ userId: `visitor-${index}`, locale: 'de-DE' })
    );
    const track = Array.from({ length: 49 }, (_, index) =>
      builder.buildTrack({ event: `opened-${index}`, locale: 'de-DE' })
    );
    const page = builder.buildPageView({ locale: 'de-DE' });
    const handoff = {
      ...privateHandoff(),
      replay: {
        routeKey: '/home',
        locale: 'de-DE',
        events: [...identify, ...track, page],
      },
    };

    const created = createExperiencesHandoff(handoff);
    const received = parseExperiencesHandoff(JSON.parse(JSON.stringify(created)), scope);
    expect(created.replay?.events).toEqual(handoff.replay.events);
    expect(received.replay?.events).toEqual(created.replay?.events);
    expect(received.replay?.events).toHaveLength(100);
    expect(new Set(received.replay?.events.map(({ messageId }) => messageId)).size).toBe(100);

    const oversized = {
      ...handoff,
      replay: {
        ...handoff.replay,
        events: [
          ...handoff.replay.events.slice(0, -1),
          builder.buildTrack({ event: 'extra', locale: 'de-DE' }),
          page,
        ],
      },
    };
    expect(() => createExperiencesHandoff(oversized)).toThrow('within the SDK handoff limits');
    expect(() => parseExperiencesHandoff(oversized, scope)).toThrow(
      'within the SDK handoff limits'
    );
  });

  it('defers only prepared event validation for internal browser consumption', () => {
    for (const events of [
      [],
      [null],
      [{ type: 'page' }],
      [{ ...builder.buildPageView(), context: { locale: 42 } }],
      [
        ...Array.from({ length: 51 }, () => builder.buildIdentify({ userId: 'visitor' })),
        builder.buildPageView(),
      ],
      [builder.buildPageView(), builder.buildTrack({ event: 'after-page' })],
      [
        ...Array.from({ length: 100 }, () => builder.buildTrack({ event: 'oversized' })),
        builder.buildPageView(),
      ],
    ]) {
      const input = { ...privateHandoff(), replay: { routeKey: '/home', events } };
      expect(parseExperiencesHandoffEnvelope(input, scope).replay?.events).toEqual(events);
      expect(() => parseExperiencesHandoff(input, scope)).toThrow();
      expect(() => createExperiencesHandoff(input as ExperiencesHandoff)).toThrow();
    }
  });

  it('still rejects invalid envelopes, scope and cache safety in browser consumption', () => {
    const input = { ...privateHandoff(), replay: { routeKey: '/home', events: [] } };
    const invalid = [
      { ...input, spaceId: 'other' },
      { ...input, environmentId: 'other' },
      { ...input, cache: { scope: 'static' } },
      { ...input, cache: { scope: 'public-permutation', key: 'safe-key' } },
      { ...scope, cache: { scope: 'public-permutation', key: ' ' } },
      { ...input, state: { profile: { id: 42 } } },
      { ...input, replay: { ...input.replay, routeKey: 'home' } },
      { ...input, replay: { ...input.replay, locale: 42 } },
      { ...input, replay: { routeKey: '/home' } },
      { ...input, replay: { ...input.replay, events: null } },
    ];
    for (const handoff of invalid) {
      expect(() => parseExperiencesHandoffEnvelope(handoff, scope)).toThrow();
    }
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
    ).toThrow('final page');
    expect(() =>
      parseExperiencesHandoff({
        ...handoff,
        replay: { routeKey: '/home', events: [builder.buildPageView(), builder.buildPageView()] },
      })
    ).toThrow('final page');
    expect(() =>
      parseExperiencesHandoff({
        ...handoff,
        replay: { routeKey: '/home', events: [{ type: 'page' }] },
      })
    ).toThrow();
    expect(() =>
      parseExperiencesHandoff(
        {
          ...handoff,
          replay: {
            routeKey: '/home',
            events: [{ ...builder.buildTrack({ event: 'opened' }), extra: true }],
          },
        },
        scope
      )
    ).toThrow('cannot change the evaluated event bodies');
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

  it('preserves the complete aggregate and frozen producer input', () => {
    const input = {
      ...privateHandoff(),
      state: { profile: { id: 'evaluated-profile' } },
    };
    const before = globalThis.structuredClone(input);
    Object.freeze(input.state.profile);
    Object.freeze(input.state);
    Object.freeze(input.cache);
    for (const event of input.replay!.events) {
      Object.freeze(event.context.library);
      Object.freeze(event.context);
      Object.freeze(event);
    }
    Object.freeze(input.replay!.events);
    Object.freeze(input.replay);
    Object.freeze(input);

    const created = createExperiencesHandoff(input);
    const received = parseExperiencesHandoff(JSON.parse(JSON.stringify(created)), scope);

    expect(input).toEqual(before);
    expect(created).toEqual(before);
    expect(received).toEqual(before);
    expect(created.state).not.toBe(input.state);
    expect(created.state?.profile).not.toBe(input.state.profile);
    expect(created.replay?.events).not.toBe(input.replay?.events);
  });

  it('creates and parses identify-only and track-only replays without adding a page', () => {
    for (const event of [
      builder.buildIdentify({ userId: 'visitor' }),
      builder.buildTrack({ event: 'opened' }),
    ]) {
      const input = { ...privateHandoff(), replay: { routeKey: '/home', events: [event] } };
      expect(createExperiencesHandoff(input)).toEqual(input);
      expect(parseExperiencesHandoff(JSON.parse(JSON.stringify(input)), scope)).toEqual(input);
    }
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
