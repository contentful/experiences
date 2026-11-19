/** @vitest-environment jsdom */

import { act, StrictMode, Suspense, startTransition, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { States, Observable, WebExperiencesRuntime } from '@contentful/experiences-web';
import { RuntimeContext } from './context.js';
import { createDomTestRoot, type DomTestRoot } from '../test/dom-root.js';
import { profileFixture } from '../test/fixtures/profile.js';
import * as hooks from './use-experiences-state.js';

const context = (sdk: WebExperiencesRuntime) => ({
  sdk,
  error: undefined,
  isLive: false as const,
  isContentReady: true,
});

function observable<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  const retired: Array<(value: T) => void> = [];
  const copy = (item: T): T =>
    item !== null && typeof item === 'object' ? ({ ...item } as T) : item;
  const read = vi.fn(() => copy(value));
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((next: (value: T) => void) => {
    listeners.add(next);
    next(copy(value));
    return {
      unsubscribe() {
        unsubscribe();
        listeners.delete(next);
        retired.push(next);
      },
    };
  });
  const store: Observable<T> = {
    get current() {
      return read();
    },
    subscribe,
    subscribeOnce: vi.fn(() => {
      throw new Error('State hooks must subscribe to ongoing updates');
    }),
  };
  return {
    store,
    read,
    subscribe,
    unsubscribe,
    listeners,
    emit(next: T) {
      value = next;
      listeners.forEach((listener) => listener(copy(value)));
    },
    emitRetired(next: T) {
      retired.forEach((listener) => listener(copy(next)));
    },
    setBeforeSubscribe(next: T) {
      value = next;
    },
  };
}

// Only the observable boundary is exercised; no real SDK or transport is created.
function runtime(states: Partial<States>): WebExperiencesRuntime {
  return { states } as WebExperiencesRuntime;
}

describe('Experiences state hooks', () => {
  let rendered: DomTestRoot;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    rendered = createDomTestRoot();
    container = rendered.container;
  });

  afterEach(() => {
    act(() => rendered.cleanup());
    vi.unstubAllGlobals();
  });

  function render(sdk: WebExperiencesRuntime, children: ReactNode) {
    act(() =>
      rendered.render(
        <RuntimeContext.Provider value={context(sdk)}>{children}</RuntimeContext.Provider>
      )
    );
  }

  it('retains exact States value types', () => {
    expectTypeOf(hooks.useProfileState).returns.toEqualTypeOf<States['profile']['current']>();
    expectTypeOf(hooks.useLocaleState).returns.toEqualTypeOf<States['locale']['current']>();
    expectTypeOf(hooks.useConsentState).returns.toEqualTypeOf<States['consent']['current']>();
    expectTypeOf(hooks.usePersistenceConsentState).returns.toEqualTypeOf<
      States['persistenceConsent']['current']
    >();
    expectTypeOf(hooks.usePersonalizationRequestState).returns.toEqualTypeOf<
      States['personalizationRequestState']['current']
    >();
    expectTypeOf(hooks.useEventStreamState).returns.toEqualTypeOf<
      States['eventStream']['current']
    >();
    expectTypeOf(hooks.useBlockedEventStreamState).returns.toEqualTypeOf<
      States['blockedEventStream']['current']
    >();
    expectTypeOf(hooks.usePreviewState).returns.toEqualTypeOf<States['preview']['current']>();
  });

  it('supports absent observables without a provider and detaches replaced subscriptions', () => {
    const state = observable('live');
    const captures: Array<string | undefined> = [];
    function Probe({ observable }: { observable?: Observable<string> }) {
      const value = hooks.useObservableState(observable);
      captures.push(value);
      return <output>{value ?? 'absent'}</output>;
    }
    act(() => rendered.render(<Probe />));
    expect(container.textContent).toBe('absent');
    expect(state.subscribe).not.toHaveBeenCalled();
    const absentRenders = captures.length;
    act(() => rendered.render(<Probe />));
    expect(captures).toHaveLength(absentRenders + 1);
    act(() => rendered.render(<Probe observable={state.store} />));
    expect(container.textContent).toBe('live');
    expect(state.listeners.size).toBe(1);
    act(() => rendered.render(<Probe />));
    expect(container.textContent).toBe('absent');
    expect(state.unsubscribe).toHaveBeenCalledTimes(1);
    act(() => state.emitRetired('obsolete'));
    expect(container.textContent).toBe('absent');
    act(() => rendered.render(<Probe observable={state.store} />));
    expect(container.textContent).toBe('live');
    expect(state.listeners.size).toBe(1);
  });

  const cases = [
    ['profile', hooks.useProfileState],
    ['locale', hooks.useLocaleState],
    ['consent', hooks.useConsentState],
    ['persistenceConsent', hooks.usePersistenceConsentState],
    ['personalizationRequestState', hooks.usePersonalizationRequestState],
    ['eventStream', hooks.useEventStreamState],
    ['blockedEventStream', hooks.useBlockedEventStreamState],
    ['preview', hooks.usePreviewState],
  ] as const;

  it.each(cases)('observes only %s and disposes its subscription', (key, useState) => {
    const initial = key === 'personalizationRequestState' ? { status: 'idle' } : undefined;
    const next = {
      profile: profileFixture('visitor'),
      locale: 'de-DE',
      consent: false,
      persistenceConsent: false,
      personalizationRequestState: { status: 'success' },
      eventStream: { type: 'track', event: 'purchase' },
      blockedEventStream: { reason: 'consent', method: 'track', args: [] },
      preview: { data: undefined, error: undefined, status: 'static', revision: 1 },
    }[key];
    const state = observable<unknown>(initial);
    const sdk = runtime({ [key]: state.store });
    const captures: unknown[] = [];
    function Probe() {
      captures.push(useState());
      return null;
    }
    render(sdk, <Probe />);
    expect(captures.at(-1)).toEqual(initial);
    expect(state.listeners.size).toBe(1);
    act(() => state.emit(next));
    expect(captures.at(-1)).toEqual(next);
    act(() => rendered.cleanup());
    expect(state.listeners.size).toBe(0);
    expect(state.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('caches cloned current values across renders and uses immediate/latest emissions', () => {
    const state = observable<States['profile']['current']>(profileFixture('before-commit'));
    const sdk = runtime({ profile: state.store });
    const captures: unknown[] = [];
    function Probe() {
      const profile = hooks.useProfileState();
      captures.push(profile);
      // Simulate an external change after render but before subscription commit.
      state.setBeforeSubscribe(profileFixture('at-commit'));
      return <output>{profile?.id}</output>;
    }
    render(sdk, <Probe />);
    expect(container.textContent).toBe('at-commit');
    expect(state.read).toHaveBeenCalledTimes(1);
    const committed = captures.at(-1);
    render(sdk, <Probe />);
    expect(captures.at(-1)).toBe(committed);
    expect(state.read).toHaveBeenCalledTimes(1);
    act(() => state.emit(profileFixture('updated')));
    expect(container.textContent).toBe('updated');
    expect(state.subscribe).toHaveBeenCalledTimes(1);
  });

  it('preserves false and undefined rather than using truthy fallback snapshots', () => {
    const state = observable<boolean | undefined>(undefined);
    function Probe() {
      return <output>{String(hooks.useConsentState())}</output>;
    }
    render(runtime({ consent: state.store }), <Probe />);
    for (const value of [false, true, undefined, false]) {
      act(() => state.emit(value));
      expect(container.textContent).toBe(String(value));
    }
  });

  it('rebinds on store replacement and ignores retired callbacks', () => {
    const first = observable<string | undefined>('first');
    const second = observable<string | undefined>('second');
    function Probe() {
      return <output>{hooks.useLocaleState()}</output>;
    }
    render(runtime({ locale: first.store }), <Probe />);
    render(runtime({ locale: second.store }), <Probe />);
    expect(container.textContent).toBe('second');
    expect(first.listeners.size).toBe(0);
    act(() => first.emitRetired('stale'));
    expect(container.textContent).toBe('second');
    act(() => second.emit('live'));
    expect(container.textContent).toBe('live');
  });

  it('rebinds the generic hook when its selected state changes on the same SDK', () => {
    const consent = observable<boolean | undefined>(false);
    const persistence = observable<boolean | undefined>(true);
    const sdk = runtime({ consent: consent.store, persistenceConsent: persistence.store });
    function Probe({ name }: { name: 'consent' | 'persistenceConsent' }) {
      return <output>{String(hooks.useExperiencesState(name))}</output>;
    }
    render(sdk, <Probe name="consent" />);
    expect(container.textContent).toBe('false');
    render(sdk, <Probe name="persistenceConsent" />);
    expect(container.textContent).toBe('true');
    expect(consent.listeners.size).toBe(0);
    expect(persistence.listeners.size).toBe(1);
    act(() => consent.emit(false));
    expect(container.textContent).toBe('true');
  });

  it.each(['eventStream', 'blockedEventStream'] as const)(
    'reads historical %s values without publishing callback attempts',
    (key) => {
      const historical =
        key === 'eventStream'
          ? { type: 'track', event: 'historical' }
          : { reason: 'consent', method: 'track', args: ['historical'] };
      const state = observable(historical);
      const attempts = vi.fn();
      const subscription = state.store.subscribe(attempts);
      attempts.mockClear(); // The early listener already observed the historical value.
      const sdk = runtime({ [key]: state.store });
      const captures: unknown[] = [];
      function Probe() {
        captures.push(hooks.useExperiencesState(key));
        return null;
      }
      try {
        render(sdk, <Probe />);
        render(sdk, <Probe />);
        expect(captures.at(-1)).toEqual(historical);
        expect(attempts).not.toHaveBeenCalled();
        act(() => state.emit({ ...historical }));
        expect(attempts).toHaveBeenCalledTimes(1);
        render(sdk, <Probe />);
        expect(attempts).toHaveBeenCalledTimes(1);
      } finally {
        subscription.unsubscribe();
      }
    }
  );

  it('keeps the committed cache when a concurrent replacement render suspends', async () => {
    const first = observable<string | undefined>('committed');
    const replacement = observable<string | undefined>('uncommitted');
    const pending = new Promise<void>(() => undefined);
    let attempted = false;
    function Probe({ suspend = false }: { suspend?: boolean }) {
      const locale = hooks.useLocaleState();
      if (suspend) {
        attempted = true;
        throw pending;
      }
      return <output>{locale}</output>;
    }
    render(
      runtime({ locale: first.store }),
      <Suspense fallback="pending">
        <Probe />
      </Suspense>
    );
    await act(async () => {
      startTransition(() =>
        rendered.render(
          <RuntimeContext.Provider value={context(runtime({ locale: replacement.store }))}>
            <Suspense fallback="pending">
              <Probe suspend />
            </Suspense>
          </RuntimeContext.Provider>
        )
      );
    });
    expect(attempted).toBe(true);
    expect(container.textContent).toBe('committed');
    expect(replacement.subscribe).not.toHaveBeenCalled();
    act(() => first.emit('still-current'));
    expect(container.textContent).toBe('still-current');
    expect(first.read).toHaveBeenCalledTimes(1);
    render(
      runtime({ locale: first.store }),
      <Suspense fallback="pending">
        <Probe />
      </Suspense>
    );
    expect(container.textContent).toBe('still-current');
  });

  it('cleans up Strict Mode replay and leaves no observer on unmount', () => {
    const state = observable<string | undefined>('en');
    function Probe() {
      hooks.useLocaleState();
      return null;
    }
    act(() =>
      rendered.render(
        <StrictMode>
          <RuntimeContext.Provider value={context(runtime({ locale: state.store }))}>
            <Probe />
          </RuntimeContext.Provider>
        </StrictMode>
      )
    );
    expect(state.listeners.size).toBe(1);
    expect(state.subscribe).toHaveBeenCalledTimes(2);
    act(() => rendered.cleanup());
    expect(state.listeners.size).toBe(0);
    expect(state.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('caches server snapshots and hydrates cloned objects without loops or mismatches', async () => {
    const state = observable<States['profile']['current']>(profileFixture('server'));
    const sdk = runtime({ profile: state.store });
    function Probe() {
      return <output>{hooks.useProfileState()?.id}</output>;
    }
    const tree = (
      <RuntimeContext.Provider value={context(sdk)}>
        <Probe />
      </RuntimeContext.Provider>
    );
    container.innerHTML = renderToString(tree);
    expect(state.read).toHaveBeenCalledTimes(1);
    expect(state.subscribe).not.toHaveBeenCalled();
    const onRecoverableError = vi.fn();
    await act(async () => {
      rendered.hydrate(tree, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(state.read).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('server');
    act(() => state.emit(profileFixture('browser')));
    expect(container.textContent).toBe('browser');
    expect(state.read).toHaveBeenCalledTimes(2);
  });
});
