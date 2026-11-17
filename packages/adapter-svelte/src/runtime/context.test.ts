import {
  ContentfulExperiences,
  createWebSnapshotRuntime,
  type Config,
  type Observable,
} from '@contentful/experiences-web';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RuntimeHarness from '../test/fixtures/RuntimeHarness.svelte';
import type { RuntimeProbeCapture } from '../test/fixtures/runtime-probe.js';

describe('runtime context', () => {
  const config: Config = {
    spaceId: 'space',
    environmentId: 'environment',
    delivery: { accessToken: 'test' },
    locale: 'en-US',
  };
  const instances: ContentfulExperiences[] = [];
  function sdk() {
    const instance = new ContentfulExperiences(config);
    instances.push(instance);
    return instance;
  }
  function captureContext() {
    let value: Parameters<RuntimeProbeCapture>[0] | undefined;
    return {
      capture: (next: Parameters<RuntimeProbeCapture>[0]) => {
        value = next;
      },
      get current() {
        return value!;
      },
    };
  }
  afterEach(() => {
    cleanup();
    for (const instance of instances.splice(0)) instance.destroy();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('adapts live values and bound actions without requiring caller-owned SDK destruction', async () => {
    const injected = sdk();
    const destroy = vi.spyOn(injected, 'destroy');
    const context = captureContext();
    const view = render(RuntimeHarness, { config, sdk: injected, capture: context.capture });
    const siblingContext = captureContext();
    const sibling = render(RuntimeHarness, {
      config,
      sdk: injected,
      capture: siblingContext.capture,
    });
    const { actions, state, runtime } = context.current;
    const siblingActions = siblingContext.current.actions;
    expect(siblingContext.current.state.ready).toBe(true);
    expect(state.ready).toBe(true);
    expect(runtime.locale).toBe('en-US');
    actions.setLocale('de-DE');
    actions.consent({ events: true, persistence: false });
    await tick();
    expect(view.container.textContent).toContain('ready|de-DE|neutral|true');
    expect(state.locale).toBe('de-DE');
    expect(sibling.container.textContent).toContain('ready|de-DE|neutral|true');
    const flush = vi.spyOn(injected, 'flush').mockResolvedValue(undefined);
    await actions.flush();
    expect(flush).toHaveBeenCalledOnce();
    for (const method of [
      'identify',
      'page',
      'track',
      'trackView',
      'trackClick',
      'trackHover',
      'trackFlagView',
    ] as const) {
      const send = vi.spyOn(injected, method).mockResolvedValue({ accepted: false });
      await Reflect.apply(actions[method], undefined, [{}]);
      expect(send).toHaveBeenCalledOnce();
    }
    view.unmount();
    expect(destroy).not.toHaveBeenCalled();
    expect(siblingContext.current.state.ready).toBe(true);
    injected.setLocale('fr-FR');
    await tick();
    expect(sibling.container.textContent).toContain('ready|fr-FR|neutral|true');
    siblingActions.setLocale('es-ES');
    await siblingActions.flush();
    await tick();
    expect(siblingContext.current.state.locale).toBe('es-ES');
    expect(sibling.container.textContent).toContain('ready|es-ES|neutral|true');
    expect(flush).toHaveBeenCalledTimes(2);
    sibling.unmount();
    expect(destroy).not.toHaveBeenCalled();
    injected.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('forwards captured actions and state to a replacement injected SDK and unsubscribes old streams', async () => {
    // Lightweight SDK-shaped injected objects let us model late observable callbacks
    // that violate unsubscribe, independently from Web's own lifecycle guards.
    const callbacks: ((value: string | undefined) => void)[] = [];
    const unsubscribe = vi.fn();
    const first = Object.assign(createWebSnapshotRuntime({ locale: 'first' }), {
      destroy: vi.fn(),
    }) as unknown as ContentfulExperiences;
    first.states.locale = {
      current: 'first',
      subscribe(next) {
        callbacks.push(next);
        next('first');
        return { unsubscribe };
      },
      subscribeOnce: vi.fn(),
    } as Observable<string | undefined>;
    const second = Object.assign(createWebSnapshotRuntime({ locale: 'second' }), {
      destroy: vi.fn(),
      setLocale: vi.fn(),
    }) as unknown as ContentfulExperiences;
    const context = captureContext();
    const view = render(RuntimeHarness, { config, sdk: first, capture: context.capture });
    const { actions, state } = context.current;
    await view.rerender({ sdk: second });
    expect(state.locale).toBe('second');
    actions.setLocale('fr-FR');
    expect(second.setLocale).toHaveBeenCalledWith('fr-FR');
    callbacks[0]!('stale');
    await tick();
    expect(state.locale).toBe('second');
    expect(unsubscribe).toHaveBeenCalledOnce();
    view.unmount();
    callbacks[0]!('unmounted');
    expect(state.locale).toBeUndefined();
    expect(first.destroy).not.toHaveBeenCalled();
    expect(second.destroy).not.toHaveBeenCalled();
  });

  it('subscribes flags only while a reactive consumer reads that key', async () => {
    const injected = Object.assign(createWebSnapshotRuntime(), {
      destroy: vi.fn(),
    }) as unknown as ContentfulExperiences;
    const listeners = new Map<string, Set<(value: string) => void>>();
    const values = new Map<string, string>([
      ['first', 'one'],
      ['second', 'two'],
    ]);
    injected.states.flag = vi.fn<typeof injected.states.flag>((name) => ({
      get current() {
        return values.get(name);
      },
      subscribe(next) {
        const subscribers = listeners.get(name) ?? new Set();
        listeners.set(name, subscribers);
        subscribers.add(next);
        next(values.get(name));
        return {
          unsubscribe: () => {
            subscribers.delete(next);
          },
        };
      },
      subscribeOnce: vi.fn(),
    }));
    const view = render(RuntimeHarness, { config, sdk: injected, flagName: 'first' });
    expect(view.container.textContent).toContain('|one|');
    expect(listeners.get('first')?.size).toBe(1);
    const flagReads = vi.mocked(injected.states.flag).mock.calls.length;
    await view.rerender({ routeKey: '/unrelated' });
    expect(injected.states.flag).toHaveBeenCalledTimes(flagReads);
    values.set('first', 'changed');
    for (const next of listeners.get('first')!) next('changed');
    await tick();
    expect(view.container.textContent).toContain('|changed|');
    await view.rerender({ flagName: 'second' });
    await tick();
    expect(listeners.get('first')?.size).toBe(0);
    expect(listeners.get('second')?.size).toBe(1);
    expect(view.container.textContent).toContain('|two|');
    await view.rerender({ visible: false });
    await tick();
    expect(listeners.get('second')?.size).toBe(0);
  });

  it('allows reactive consent synchronization without tracking its own invalidation', async () => {
    const injected = sdk();
    const consent = vi.spyOn(injected, 'consent');
    const view = render(RuntimeHarness, { config, sdk: injected, denyConsent: true });
    await tick();
    expect(consent).toHaveBeenCalledTimes(1);
    await view.rerender({ routeKey: '/next' });
    expect(consent).toHaveBeenCalledTimes(1);
  });

  it.each(['owned', 'injected'] as const)(
    'disposes the %s root through the runtime facade with coherent readiness',
    (ownership) => {
      const injected = ownership === 'injected' ? sdk() : undefined;
      const context = captureContext();
      const appCleanup = vi.fn();
      const destroy = vi.spyOn(ContentfulExperiences.prototype, 'destroy');
      const view = render(RuntimeHarness, {
        config,
        sdk: injected,
        capture: context.capture,
        onStatesReady: () => appCleanup,
      });
      context.current.runtime.destroy();
      expect(context.current.state.status).toBe('disposed');
      expect(context.current.state.ready).toBe(false);
      expect(appCleanup).toHaveBeenCalledOnce();
      expect(destroy).toHaveBeenCalledTimes(ownership === 'owned' ? 1 : 0);
      view.unmount();
      expect(appCleanup).toHaveBeenCalledOnce();
      expect(destroy).toHaveBeenCalledTimes(ownership === 'owned' ? 1 : 0);
    }
  );
});
