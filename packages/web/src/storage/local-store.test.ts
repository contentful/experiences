// @vitest-environment jsdom

import { PROFILE_CACHE_KEY } from '@contentful/experiences-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LocalStore from './local-store.js';

describe('LocalStore', () => {
  let store: LocalStore;

  beforeEach(() => {
    window.localStorage.clear();
    store = new LocalStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads and writes the complete profile', () => {
    const profile = {
      id: 'profile-id',
      audiences: ['developers'],
      traits: { plan: 'pro' },
    };
    store.profile = profile;

    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(profile);
    expect(store.profile).toEqual(profile);
    expect(new LocalStore().profile).toEqual(profile);
  });

  it('clears the profile on reset', () => {
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'profile-id' }));

    store.reset();

    expect(store.profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('advances the profile revision when profile state changes', () => {
    const initialRevision = store.profileRevision;

    store.profile = { id: 'profile-id' };
    expect(store.profileRevision).toBe(initialRevision + 1);

    store.reset();
    expect(store.profileRevision).toBe(initialRevision + 2);
  });

  it('updates the profile from a returned id at the expected revision', () => {
    const revision = store.profileRevision;

    store.updateProfileFromId('returned-profile', revision);

    expect(store.profile).toEqual({ id: 'returned-profile' });
  });

  it('preserves a complete profile when the returned id is unchanged', () => {
    const profile = { id: 'profile-id', traits: { plan: 'pro' } };
    store.profile = profile;
    const revision = store.profileRevision;

    store.updateProfileFromId('profile-id', revision);

    expect(store.profile).toEqual(profile);
    expect(store.profileRevision).toBe(revision);
  });

  it('ignores a returned profile id after a newer profile change', () => {
    const staleRevision = store.profileRevision;
    store.profile = { id: 'current-profile' };

    store.updateProfileFromId('stale-profile', staleRevision);

    expect(store.profile).toEqual({ id: 'current-profile' });
  });

  it('deletes malformed profile JSON', () => {
    window.localStorage.setItem(PROFILE_CACHE_KEY, '{bad-json');
    store = new LocalStore();

    expect(store.profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('deletes profile values that fail schema validation', () => {
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ traits: {} }));
    store = new LocalStore();

    expect(store.profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('swallows LocalStorage read failures', () => {
    vi.spyOn(window.Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    store = new LocalStore();

    expect(store.profile).toBeUndefined();
  });

  it('swallows LocalStorage write failures', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => {
      store.profile = { id: 'profile-id' };
    }).not.toThrow();
    expect(store.profile).toEqual({ id: 'profile-id' });
  });

  it('swallows LocalStorage removal failures', () => {
    vi.spyOn(window.Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(() => store.reset()).not.toThrow();
  });

  it('JSON-encodes non-string cache values', () => {
    store.setCache('test-key', { ok: true });

    expect(window.localStorage.getItem('test-key')).toBe('{"ok":true}');
  });
});
