// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { signals } from '../signals/signals.js';
import { createSnapshotRuntime } from '../runtime.js';

afterEach(() => vi.restoreAllMocks());

describe('SnapshotRuntime', () => {
  it('exposes server state through static observables and the shared consent contract', () => {
    const runtime = createSnapshotRuntime({
      data: { profile: { id: 'server-visitor' } },
      consent: false,
      locale: 'de-DE',
      allowedEventTypes: ['component_click'],
    });
    expect(
      Object.fromEntries(Object.entries(runtime.states).map(([key, state]) => [key, state.current]))
    ).toEqual({
      profile: { id: 'server-visitor' },
      locale: 'de-DE',
      consent: false,
      persistenceConsent: false,
      experienceRequestState: { status: 'success' },
      eventStream: undefined,
      blockedEventStream: undefined,
    });
    const subscriber = vi.fn();
    runtime.states.profile.subscribe(subscriber).unsubscribe();
    expect(subscriber).toHaveBeenCalledExactlyOnceWith({ id: 'server-visitor' });
    expect(runtime.hasConsent('trackClick')).toBe(true);
    expect(runtime.hasConsent('page')).toBe(false);
  });

  it('keeps actions inert without transport or changes to snapshot or live state', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const liveState = () =>
      Object.fromEntries(Object.entries(signals).map(([name, signal]) => [name, signal.value]));
    const before = liveState();
    const runtime = createSnapshotRuntime({ data: { profile: { id: 'server' } }, locale: 'en-US' });
    await expect(runtime.page()).resolves.toEqual({ accepted: false });
    await expect(
      runtime.trackClick({ entityId: 'hero', entityKind: 'ExperienceFragment' })
    ).resolves.toBeUndefined();
    runtime.consent(true);
    runtime.reset();
    expect(runtime.setLocale('de-DE')).toBe('en-US');
    await runtime.flush();
    runtime.destroy();
    expect(runtime.states.profile.current).toEqual({ id: 'server' });
    expect(runtime.states.consent.current).toBeUndefined();
    expect(liveState()).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });
});
