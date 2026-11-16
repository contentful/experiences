import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChangeArray,
  EventEmissionResult,
  Json,
  VariableChange,
} from '@contentful/experiences-runtime';
import { FlagExposure } from './flag-exposure.js';
import {
  changes as changesSignal,
  profile as profileSignal,
  consent as consentSignal,
  signalFns,
} from '../signals/signals.js';
import { completeProfile } from '../test/fixtures/profile.js';
import { deferred } from '../test/dom.js';

function changes(
  value: VariableChange['value'] = true,
  experienceId = 'experiment',
  variantIndex = 1
): ChangeArray {
  return [{ type: 'Variable', key: 'banner', value, meta: { experienceId, variantIndex } }];
}
const cleanups: (() => void)[] = [];
function exposure() {
  const lifetime = { destroyed: false, resetToken: {} };
  const blocked = vi.fn();
  const sdk = {
    isPreview: false,
    hasConsent: vi.fn(() => consentSignal.value === true),
    trackFlagView: vi
      .fn<
        (_: {
          componentId: string;
          experienceId?: string;
          variantIndex?: number;
        }) => Promise<EventEmissionResult>
      >()
      .mockResolvedValue({ accepted: true }),
    getFlag: (
      name: string,
      values: readonly unknown[] | undefined = changesSignal.value
    ): Json | undefined => flags.read(name, values),
  };
  const flags = new FlagExposure(
    sdk,
    () => (lifetime.destroyed ? undefined : lifetime.resetToken),
    blocked
  );
  const stop = flags.installRetryEffect();
  cleanups.push(() => {
    lifetime.destroyed = true;
    stop();
    flags.destroy();
  });
  return { flags, sdk, lifetime, blocked };
}
async function settle() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
beforeEach(() => {
  profileSignal.value = completeProfile('visitor');
  changesSignal.value = changes();
  consentSignal.value = true;
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

describe('FlagExposure', () => {
  it('reads live changes and explicit raw changes with the winning value and attribution', async () => {
    const { sdk } = exposure();
    const raw = [
      ...changes(false, 'old', 0),
      ...changes({ value: [false, 'nested'] }, 'winner', 2),
      { type: 'Variable', key: 'banner', value: true },
    ];
    expect(sdk.getFlag('banner', raw)).toEqual([false, 'nested']);
    expect(sdk.trackFlagView).toHaveBeenCalledExactlyOnceWith({
      componentId: 'banner',
      experienceId: 'winner',
      variantIndex: 2,
    });
    await settle();
    expect(sdk.getFlag('banner')).toBe(true);
  });

  it('deduplicates pending and accepted reads and observes a missing flag', async () => {
    const { sdk, flags } = exposure();
    const pending = deferred<EventEmissionResult>();
    sdk.trackFlagView.mockReturnValue(pending.promise);
    sdk.getFlag('banner');
    void flags.observable('banner').current;
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(1);
    pending.resolve({ accepted: true });
    await settle();
    sdk.getFlag('banner');
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(1);
    expect(sdk.getFlag('missing')).toBeUndefined();
    expect(sdk.trackFlagView).toHaveBeenLastCalledWith({
      componentId: 'missing',
      experienceId: undefined,
      variantIndex: undefined,
    });
  });

  it.each(['refused', 'rejected'] as const)(
    'retries a %s exposure on the next read',
    async (outcome) => {
      const { sdk } = exposure();
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      if (outcome === 'refused') sdk.trackFlagView.mockResolvedValue({ accepted: false });
      else sdk.trackFlagView.mockRejectedValue(new Error('failed'));
      sdk.getFlag('banner');
      await settle();
      sdk.getFlag('banner');
      expect(sdk.trackFlagView).toHaveBeenCalledTimes(2);
    }
  );

  it('retains the newest accepted signature when an older attempt finishes last', async () => {
    const { sdk } = exposure();
    const old = deferred<EventEmissionResult>(),
      next = deferred<EventEmissionResult>();
    sdk.trackFlagView.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    sdk.getFlag('banner');
    sdk.getFlag('banner', changes(false));
    next.resolve({ accepted: true });
    await settle();
    old.resolve({ accepted: true });
    await settle();
    sdk.getFlag('banner', changes(false));
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(2);
    sdk.getFlag('banner');
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(3);
  });

  it('notifies distinct values while refreshing exposure for equal values with changed metadata/profile', async () => {
    const { sdk, flags } = exposure();
    const next = vi.fn();
    const subscription = flags.observable('banner').subscribe(next);
    await settle();
    changesSignal.value = changes(true, 'second', 2);
    await settle();
    expect(next).toHaveBeenCalledExactlyOnceWith(true);
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(2);
    profileSignal.value = completeProfile('second');
    await settle();
    expect(next).toHaveBeenCalledTimes(1);
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(3);
    changesSignal.value = changes(false);
    await settle();
    expect(next.mock.calls).toEqual([[true], [false]]);
    subscription.unsubscribe();
    subscription.unsubscribe();
    changesSignal.value = changes(true);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('keeps current reactive to values without tracking consent/profile dependencies', () => {
    const { flags } = exposure();
    const flag = flags.observable('banner'),
      next = vi.fn();
    const dispose = signalFns.effect(() => next(flag.current));
    consentSignal.value = false;
    profileSignal.value = completeProfile('visitor', { traits: { example: true } });
    expect(next).toHaveBeenCalledExactlyOnceWith(true);
    changesSignal.value = changes(false);
    expect(next.mock.calls).toEqual([[true], [false]]);
    dispose();
  });

  it('retries an active subscription after consent and then profile become eligible', () => {
    consentSignal.value = false;
    profileSignal.value = undefined;
    const { sdk, flags } = exposure();
    sdk.trackFlagView.mockResolvedValue({ accepted: false });
    const subscription = flags.observable('banner').subscribe(vi.fn());
    expect(sdk.trackFlagView).not.toHaveBeenCalled();
    consentSignal.value = true;
    expect(sdk.trackFlagView).not.toHaveBeenCalled();
    sdk.trackFlagView.mockResolvedValue({ accepted: true });
    profileSignal.value = completeProfile('eligible');
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it.each([false, true])(
    'delegates exposure eligibility and reports a refused read (allowed: %s)',
    (allow) => {
      consentSignal.value = false;
      const { sdk, blocked } = exposure();
      sdk.hasConsent.mockReturnValue(allow);
      sdk.getFlag('banner');
      expect(sdk.trackFlagView).toHaveBeenCalledTimes(allow ? 1 : 0);
      expect(blocked).toHaveBeenCalledTimes(allow ? 0 : 1);
      if (!allow)
        expect(blocked).toHaveBeenCalledWith({
          reason: 'consent',
          method: 'trackFlagView',
          args: [{ componentId: 'banner', experienceId: 'experiment', variantIndex: 1 }],
        });
    }
  );

  it('returns flag values without exposing or reporting when the visitor profile is missing', async () => {
    profileSignal.value = undefined;
    const { sdk, flags, blocked } = exposure();
    expect(sdk.getFlag('banner')).toBe(true);
    expect(flags.observable('banner').current).toBe(true);
    expect(sdk.trackFlagView).not.toHaveBeenCalled();
    expect(blocked).not.toHaveBeenCalled();

    profileSignal.value = completeProfile('eligible');
    expect(sdk.getFlag('banner')).toBe(true);
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(1);
    await settle();
    sdk.getFlag('banner');
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(1);
  });

  it('quietly suppresses preview and destroyed reads before eligibility callbacks', () => {
    const { sdk, lifetime, blocked } = exposure();
    sdk.hasConsent.mockClear();
    sdk.isPreview = true;
    sdk.getFlag('banner');
    sdk.isPreview = false;
    lifetime.destroyed = true;
    sdk.getFlag('banner');
    expect(sdk.hasConsent).not.toHaveBeenCalled();
    expect(sdk.trackFlagView).not.toHaveBeenCalled();
    expect(blocked).not.toHaveBeenCalled();
  });

  it.each(['reset', 'withdraw', 'destroy'] as const)(
    'invalidates async acceptance after %s',
    async (action) => {
      const { sdk, flags, lifetime } = exposure();
      const pending = deferred<EventEmissionResult>();
      sdk.trackFlagView.mockReturnValueOnce(pending.promise);
      sdk.getFlag('banner');
      lifetime.resetToken = {};
      if (action === 'destroy') {
        lifetime.destroyed = true;
        flags.destroy();
      } else flags.clearAttempts();
      pending.resolve({ accepted: true });
      await settle();
      sdk.getFlag('banner');
      expect(sdk.trackFlagView).toHaveBeenCalledTimes(action === 'destroy' ? 1 : 2);
    }
  );

  it.each(['subscribe', 'subscribeOnce'] as const)(
    'unregisters when a %s callback throws',
    async (method) => {
      const { sdk, flags } = exposure();
      expect(() =>
        flags.observable('banner')[method](() => {
          throw new Error('subscriber');
        })
      ).toThrow('subscriber');
      await settle();
      sdk.trackFlagView.mockClear();
      changesSignal.value = changes(false);
      consentSignal.value = false;
      consentSignal.value = true;
      expect(sdk.trackFlagView).not.toHaveBeenCalled();
    }
  );

  it('ends subscribeOnce after false and supports cleanup while the value is missing', async () => {
    changesSignal.value = undefined;
    const { sdk, flags } = exposure();
    const next = vi.fn(),
      subscription = flags.observable('banner').subscribeOnce(next);
    await settle();
    changesSignal.value = changes(false);
    await settle();
    expect(next).toHaveBeenCalledExactlyOnceWith(false);
    subscription.unsubscribe();
    sdk.trackFlagView.mockClear();
    changesSignal.value = changes(true);
    expect(sdk.trackFlagView).not.toHaveBeenCalled();
    const waiting = flags.observable('missing').subscribeOnce(next);
    await settle();
    waiting.unsubscribe();
    sdk.trackFlagView.mockClear();
    profileSignal.value = completeProfile('different');
    changesSignal.value = changes();
    expect(sdk.trackFlagView).not.toHaveBeenCalled();
  });

  it('keeps caller-owned subscriptions from exposing a replacement owner', async () => {
    const old = exposure(),
      subscription = old.flags.observable('banner').subscribe(vi.fn());
    await settle();
    old.lifetime.destroyed = true;
    old.flags.destroy();
    old.sdk.trackFlagView.mockClear();
    const replacement = exposure();
    changesSignal.value = changes(false);
    expect(old.sdk.trackFlagView).not.toHaveBeenCalled();
    expect(replacement.sdk.trackFlagView).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it.each<VariableChange['value']>([
    { nested: { value: true } },
    { value: [true, { nested: true }] },
  ])('keeps exposure signatures detached from returned mutation: %j', async (value) => {
    changesSignal.value = changes(value);
    const { sdk } = exposure();
    const pending = deferred<EventEmissionResult>();
    sdk.trackFlagView.mockReturnValueOnce(pending.promise);
    const returned = sdk.getFlag('banner');
    if (Array.isArray(returned)) returned[0] = false;
    else if (returned && typeof returned === 'object' && 'nested' in returned)
      returned.nested = false;
    sdk.getFlag('banner');
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(1);
    pending.resolve({ accepted: true });
    await settle();
    sdk.getFlag('banner');
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(1);
  });

  it('retries active allowlisted work after its owner invalidates and clears pending attempts', async () => {
    consentSignal.value = false;
    const { sdk, flags, lifetime } = exposure();
    sdk.hasConsent.mockReturnValue(true);
    const pending = deferred<EventEmissionResult>();
    sdk.trackFlagView.mockReturnValueOnce(pending.promise);
    const subscription = flags.observable('banner').subscribe(vi.fn());
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(1);
    lifetime.resetToken = {};
    flags.clearAttempts();
    flags.retryActive();
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(2);
    pending.resolve({ accepted: true });
    await settle();
    sdk.getFlag('banner');
    expect(sdk.trackFlagView).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });
});
