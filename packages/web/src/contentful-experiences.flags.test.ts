import {
  ContentfulExperiences as RuntimeContentfulExperiences,
  type ChangeArray,
  type EventEmissionResult,
  type VariableChange,
  type OptimizationEventStreamEvent,
} from '@contentful/experiences-runtime';
import { ExperienceApiClient } from '@contentful/optimization-api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentfulExperiences, type ExperiencesWebConfig } from './contentful-experiences.js';
import { hydrateOptimizationData } from './bridge-support.js';
import { signalFns } from './signals/signals.js';
import { clearIdentityCookies, seedConsent } from './test-fixtures/consent.js';

const runtimes = new Set<ContentfulExperiences>();
const key = '__ctfl_opt_changes__';
function changes(
  value: VariableChange['value'] = true,
  experienceId = 'experiment',
  variantIndex = 1
): ChangeArray {
  return [{ type: 'Variable', key: 'banner', value, meta: { experienceId, variantIndex } }];
}
function createRuntime(config: Partial<ExperiencesWebConfig> = {}) {
  const sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'token' },
    autoTrackEntryInteraction: { views: false, clicks: false, hovers: false },
    defaults: { profile: { id: 'visitor' }, changes: changes(), consent: true },
    ...config,
  });
  runtimes.add(sdk);
  return sdk;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
beforeEach(() => seedConsent({ events: true, persistence: true }));
afterEach(() => {
  for (const runtime of runtimes) runtime.destroy();
  runtimes.clear();
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearIdentityCookies();
});

describe('Web Custom Flags', () => {
  it('reads live defaults and explicit raw changes with one winning value/meta record', async () => {
    const sdk = createRuntime();
    const track = vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    const raw = [
      ...changes(false, 'old', 0),
      ...changes({ value: [false, 'nested'] }, 'winner', 2),
      { type: 'Variable', key: 'banner', value: true },
    ];
    expect(sdk.getFlag('banner', raw)).toEqual([false, 'nested']);
    expect(track).toHaveBeenCalledExactlyOnceWith({
      componentId: 'banner',
      experienceId: 'winner',
      variantIndex: 2,
    });
    await settle();
    expect(sdk.getFlag('banner')).toBe(true);
  });

  it('deduplicates equivalent pending and accepted reads but tracks a missing flag', async () => {
    const sdk = createRuntime();
    const result = deferred<EventEmissionResult>();
    const track = vi.spyOn(sdk, 'trackFlagView').mockReturnValue(result.promise);
    sdk.getFlag('banner');
    void sdk.states.flag('banner').current;
    expect(track).toHaveBeenCalledTimes(1);
    result.resolve({ accepted: true });
    await settle();
    sdk.getFlag('banner');
    expect(track).toHaveBeenCalledTimes(1);
    expect(sdk.getFlag('missing')).toBeUndefined();
    expect(track).toHaveBeenLastCalledWith({
      componentId: 'missing',
      experienceId: undefined,
      variantIndex: undefined,
    });
  });

  it.each(['refused', 'rejected'] as const)(
    'retries a %s exposure on the next read',
    async (outcome) => {
      const sdk = createRuntime();
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const track = vi.spyOn(sdk, 'trackFlagView');
      if (outcome === 'refused') track.mockResolvedValue({ accepted: false });
      else track.mockRejectedValue(new Error('failed'));
      sdk.getFlag('banner');
      await settle();
      sdk.getFlag('banner');
      expect(track).toHaveBeenCalledTimes(2);
    }
  );

  it('keeps the latest accepted signature when older attempts complete last', async () => {
    const sdk = createRuntime();
    const old = deferred<EventEmissionResult>();
    const next = deferred<EventEmissionResult>();
    const track = vi
      .spyOn(sdk, 'trackFlagView')
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise)
      .mockResolvedValue({ accepted: true });
    sdk.getFlag('banner');
    sdk.getFlag('banner', changes(false));
    next.resolve({ accepted: true });
    await settle();
    old.resolve({ accepted: true });
    await settle();
    sdk.getFlag('banner', changes(false));
    expect(track).toHaveBeenCalledTimes(2);
    sdk.getFlag('banner');
    expect(track).toHaveBeenCalledTimes(3);
  });

  it('emits distinct values while tracking metadata and profile changes with equal values', async () => {
    const sdk = createRuntime();
    const track = vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    const next = vi.fn();
    const subscription = sdk.states.flag('banner').subscribe(next);
    await settle();
    await hydrateOptimizationData(sdk, { changes: changes(true, 'second', 2) });
    await settle();
    expect(next).toHaveBeenCalledExactlyOnceWith(true);
    expect(track).toHaveBeenCalledTimes(2);
    await hydrateOptimizationData(sdk, {
      profile: { id: 'second' },
      changes: changes(true, 'second', 2),
    });
    await settle();
    expect(next).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(3);
    await hydrateOptimizationData(sdk, { changes: changes(false) });
    await settle();
    expect(next.mock.calls).toEqual([[true], [false]]);
    subscription.unsubscribe();
    subscription.unsubscribe();
    await hydrateOptimizationData(sdk, { changes: changes(true) });
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('keeps .current reactive to flags without subscribing its caller to consent/profile', async () => {
    const sdk = createRuntime();
    vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    const flag = sdk.states.flag('banner');
    const next = vi.fn();
    const dispose = signalFns.effect(() => next(flag.current));
    sdk.consent({ events: false });
    await hydrateOptimizationData(sdk, { profile: { id: 'visitor', traits: { example: true } } });
    expect(next).toHaveBeenCalledExactlyOnceWith(true);
    await hydrateOptimizationData(sdk, { changes: changes(false) });
    expect(next.mock.calls).toEqual([[true], [false]]);
    dispose();
  });

  it('retries active subscriptions when consent and then profile become eligible', async () => {
    const sdk = createRuntime({ defaults: { changes: changes(), consent: false } });
    const track = vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: false });
    const subscription = sdk.states.flag('banner').subscribe(vi.fn());
    expect(track).not.toHaveBeenCalled();
    track.mockClear();
    sdk.consent({ events: true });
    expect(track).not.toHaveBeenCalled();
    track.mockResolvedValue({ accepted: true });
    await hydrateOptimizationData(sdk, { profile: { id: 'eligible' }, changes: changes() });
    expect(track).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it.each([false, true])(
    'uses existing consent/allowlist admission (flag allowed: %s)',
    async (allow) => {
      const sdk = createRuntime({
        defaults: { profile: { id: 'visitor' }, changes: changes(), consent: false },
        allowedEventTypes: allow ? ['flag'] : [],
      });
      const event = vi.fn();
      const subscription = sdk.states.eventStream.subscribe(event);
      sdk.getFlag('banner');
      await settle();
      expect(event.mock.calls.filter(([value]) => value !== undefined)).toHaveLength(allow ? 1 : 0);
      subscription.unsubscribe();
    }
  );

  it('quietly suppresses automatic exposure in preview', async () => {
    const sdk = createRuntime({ isPreview: true });
    sdk.getFlag('banner');
    await settle();
    expect(sdk.states.eventStream.current).toBeUndefined();
    expect(sdk.states.blockedEventStream.current).toBeUndefined();
  });

  it.each(['reset', 'withdraw', 'destroy'] as const)(
    'invalidates async acceptance after %s',
    async (action) => {
      const sdk = createRuntime();
      const result = deferred<EventEmissionResult>();
      const track = vi
        .spyOn(sdk, 'trackFlagView')
        .mockReturnValueOnce(result.promise)
        .mockResolvedValue({ accepted: true });
      sdk.getFlag('banner');
      if (action === 'reset') sdk.reset();
      else if (action === 'withdraw') sdk.consent({ events: false });
      else sdk.destroy();
      result.resolve({ accepted: true });
      await settle();
      if (action === 'destroy') {
        sdk.getFlag('banner');
        expect(track).toHaveBeenCalledTimes(1);
        return;
      }
      await hydrateOptimizationData(sdk, { profile: { id: 'visitor' }, changes: changes() });
      sdk.consent({ events: true });
      sdk.getFlag('banner');
      expect(track).toHaveBeenCalledTimes(2);
    }
  );

  it.each(['subscribe', 'subscribeOnce'] as const)(
    'does not leak active registration when a %s callback throws',
    async (method) => {
      const sdk = createRuntime();
      const track = vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
      expect(() =>
        sdk.states.flag('banner')[method](() => {
          throw new Error('subscriber');
        })
      ).toThrow('subscriber');
      await settle();
      track.mockClear();
      await hydrateOptimizationData(sdk, { changes: changes(false) });
      sdk.consent({ events: false });
      sdk.consent({ events: true });
      expect(track).not.toHaveBeenCalled();
    }
  );

  it('applies bridge profile, changes and success atomically and merges sparse same-identity state', async () => {
    const sdk = createRuntime();
    vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    const snapshots: unknown[] = [];
    const subscription = sdk.states.profile.subscribe(() =>
      snapshots.push([sdk.getFlag('banner'), sdk.states.experienceRequestState.current.status])
    );
    await hydrateOptimizationData(sdk, { profile: { id: 'next' }, changes: changes(false) });
    expect(snapshots.at(-1)).toEqual([false, 'success']);
    sdk.interceptors.state.add(() => ({ profile: { id: 'next', traits: { updated: true } } }));
    await hydrateOptimizationData(sdk, { changes: changes('retained') });
    expect(sdk.getFlag('banner')).toBe('retained');
    subscription.unsubscribe();
  });

  it('clears old flags on a profile-only identity replacement but retains same-identity flags', async () => {
    const sdk = createRuntime();
    vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    await hydrateOptimizationData(sdk, { profile: { id: 'visitor' } });
    expect(sdk.getFlag('banner')).toBe(true);
    await hydrateOptimizationData(sdk, { profile: { id: 'new-visitor' } });
    expect(sdk.getFlag('banner')).toBeUndefined();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('clears old flags when XDA replaces identity without adopting plan changes', async () => {
    const sdk = createRuntime();
    vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    vi.spyOn(RuntimeContentfulExperiences.prototype, 'fetchExperience').mockResolvedValue({
      personalization: { profileId: 'new-visitor', changes: changes('plan-only') },
      nodes: [],
    } as never);
    await sdk.fetchExperience({ experienceId: 'experience' }, { config: { components: {} } });
    expect(sdk.states.profile.current?.id).toBe('new-visitor');
    expect(sdk.getFlag('banner')).toBeUndefined();
  });

  it.each(['reset', 'withdraw', 'destroy'] as const)(
    'guards changes while a state interceptor awaits across %s',
    async (action) => {
      const sdk = createRuntime();
      vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
      const gate = deferred<void>();
      sdk.interceptors.state.add(async (state) => {
        await gate.promise;
        return state;
      });
      const pending = hydrateOptimizationData(sdk, {
        changes: changes(false),
        profile: { id: 'late' },
      });
      if (action === 'reset') sdk.reset();
      else if (action === 'withdraw') sdk.consent({ events: false });
      else sdk.destroy();
      gate.resolve();
      await pending;
      expect(sdk.getFlag('banner')).toBe(action === 'reset' ? undefined : true);
      expect(sdk.states.profile.current?.id).not.toBe('late');
    }
  );

  it('hydrates a private flag-only handoff without clearing browser identity', async () => {
    const sdk = createRuntime();
    vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    await sdk.hydrateHandoffState(
      {
        spaceId: 'space',
        environmentId: 'environment',
        cache: { scope: 'private-request' },
        state: { changes: changes(false) },
      },
      { routeKey: '/' }
    );
    expect(sdk.getFlag('banner')).toBe(false);
    expect(sdk.states.profile.current?.id).toBe('visitor');
  });

  it('applies direct Personalization response changes along with profile state', async () => {
    const sdk = createRuntime();
    vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    vi.spyOn(ExperienceApiClient.prototype, 'upsertProfile').mockResolvedValue({
      profile: { id: 'visitor' },
      changes: changes(false),
    } as never);
    await sdk.page();
    expect(sdk.getFlag('banner')).toBe(false);
  });

  it('loads/persists changes with independent persistence consent and configured precedence', () => {
    window.localStorage.setItem(key, JSON.stringify(changes('stored')));
    const sdk = createRuntime({ defaults: { persistenceConsent: true } });
    vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    expect(sdk.getFlag('banner')).toBe('stored');
    sdk.consent({ persistence: false });
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(sdk.getFlag('banner')).toBe('stored');
    sdk.destroy();
    window.localStorage.setItem(key, JSON.stringify(changes('stored')));
    const next = createRuntime({
      defaults: { persistenceConsent: false, changes: changes('configured') },
    });
    vi.spyOn(next, 'trackFlagView').mockResolvedValue({ accepted: true });
    expect(next.getFlag('banner')).toBe('configured');
    expect(window.localStorage.getItem(key)).toBeNull();
    next.reset();
    expect(next.getFlag('banner')).toBeUndefined();
  });
  it('stops subscribeOnce bookkeeping after the first false value and supports cleanup while missing', async () => {
    const sdk = createRuntime({ defaults: { profile: { id: 'visitor' }, consent: true } });
    const track = vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    const next = vi.fn();
    const subscription = sdk.states.flag('banner').subscribeOnce(next);
    await settle();
    await hydrateOptimizationData(sdk, { changes: changes(false) });
    await settle();
    expect(next).toHaveBeenCalledExactlyOnceWith(false);
    subscription.unsubscribe();
    track.mockClear();
    await hydrateOptimizationData(sdk, { changes: changes(true) });
    expect(track).not.toHaveBeenCalled();
    const waiting = sdk.states.flag('missing').subscribeOnce(next);
    await settle();
    waiting.unsubscribe();
    track.mockClear();
    await hydrateOptimizationData(sdk, { profile: { id: 'different' }, changes: changes() });
    expect(track).not.toHaveBeenCalled();
  });

  it('does not let an old caller-owned subscription expose a replacement instance', async () => {
    const sdk = createRuntime();
    const oldTrack = vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    const subscription = sdk.states.flag('banner').subscribe(vi.fn());
    await settle();
    sdk.destroy();
    oldTrack.mockClear();
    const replacement = createRuntime();
    const newTrack = vi.spyOn(replacement, 'trackFlagView').mockResolvedValue({ accepted: true });
    await hydrateOptimizationData(replacement, { changes: changes(false) });
    expect(oldTrack).not.toHaveBeenCalled();
    expect(newTrack).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it.each(['reset', 'reset then withdraw', 'reset then destroy'] as const)(
    'invalidates exposure acceptance when event publication reenters %s',
    async (action) => {
      const sdk = createRuntime();
      let reset = false;
      const subscription = sdk.states.eventStream.subscribe((event) => {
        if (event && !reset) {
          reset = true;
          sdk.reset();
          if (action === 'reset then withdraw') sdk.consent({ events: false });
          if (action === 'reset then destroy') sdk.destroy();
        }
      });
      sdk.getFlag('banner');
      await settle();
      expect(sdk.states.profile.current).toBeUndefined();
      const current = action === 'reset then destroy' ? createRuntime() : sdk;
      await hydrateOptimizationData(current, { profile: { id: 'visitor' }, changes: changes() });
      current.consent({ events: true });
      current.getFlag('banner');
      await settle();
      expect(current.states.eventStream.current).toMatchObject({ type: 'component' });
      subscription.unsubscribe();
    }
  );
  it('preserves browser identity when an interceptor adds profile to a private flag-only handoff', async () => {
    const sdk = createRuntime();
    vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
    sdk.interceptors.state.add(() => ({ profile: { id: 'invented' } }));
    await sdk.hydrateHandoffState(
      {
        spaceId: 'space',
        environmentId: 'environment',
        cache: { scope: 'private-request' },
        state: { changes: changes(false) },
      },
      { routeKey: '/' }
    );
    expect(sdk.states.profile.current?.id).toBe('visitor');
    expect(sdk.getFlag('banner')).toBe(false);
  });
  it.each<VariableChange['value']>([
    { nested: { value: true } },
    { value: [true, { nested: true }] },
  ])('keeps exposure signatures stable after returned value mutation: %j', async (value) => {
    const sdk = createRuntime({
      defaults: { profile: { id: 'visitor' }, changes: changes(value), consent: true },
    });
    const pending = deferred<EventEmissionResult>();
    const track = vi
      .spyOn(sdk, 'trackFlagView')
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ accepted: true });
    const returned = sdk.getFlag('banner');
    if (Array.isArray(returned)) returned[0] = false;
    else if (returned && typeof returned === 'object' && 'nested' in returned)
      returned.nested = false;
    sdk.getFlag('banner');
    expect(track).toHaveBeenCalledTimes(1);
    pending.resolve({ accepted: true });
    await settle();
    sdk.getFlag('banner');
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('retries active flag exposure after repeated denial invalidates pending allowlisted work', async () => {
    const sdk = createRuntime({
      defaults: { profile: { id: 'visitor' }, changes: changes(), consent: false },
      allowedEventTypes: ['flag'],
    });
    const pending = deferred<void>();
    const interceptor = vi.fn(async (event: OptimizationEventStreamEvent) => {
      await pending.promise;
      return event;
    });
    sdk.interceptors.event.add(interceptor);
    const subscription = sdk.states.flag('banner').subscribe(vi.fn());
    expect(interceptor).toHaveBeenCalledTimes(1);
    sdk.consent({ events: false });
    expect(interceptor).toHaveBeenCalledTimes(2);
    pending.resolve();
    await settle();
    expect(sdk.states.eventStream.current).toMatchObject({ type: 'component' });
    const attempts = interceptor.mock.calls.length;
    sdk.getFlag('banner');
    await settle();
    expect(interceptor).toHaveBeenCalledTimes(attempts);
    subscription.unsubscribe();
  });
  it.each(['public-permutation', 'static'] as const)(
    'keeps browser identity and flags when a %s handoff interceptor invents state',
    async (scope) => {
      const sdk = createRuntime();
      vi.spyOn(sdk, 'trackFlagView').mockResolvedValue({ accepted: true });
      sdk.interceptors.state.add(() => ({ profile: { id: 'invented' }, changes: changes(false) }));
      await sdk.hydrateHandoffState(
        {
          spaceId: 'space',
          environmentId: 'environment',
          cache: scope === 'public-permutation' ? { scope, key: 'permutation' } : { scope },
        },
        { routeKey: '/' }
      );
      expect(sdk.states.profile.current?.id).toBe('visitor');
      expect(sdk.getFlag('banner')).toBe(true);
      expect(sdk.states.experienceRequestState.current).toEqual({ status: 'success' });
    }
  );
});
