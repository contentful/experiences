import { completeProfile as profileFixture } from './test-fixtures/profile.js';
import { describe, expect, it, vi } from 'vitest';
import { resolveStatefulDefaults } from './stateful-defaults.js';

describe('resolveStatefulDefaults', () => {
  it('resolves configured consent before persisted decisions, with an independent persistence override', () => {
    const persisted = { consent: true, persistenceConsent: true };
    expect(resolveStatefulDefaults(undefined, persisted).defaults).toMatchObject(persisted);
    expect(resolveStatefulDefaults({ consent: false }, persisted)).toEqual({
      defaults: {
        consent: false,
        persistenceConsent: false,
        profile: undefined,
        changes: undefined,
      },
      canLoadPersistedContinuity: false,
    });
    expect(
      resolveStatefulDefaults({ consent: false, persistenceConsent: true }, persisted).defaults
    ).toMatchObject({ consent: false, persistenceConsent: true });
  });

  it('reads persisted profile lazily only when permitted and no explicit profile exists', () => {
    const profile = profileFixture('stored');
    const loadProfile = vi.fn(() => profile);
    for (const persistenceConsent of [undefined, false]) {
      expect(
        resolveStatefulDefaults(undefined, { profile: loadProfile, persistenceConsent }).defaults
          .profile
      ).toBeUndefined();
    }
    const configured = { profile: profileFixture('configured'), persistenceConsent: true };
    expect(resolveStatefulDefaults(configured, { profile: loadProfile }).defaults.profile).toBe(
      configured.profile
    );
    expect(loadProfile).not.toHaveBeenCalled();
    expect(
      resolveStatefulDefaults(undefined, { persistenceConsent: true, profile: loadProfile })
        .defaults.profile
    ).toBe(profile);
    expect(loadProfile).toHaveBeenCalledOnce();
  });
});

it('loads changes lazily only with persistence consent and no configured changes', () => {
  const loadChanges = vi.fn(() => []);
  expect(
    resolveStatefulDefaults(undefined, { changes: loadChanges }).defaults.changes
  ).toBeUndefined();
  expect(
    resolveStatefulDefaults({ changes: [], persistenceConsent: true }, { changes: loadChanges })
      .defaults.changes
  ).toEqual([]);
  expect(loadChanges).not.toHaveBeenCalled();
  expect(
    resolveStatefulDefaults(undefined, { persistenceConsent: true, changes: loadChanges }).defaults
      .changes
  ).toEqual([]);
  expect(loadChanges).toHaveBeenCalledOnce();
});
