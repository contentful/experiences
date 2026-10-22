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

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('LocalStore', () => {
  const store = LocalStore;

  it('reads and writes the complete profile', () => {
    const profile = {
      id: 'profile-id',
      audiences: ['developers'],
      traits: { plan: 'pro' },
    };
    store.profile = profile;

    expect(JSON.parse(window.localStorage.getItem(PROFILE_CACHE_KEY)!)).toEqual(profile);
    expect(store.profile).toEqual(profile);
  });

  it('deletes malformed profile JSON', () => {
    window.localStorage.setItem(PROFILE_CACHE_KEY, '{bad-json');

    expect(store.profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('deletes profile values that fail schema validation', () => {
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ traits: {} }));

    expect(store.profile).toBeUndefined();
    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('swallows LocalStorage read failures', () => {
    vi.spyOn(window.Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(store.profile).toBeUndefined();
    expect(store.consent).toBeUndefined();
    expect(store.persistenceConsent).toBeUndefined();
    expect(store.anonymousId).toBeUndefined();
  });

  it('swallows LocalStorage write failures', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => {
      store.profile = { id: 'profile-id' };
    }).not.toThrow();
    expect(store.profile).toBeUndefined();
  });

  it('swallows LocalStorage removal failures', () => {
    vi.spyOn(window.Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(() => store.reset()).not.toThrow();
  });
});

describe('LocalStore anonymous id (shared with the Optimization SDK)', () => {
  it('reads, writes, and clears the id under the shared key', () => {
    const store = LocalStore;

    expect(store.anonymousId).toBeUndefined();
    store.anonymousId = 'visitor-1';

    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBe('visitor-1');
    expect(LocalStore.anonymousId).toBe('visitor-1');
    store.anonymousId = undefined;
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
    expect(store.anonymousId).toBeUndefined();
  });

  it('reads the legacy key ahead of the current one, and removes it', () => {
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'current-id');
    window.localStorage.setItem(ANONYMOUS_ID_KEY_LEGACY, 'legacy-id');
    const store = LocalStore;

    // Same precedence as the Optimization SDK: the legacy value wins, and is migrated away.
    expect(store.anonymousId).toBe('legacy-id');
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY_LEGACY)).toBeNull();
    expect(store.anonymousId).toBe('current-id');
  });

  it('reads a legacy-only id once', () => {
    window.localStorage.setItem(ANONYMOUS_ID_KEY_LEGACY, 'legacy-id');
    const store = LocalStore;

    expect(store.anonymousId).toBe('legacy-id');
    expect(store.anonymousId).toBeUndefined();
  });
});

describe('LocalStore consent persistence', () => {
  it.each([
    [true, 'accepted'],
    [false, 'denied'],
    [undefined, null],
  ] as const)('encodes event and persistence consent %s as %s', (value, encoded) => {
    LocalStore.consent = value;
    LocalStore.persistenceConsent = value;

    expect(window.localStorage.getItem(CONSENT_CACHE_KEY)).toBe(encoded);
    expect(window.localStorage.getItem(PERSISTENCE_CONSENT_CACHE_KEY)).toBe(encoded);
    expect(LocalStore.consent).toBe(value);
    expect(LocalStore.persistenceConsent).toBe(value);
  });

  it('reads the current stored decisions on every access', () => {
    seedConsent({ events: true, persistence: false });
    expect(LocalStore.consent).toBe(true);
    expect(LocalStore.persistenceConsent).toBe(false);

    seedConsent({ events: false, persistence: true });
    expect(LocalStore.consent).toBe(false);
    expect(LocalStore.persistenceConsent).toBe(true);
  });

  it('treats an unrecognized consent encoding as undecided without removing it', () => {
    for (const key of [CONSENT_CACHE_KEY, PERSISTENCE_CONSENT_CACHE_KEY]) {
      window.localStorage.setItem(key, 'unexpected');
    }
    expect(LocalStore.consent).toBeUndefined();
    expect(LocalStore.persistenceConsent).toBeUndefined();
    expect(window.localStorage.getItem(CONSENT_CACHE_KEY)).toBe('unexpected');
    expect(window.localStorage.getItem(PERSISTENCE_CONSENT_CACHE_KEY)).toBe('unexpected');
  });

  it('uses legacy accepted event consent as persistence consent', () => {
    LocalStore.consent = true;
    expect(LocalStore.persistenceConsent).toBe(true);

    LocalStore.persistenceConsent = false;
    expect(LocalStore.persistenceConsent).toBe(false);
  });

  it('leaves persistence undecided for legacy denied event consent', () => {
    LocalStore.consent = false;
    expect(LocalStore.persistenceConsent).toBeUndefined();
  });

  it('reads the stored profile independently of consent', () => {
    LocalStore.persistenceConsent = false;
    LocalStore.profile = { id: 'stored-profile' };

    expect(LocalStore.profile).toEqual({ id: 'stored-profile' });
  });

  it('reset clears continuity and preserves consent decisions', () => {
    seedConsent({ events: true, persistence: false });
    LocalStore.profile = { id: 'stored-profile' };
    window.localStorage.setItem(ANONYMOUS_ID_KEY, 'current');
    window.localStorage.setItem(ANONYMOUS_ID_KEY_LEGACY, 'legacy');

    LocalStore.reset();

    expect(window.localStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY)).toBeNull();
    expect(window.localStorage.getItem(ANONYMOUS_ID_KEY_LEGACY)).toBeNull();
    expect(LocalStore.consent).toBe(true);
    expect(LocalStore.persistenceConsent).toBe(false);
  });

  it('works without a browser', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(LocalStore.profile).toBeUndefined();
      expect(LocalStore.consent).toBeUndefined();
      expect(LocalStore.persistenceConsent).toBeUndefined();
      expect(LocalStore.anonymousId).toBeUndefined();
      expect(() => {
        LocalStore.profile = { id: 'server' };
        LocalStore.consent = true;
        LocalStore.persistenceConsent = true;
        LocalStore.anonymousId = 'server';
        LocalStore.reset();
      }).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
