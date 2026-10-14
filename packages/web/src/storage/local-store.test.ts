// @vitest-environment jsdom

import {
  ANONYMOUS_ID_KEY,
  ANONYMOUS_ID_KEY_LEGACY,
  CONSENT_CACHE_KEY,
  PERSISTENCE_CONSENT_CACHE_KEY,
  PROFILE_CACHE_KEY,
} from '@contentful/experiences-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedConsent } from '../test-fixtures/consent.js';
import LocalStore from './local-store.js';

describe('LocalStore', () => {
  let store: LocalStore;

  beforeEach(() => {
    window.localStorage.clear();
    seedConsent({ persistence: true });
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

describe('LocalStore consent', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps the profile in memory only until persistence consent is granted', () => {
    const store = new LocalStore();

    store.profile = { id: 'visitor' };

    expect(store.profile).toEqual({ id: 'visitor' });
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();

    store.updateConsent({ persistence: true });
    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual({ id: 'visitor' });
  });

  it('removes the stored profile but keeps the in-memory one when persistence is denied', () => {
    const store = new LocalStore();
    store.updateConsent({ persistence: true });
    store.profile = { id: 'visitor' };

    store.updateConsent({ persistence: false });

    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    expect(store.profile).toEqual({ id: 'visitor' });
  });

  it('persists consent itself and restores it with the profile on the next load', () => {
    const first = new LocalStore();
    first.updateConsent({ events: true, persistence: true });
    first.profile = { id: 'visitor' };

    const second = new LocalStore();

    expect(second.consent).toEqual({ events: true, persistence: true });
    expect(second.profile).toEqual({ id: 'visitor' });
  });

  it('does not restore, but keeps, a stored profile while persistence is undecided', () => {
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'stored' }));

    expect(new LocalStore().profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).not.toBeNull();
  });

  it('removes a stored profile on load when persistence was denied', () => {
    seedConsent({ persistence: false });
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'stale' }));

    expect(new LocalStore().profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });
});

describe('LocalStore consent defaults (same precedence as the Optimization SDK)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('writes the effective decisions to the shared consent keys', () => {
    const store = new LocalStore();

    store.applyConsentDefaults({ events: true, persistence: false });

    expect(store.consent).toEqual({ events: true, persistence: false });
    expect(window.localStorage.getItem(CONSENT_CACHE_KEY)).toBe('accepted');
    expect(window.localStorage.getItem(PERSISTENCE_CONSENT_CACHE_KEY)).toBe('denied');
  });

  it('writes nothing for a visitor who has not decided and has no defaults', () => {
    const store = new LocalStore();

    store.applyConsentDefaults({});

    expect(store.consent).toEqual({});
    expect(window.localStorage.getItem(CONSENT_CACHE_KEY)).toBeNull();
    expect(window.localStorage.getItem(PERSISTENCE_CONSENT_CACHE_KEY)).toBeNull();
  });

  it('lets configured defaults override a stored decision', () => {
    seedConsent({ events: false, persistence: false });
    const store = new LocalStore();

    store.applyConsentDefaults({ events: true, persistence: true });

    expect(store.consent).toEqual({ events: true, persistence: true });
  });

  it('keeps the stored value for an axis the defaults leave unset', () => {
    seedConsent({ events: false, persistence: true });
    const store = new LocalStore();

    store.applyConsentDefaults({});

    expect(store.consent).toEqual({ events: false, persistence: true });
  });

  it('lets a configured event default decide persistence too, over the stored value', () => {
    seedConsent({ events: false, persistence: true });
    const store = new LocalStore();

    store.applyConsentDefaults({ events: true });

    // `events` is configured; `persistence` falls back to it rather than to storage.
    expect(store.consent).toEqual({ events: true, persistence: true });
  });

  it('makes a configured default the stored decision for the next load', () => {
    seedConsent({ events: false, persistence: true });
    new LocalStore().applyConsentDefaults({ events: true });

    const later = new LocalStore();
    later.applyConsentDefaults({});

    // Removing the default does not return the visitor to their earlier choice.
    expect(later.consent).toEqual({ events: true, persistence: true });
  });

  it('uses the event default as the persistence default when none is given', () => {
    const store = new LocalStore();

    store.applyConsentDefaults({ events: true });
    expect(store.consent).toEqual({ events: true, persistence: true });

    const denied = new LocalStore();
    denied.applyConsentDefaults({ events: false });
    expect(denied.consent).toEqual({ events: false, persistence: false });
  });

  it('prefers an explicit persistence default over the event default', () => {
    const store = new LocalStore();

    store.applyConsentDefaults({ events: true, persistence: false });

    expect(store.consent).toEqual({ events: true, persistence: false });
  });

  it('leaves consent untouched when no defaults are configured', () => {
    seedConsent({ events: true, persistence: false });
    const store = new LocalStore();

    store.applyConsentDefaults({});

    expect(store.consent).toEqual({ events: true, persistence: false });
  });

  it('restores a stored profile when defaults grant persistence', () => {
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'visitor' }));
    const store = new LocalStore();
    expect(store.profile).toBeUndefined();

    store.applyConsentDefaults({ persistence: true });

    expect(store.profile).toEqual({ id: 'visitor' });
  });

  it('clears the stored profile when defaults deny persistence', () => {
    seedConsent({ events: true, persistence: true });
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'visitor' }));
    const store = new LocalStore();
    expect(store.profile).toEqual({ id: 'visitor' });

    store.applyConsentDefaults({ persistence: false });

    expect(store.profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('keeps a denial in force when the same SDK is recreated without the default', () => {
    seedConsent({ events: true, persistence: true });
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'visitor' }));
    new LocalStore().applyConsentDefaults({ persistence: false });

    const recreated = new LocalStore();
    recreated.applyConsentDefaults({});

    // The configured denial became the stored decision, so removing it does not bring the
    // old acceptance or the old profile back.
    expect(recreated.consent.persistence).toBe(false);
    expect(recreated.profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('resolves consent before loading the profile, so a denied default never loads it', () => {
    seedConsent({ events: true, persistence: true });
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'visitor' }));
    const store = new LocalStore();

    store.applyConsentDefaults({ persistence: false });

    expect(store.profile).toBeUndefined();
  });

  it('keeps the stored profile when defaults grant what was already granted', () => {
    seedConsent({ events: true, persistence: true });
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ id: 'visitor' }));
    const store = new LocalStore();

    store.applyConsentDefaults({ persistence: true });

    expect(store.profile).toEqual({ id: 'visitor' });
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).not.toBeNull();
  });
});

describe('LocalStore anonymous id (shared with the Optimization SDK)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('is undefined when nothing is stored', () => {
    expect(new LocalStore().anonymousId).toBeUndefined();
  });

  it('stores and reads the id under the shared key', () => {
    const store = new LocalStore();

    store.anonymousId = 'visitor-1';

    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('visitor-1');
    expect(new LocalStore().anonymousId).toBe('visitor-1');
  });

  it('removes the stored id when cleared', () => {
    const store = new LocalStore();
    store.anonymousId = 'visitor-1';

    store.anonymousId = undefined;

    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
    expect(store.anonymousId).toBeUndefined();
  });

  it('reads the legacy key ahead of the current one, and removes it', () => {
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'current-id');
    window.localStorage.setItem(ANONYMOUS_ID_KEY_LEGACY, 'legacy-id');
    const store = new LocalStore();

    // Same precedence as the Optimization SDK: the legacy value wins, and is migrated away.
    expect(store.anonymousId).toBe('legacy-id');
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY_LEGACY)).toBeNull();
    expect(store.anonymousId).toBe('current-id');
  });

  it('reads a legacy-only id once', () => {
    window.localStorage.setItem(ANONYMOUS_ID_KEY_LEGACY, 'legacy-id');
    const store = new LocalStore();

    expect(store.anonymousId).toBe('legacy-id');
    expect(store.anonymousId).toBeUndefined();
  });
});
