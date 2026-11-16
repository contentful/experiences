// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effect } from '@preact/signals-core';
import {
  ANONYMOUS_ID_COOKIE,
  type Config as RuntimeConfig,
  type ChangeArray,
  type BlockedEvent,
} from '@contentful/experiences-runtime';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { WebStateRuntime } from './web-state-runtime.js';
import { hydrateOptimizationData } from '../bridge-support.js';
import type { PersonalizationState } from '../state/interceptors.js';
import type { ConfigDefaults } from './types.js';
import * as signals from '../signals/signals.js';
import LocalStore from '../storage/local-store.js';
import { deferred } from '../test/dom.js';
import { completeProfile } from '../test/fixtures/profile.js';
import { clearIdentityCookies } from '../test/consent.js';

const changes = (value: string | boolean): ChangeArray => [
  { type: 'Variable', key: 'banner', value, meta: { experienceId: 'experiment', variantIndex: 1 } },
];
const disposers: (() => void)[] = [];
const owners: StateRuntime[] = [];

class StateRuntime extends WebStateRuntime<RuntimeConfig> {
  constructor(readonly preview = false) {
    super({
      spaceId: 'space',
      environmentId: 'environment',
      delivery: { accessToken: 'token' },
      eventBuilder: { channel: 'web', library: { name: 'test', version: '1' } },
    });
    this.getAnonymousIdProvider = () => this.anonymousId();
    this.initializeIdentity(undefined);
    owners.push(this);
  }
  get isPreview() {
    return this.preview;
  }
  hasConsent() {
    return true;
  }
  readonly trackFlagView = vi.fn(async () => ({ accepted: true as const }));
  readonly anonymousId = vi.fn<() => string | undefined>(() => undefined);
  readonly syncConsent = vi.fn();
  protected reportBlockedEvent(_event: BlockedEvent) {}
  protected syncInteractionConsent() {
    this.syncConsent();
  }
  reset() {
    this.resetToken = {};
    signals.batch(() => this.resetVisitorState());
  }
  stop() {
    this.destroyed = true;
    for (const dispose of this.effects.splice(0)) dispose();
  }
  initialize(defaults: ConfigDefaults | undefined, locale = 'de-DE') {
    this.initializeBrowserState(defaults, locale);
  }
  revisions() {
    this.effects.push(this.installStateRevisionEffect());
  }
  persistence() {
    this.effects.push(this.installPersistenceConsentEffect());
    this.effects.push(this.installProfilePersistenceEffect());
  }
  consentEffect() {
    this.effects.push(this.installConsentEffect());
  }
  apply(
    data: PersonalizationState,
    current = () => true,
    profile = () => true,
    flags = () => true
  ) {
    return this.applyOptimizationDataToSignals(data, current, profile, flags);
  }
  adopt(data: PortableRenderPlan['personalization'], current = () => true) {
    return this.adoptFetchedState(data, current);
  }
  identityForRequest() {
    return this.requestIdentity();
  }
  adopted(id: string | undefined) {
    this.setAdoptedProfileId(id);
  }
  bridge() {
    this.installCoreBridge();
  }
}

function createState(preview = false) {
  const state = new StateRuntime(preview);
  state.initialize({
    profile: completeProfile('visitor'),
    changes: changes(true),
    consent: true,
    persistenceConsent: false,
  });
  state.revisions();
  return state;
}
beforeEach(() => {
  window.localStorage.clear();
  clearIdentityCookies();
});
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  for (const owner of owners.splice(0)) owner.stop();
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearIdentityCookies();
});

describe('WebStateRuntime', () => {
  it('publishes intercepted profile, changes and success atomically and retains sparse fields', async () => {
    const state = createState();
    const snapshots: unknown[] = [];
    disposers.push(
      effect(() => {
        snapshots.push([
          signals.profile.value?.id,
          signals.changes.value,
          signals.personalizationRequestState.value.status,
        ]);
      })
    );
    const observerSnapshots: unknown[] = [];
    const subscription = state.states.profile.subscribe(() => {
      observerSnapshots.push([
        state.getFlag('banner'),
        state.states.personalizationRequestState.current.status,
      ]);
    });
    disposers.push(() => subscription.unsubscribe());
    state.bridge();
    await hydrateOptimizationData(state, {
      profile: completeProfile('next'),
      changes: changes(false),
    });
    expect(snapshots).toEqual([
      ['visitor', changes(true), 'idle'],
      ['next', changes(false), 'success'],
    ]);
    expect(observerSnapshots).toEqual([
      [true, 'idle'],
      [false, 'success'],
    ]);
    state.interceptors.state.add(() => ({
      profile: completeProfile('next', { traits: { updated: true } }),
    }));
    state.interceptors.state.add(() => ({}));
    await hydrateOptimizationData(state, { changes: changes('retained') });
    expect(state.states.profile.current).toEqual(
      completeProfile('next', { traits: { updated: true } })
    );
    expect(signals.changes.value).toEqual(changes('retained'));
    expect(observerSnapshots.at(-1)).toEqual(['retained', 'success']);
  });

  it('retains flags for the same identity and clears them for profile-only replacement', async () => {
    const state = createState();
    signals.persistenceConsent.value = true;
    state.persistence();
    expect(LocalStore.changes).toEqual(changes(true));
    expect(window.localStorage.getItem('__ctfl_opt_changes__')).not.toBeNull();
    await state.apply({ profile: completeProfile('visitor') });
    expect(signals.changes.value).toEqual(changes(true));
    expect(LocalStore.changes).toEqual(changes(true));
    await state.apply({ profile: completeProfile('next') });
    expect(signals.changes.value).toBeUndefined();
    expect(window.localStorage.getItem('__ctfl_opt_changes__')).toBeNull();
    await state.adopt({ profile: completeProfile('next'), changes: [] });
    expect(signals.changes.value).toEqual([]);
    await state.apply({ profile: undefined, changes: undefined });
    expect(state.states.profile.current).toBeUndefined();
    expect(signals.changes.value).toBeUndefined();
  });

  it('adopts preview changes without replacing visitor identity', async () => {
    const state = createState(true);
    await state.adopt({ profile: completeProfile('preview'), changes: changes(false) });
    expect(state.states.profile.current).toEqual(completeProfile('visitor'));
    expect(signals.changes.value).toEqual(changes(false));
  });

  it.each(['reset', 'destroy', 'currentness'] as const)(
    'discards pending state interception across %s',
    async (action) => {
      const state = createState();
      const started = deferred<void>();
      const gate = deferred<void>();
      let current = true;
      state.interceptors.state.add(async (data) => {
        started.resolve();
        await gate.promise;
        return data;
      });
      const pending = state.apply({ profile: completeProfile('late'), changes: [] }, () => current);
      await started.promise;
      if (action === 'reset') state.reset();
      else if (action === 'destroy') state.stop();
      else current = false;
      gate.resolve();
      await pending;
      expect(state.states.profile.current).toEqual(
        action === 'reset' ? undefined : completeProfile('visitor')
      );
      expect(signals.changes.value).toEqual(action === 'reset' ? undefined : changes(true));
      expect(state.states.personalizationRequestState.current).toEqual({ status: 'idle' });
    }
  );

  it('prevents pending interception from overwriting a later committed revision', async () => {
    const state = createState();
    const gate = deferred<void>();
    const started = deferred<void>();
    state.interceptors.state.add(async (data) => {
      if (data.changes?.length === 0) {
        started.resolve();
        await gate.promise;
      }
      return data;
    });
    const pending = state.apply({ profile: completeProfile('late'), changes: [] });
    await started.promise;
    await state.apply({ profile: completeProfile('fresh'), changes: changes('fresh') });
    gate.resolve();
    await pending;
    expect(state.states.profile.current).toEqual(completeProfile('fresh'));
    expect(signals.changes.value).toEqual(changes('fresh'));
  });

  it('propagates state interceptor errors without partial publication', async () => {
    const state = createState();
    const error = new Error('state rejected');
    state.interceptors.state.add(() => {
      throw error;
    });
    await expect(state.apply({ changes: [] })).rejects.toThrow(error);
    expect(signals.changes.value).toEqual(changes(true));
    expect(state.states.personalizationRequestState.current).toEqual({ status: 'idle' });
  });

  it('reads the current anonymous provider before profile and adopted identity fallbacks', () => {
    const state = createState();
    state.adopted('adopted');
    state.anonymousId.mockReturnValueOnce('external-1').mockReturnValueOnce('external-2');
    expect(state.identityForRequest()).toBe('external-1');
    expect(state.identityForRequest()).toBe('external-2');
    expect(state.identityForRequest()).toBe('visitor');
    signals.profile.value = undefined;
    expect(state.identityForRequest()).toBe('adopted');
  });

  it.each([undefined, false, true])(
    'persists profile and identity only with persistence %s',
    (consent) => {
      const state = createState();
      signals.persistenceConsent.value = consent;
      state.persistence();
      expect(LocalStore.profile).toEqual(consent ? completeProfile('visitor') : undefined);
      expect(LocalStore.changes).toEqual(consent ? changes(true) : undefined);
      expect(LocalStore.anonymousId).toBe(consent ? 'visitor' : undefined);
      expect(document.cookie).toBe(consent ? `${ANONYMOUS_ID_COOKIE}=visitor` : '');
      expect(state.states.profile.current).toEqual(completeProfile('visitor'));
    }
  );

  it('persists later grants and adopted identity, then gives a complete profile precedence', () => {
    const state = createState();
    state.persistence();
    expect(LocalStore.profile).toBeUndefined();
    signals.persistenceConsent.value = true;
    expect(LocalStore.profile).toEqual(completeProfile('visitor'));
    expect(document.cookie).toBe(`${ANONYMOUS_ID_COOKIE}=visitor`);
    signals.persistenceConsent.value = false;
    signals.profile.value = undefined;
    state.adopted('handoff');
    expect(LocalStore.anonymousId).toBeUndefined();
    signals.persistenceConsent.value = true;
    expect(LocalStore.anonymousId).toBe('handoff');
    signals.profile.value = completeProfile('complete');
    expect(LocalStore.profile).toEqual(completeProfile('complete'));
    expect(document.cookie).toBe(`${ANONYMOUS_ID_COOKIE}=complete`);
  });

  it('clears continuity on persistence denial while retaining memory and event consent', () => {
    const state = createState();
    signals.persistenceConsent.value = true;
    state.persistence();
    document.cookie = 'ntaid=legacy; path=/';
    signals.persistenceConsent.value = false;
    expect(LocalStore.profile).toBeUndefined();
    expect(LocalStore.changes).toBeUndefined();
    expect(LocalStore.anonymousId).toBeUndefined();
    expect(document.cookie).toBe('');
    expect(state.states.profile.current).toEqual(completeProfile('visitor'));
    expect(state.states.consent.current).toBe(true);
  });

  it('keeps preview effects from persisting or deleting visitor continuity', () => {
    const state = createState(true);
    LocalStore.profile = completeProfile('stored');
    LocalStore.anonymousId = 'stored';
    document.cookie = `${ANONYMOUS_ID_COOKIE}=stored; path=/`;
    state.persistence();
    signals.persistenceConsent.value = true;
    signals.profile.value = completeProfile('preview');
    signals.persistenceConsent.value = false;
    expect(LocalStore.profile).toEqual(completeProfile('stored'));
    expect(LocalStore.anonymousId).toBe('stored');
    expect(document.cookie).toBe(`${ANONYMOUS_ID_COOKIE}=stored`);
    expect(LocalStore.persistenceConsent).toBe(false);
  });

  it('stops disposed persistence effects and refuses incoming state after destruction', async () => {
    const state = createState();
    signals.persistenceConsent.value = true;
    state.persistence();
    state.stop();
    signals.profile.value = completeProfile('replacement');
    await state.apply({ profile: completeProfile('late'), changes: [] });
    expect(state.states.profile.current).toEqual(completeProfile('replacement'));
    expect(LocalStore.profile).toEqual(completeProfile('visitor'));
    expect(LocalStore.anonymousId).toBe('visitor');
  });

  it('persists consent before synchronizing without tracking callback dependencies', () => {
    const state = createState();
    state.syncConsent.mockImplementation(() => {
      expect(LocalStore.consent).toBe(signals.consent.peek());
      void signals.profile.value;
    });
    state.consentEffect();
    signals.consent.value = false;
    signals.profile.value = completeProfile('other');
    expect(state.syncConsent).toHaveBeenCalledTimes(2);
    expect(LocalStore.consent).toBe(false);
  });

  it('resets state and persistence while preserving consent and locale', () => {
    const state = createState();
    signals.persistenceConsent.value = true;
    state.persistence();
    state.reset();
    expect(state.states.profile.current).toBeUndefined();
    expect(signals.changes.value).toBeUndefined();
    expect(state.states.eventStream.current).toBeUndefined();
    expect(state.states.blockedEventStream.current).toBeUndefined();
    expect(state.states.personalizationRequestState.current).toEqual({ status: 'idle' });
    expect(state.states.locale.current).toBe('de-DE');
    expect(state.states.consent.current).toBe(true);
    expect(state.states.persistenceConsent.current).toBe(true);
    expect(LocalStore.profile).toBeUndefined();
    expect(document.cookie).toBe('');
  });
});
