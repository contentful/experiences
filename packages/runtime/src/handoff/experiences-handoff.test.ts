import { profileFixture } from '../test/fixtures/profile.js';
import { describe, expect, it } from 'vitest';
import EventBuilder from '../events/event-builder.js';
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
const changes = [
  {
    type: 'Variable' as const,
    key: 'flag',
    value: false,
    meta: { experienceId: 'experiment', variantIndex: 1 },
  },
];

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

  it('defers prepared validation only for internal browser envelope consumption', () => {
    const events = [builder.buildPageView(), builder.buildTrack({ event: 'after-page' })];
    const input = { ...privateHandoff(), replay: { routeKey: '/home', events } };

    expect(parseExperiencesHandoffEnvelope(input, scope).replay?.events).toEqual(events);
    expect(() => parseExperiencesHandoff(input, scope)).toThrow('final page');
    expect(() => createExperiencesHandoff(input)).toThrow('final page');
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

  it('rejects malformed route keys', () => {
    const handoff = privateHandoff();
    expect(() =>
      parseExperiencesHandoff({ ...handoff, replay: { ...handoff.replay, routeKey: 'home' } })
    ).toThrow('pathname/search route key');
  });

  it('reports and rejects private profile, identity, or replay in public/static cache scopes', () => {
    const handoff = privateHandoff();
    const publicHandoff = {
      ...handoff,
      cache: { scope: 'public-permutation' as const, key: 'safe-key' },
      state: { profile: profileFixture('profile-1') },
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
      state: { profile: profileFixture('evaluated-profile'), changes: [] },
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

  it('preserves an in-memory explicit profile clear', () => {
    const handoff = createExperiencesHandoff({
      ...scope,
      cache: { scope: 'private-request' },
      state: { profile: undefined },
    });

    expect(Object.prototype.hasOwnProperty.call(handoff.state, 'profile')).toBe(true);
  });

  it.each([{ changes }, { changes: [] }])(
    'round-trips flag-only state through JSON (%j)',
    ({ changes }) => {
      const input: ExperiencesHandoff = {
        ...scope,
        cache: { scope: 'private-request' },
        state: { changes },
      };
      const created = createExperiencesHandoff(input);
      expect(parseExperiencesHandoff(JSON.parse(JSON.stringify(created)), scope)).toEqual(input);
      expect(created.replay).toBeUndefined();
      expect(created.profileId).toBeUndefined();
      expect(() => parseExperiencesHandoff(created, { ...scope, spaceId: 'other' })).toThrow(
        'does not match'
      );
    }
  );

  it.each(['static', 'public-permutation'] as const)(
    'rejects flag-only state in %s caches, including an empty change list',
    (cacheScope) => {
      for (const list of [changes, []]) {
        const input: ExperiencesHandoff = {
          ...scope,
          cache: { scope: cacheScope, key: 'public' },
          state: { changes: list },
        };
        expect(getExperiencesCacheSafetyWarnings(input)[0]?.path).toEqual(['state', 'changes']);
        expect(() => createExperiencesHandoff(input)).toThrow('changes');
        expect(() => parseExperiencesHandoffEnvelope(input, scope)).toThrow('changes');
      }
    }
  );

  it.each(
    [null, {}, [{ ...changes[0], value: undefined }], [{ ...changes[0], meta: {} }]].map(
      (changes) => ({ changes })
    )
  )('rejects malformed change state in both consumer parsers (%j)', ({ changes }) => {
    const input = { ...scope, cache: { scope: 'private-request' }, state: { changes } };
    expect(() => parseExperiencesHandoff(input, scope)).toThrow();
    expect(() => parseExperiencesHandoffEnvelope(input, scope)).toThrow();
    expect(() => createExperiencesHandoff(input as ExperiencesHandoff)).toThrow();
  });

  it('preserves omitted and explicit undefined changes separately in memory', () => {
    const base: ExperiencesHandoff = { ...scope, cache: { scope: 'private-request' } };
    expect(createExperiencesHandoff(base)).not.toHaveProperty('state');
    expect(createExperiencesHandoff({ ...base, state: {} }).state).not.toHaveProperty('changes');
    expect(
      createExperiencesHandoff({ ...base, state: { changes: undefined } }).state
    ).toHaveProperty('changes', undefined);
  });

  it('preserves sparse changes alongside prepared replay', () => {
    const handoff = { ...privateHandoff(), state: { changes } };
    expect(createExperiencesHandoff(handoff).state).toEqual({ changes });
    for (const data of [
      { profile: undefined },
      { profile: undefined, changes: [] },
      { profile: undefined, changes: undefined },
    ]) {
      const packaged = createExperiencesHandoff({
        ...handoff,
        state: { ...handoff.state, ...data },
      });
      expect(packaged.state).toEqual({
        profile: undefined,
        changes: Object.prototype.hasOwnProperty.call(data, 'changes') ? data.changes : changes,
      });
      expect(packaged.replay).toEqual(handoff.replay);
      expect(packaged.profileId).toEqual(handoff.profileId);
    }
  });
});

it('round-trips public cache tags and validates their string contract', () => {
  const input: ExperiencesHandoff = {
    spaceId: 'space',
    environmentId: 'master',
    cache: { scope: 'public-permutation', key: 'public-content', tags: ['content:home'] },
  };
  expect(
    parseExperiencesHandoff(JSON.parse(JSON.stringify(createExperiencesHandoff(input))))
  ).toEqual(input);
  expect(() =>
    parseExperiencesHandoff({ ...input, cache: { ...input.cache, tags: [1] } })
  ).toThrow();
});
