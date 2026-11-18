import {
  ContentfulExperiences,
  createWebSnapshotRuntime,
  type Config,
} from '@contentful/experiences-web';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RuntimeHarness from '../test/fixtures/RuntimeHarness.svelte';
import { profile } from '../test/fixtures/runtime-profile.js';
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
    const locale = injected.states.locale;
    const subscribe = locale.subscribe.bind(locale);
    const lateCallbacks: Parameters<typeof locale.subscribe>[0][] = [];
    const unsubscribes: ReturnType<typeof vi.fn>[] = [];
    vi.spyOn(locale, 'subscribe').mockImplementation((next) => {
      lateCallbacks.push(next);
      const subscription = subscribe(next);
      const unsubscribe = vi.fn(() => subscription.unsubscribe());
      unsubscribes.push(unsubscribe);
      return { unsubscribe };
    });
    const context = captureContext();
    const nestedContext = captureContext();
    const view = render(RuntimeHarness, {
      config,
      sdk: injected,
      capture: context.capture,
      nestedCapture: nestedContext.capture,
    });
    expect(nestedContext.current.scope.presentation).not.toBe(context.current.scope.presentation);
    const siblingContext = captureContext();
    const sibling = render(RuntimeHarness, {
      config,
      sdk: injected,
      capture: siblingContext.capture,
    });
    const { actions, state, runtime } = context.current;
    const siblingActions = siblingContext.current.actions;
    expect(siblingContext.current.state.ready).toBe(true);
    await view.rerender({ sdk: createWebSnapshotRuntime() as ContentfulExperiences });
    expect(context.current.owner.current.sdk).toBe(injected);
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
    expect(unsubscribes.length).toBeGreaterThan(0);
    for (const unsubscribe of unsubscribes) expect(unsubscribe).toHaveBeenCalledOnce();
    for (const next of lateCallbacks) next('stale after unmount');
    await tick();
    expect(state.locale).toBeUndefined();
    expect(siblingContext.current.state.locale).toBeUndefined();
    expect(destroy).not.toHaveBeenCalled();
    injected.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('subscribes flags only while a reactive consumer reads that key', async () => {
    const injected = Object.assign(createWebSnapshotRuntime(), {
      destroy: vi.fn(),
      captureLifetime: () => () => true,
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
        snapshot: { data: { profile: profile('server-visitor') } },
      });
      context.current.actions.reset();
      context.current.runtime.destroy();
      expect(context.current.state.profile).toBeUndefined();
      expect(context.current.state.status).toBe('disposed');
      expect(context.current.state.ready).toBe(false);
      expect(appCleanup).toHaveBeenCalledOnce();
      expect(destroy).toHaveBeenCalledTimes(ownership === 'owned' ? 1 : 0);
      view.unmount();
      expect(appCleanup).toHaveBeenCalledOnce();
      expect(destroy).toHaveBeenCalledTimes(ownership === 'owned' ? 1 : 0);
    }
  );

  it('finishes reentrant setup teardown and releases ownership even when application cleanup throws', () => {
    const context = captureContext();
    const failure = new Error('application cleanup');
    const cleanup = vi.fn(() => {
      throw failure;
    });
    const view = render(RuntimeHarness, {
      config,
      capture: context.capture,
      onStatesReady() {
        context.current.runtime.destroy();
        return cleanup;
      },
    });
    expect(view.container.textContent).toContain('disposed|');
    expect(context.current.state.profile).toBeUndefined();
    expect(cleanup).toHaveBeenCalledOnce();
    // Setup's late returned cleanup still runs, and its failure cannot retain the singleton.
    sdk().destroy();
    view.unmount();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
