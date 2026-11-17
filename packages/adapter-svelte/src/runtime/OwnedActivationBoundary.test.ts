import { ContentfulExperiences, type Config } from '@contentful/experiences-web';
import { tick } from 'svelte';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RuntimeHarness from '../test/fixtures/RuntimeHarness.svelte';
import { profile } from '../test/fixtures/runtime-profile.js';
import type { RuntimeProbeCapture } from '../test/fixtures/runtime-probe.js';

const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');

describe('OwnedActivationBoundary', () => {
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
    if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
    else Reflect.deleteProperty(Element.prototype, 'animate');
  });

  it('keeps owned instance across committed ordinary routes and disposes app subscriptions before destruction', async () => {
    const context = captureContext();
    const order: string[] = [];
    const setup = vi.fn(() => () => {
      order.push('application');
    });
    const view = render(RuntimeHarness, {
      config,
      capture: context.capture,
      onStatesReady: setup,
      routeKey: '/',
    });
    const firstOwner = context.current.owner;
    const profile = context.current.runtime.states.profile;
    expect(view.container.textContent).toContain('ready|en-US');
    const originalDestroy = ContentfulExperiences.prototype.destroy;
    const sdkDestroy = vi
      .spyOn(ContentfulExperiences.prototype, 'destroy')
      .mockImplementation(function (this: ContentfulExperiences) {
        order.push('destroy');
        originalDestroy.call(this);
      });
    window.history.replaceState({}, '', '/next?preview_session_id=ignored');
    await view.rerender({
      routeKey: '/next?preview_session_id=ignored',
      config: { ...config, locale: 'de-DE' },
      onStatesReady: vi.fn(),
    });
    expect(context.current.owner).toBe(firstOwner);
    expect(context.current.runtime.states.profile).toBe(profile);
    expect(setup).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(order).toEqual(['application', 'destroy']);
    expect(sdkDestroy).toHaveBeenCalledTimes(1);
  });

  it('retains supplied content and snapshot state when owned setup fails', () => {
    const view = render(RuntimeHarness, {
      config,
      snapshot: { locale: 'fr-FR' },
      onStatesReady() {
        throw new Error('setup failed');
      },
    });
    expect(view.container.textContent).toContain('error|fr-FR');
    expect(view.container.textContent).toContain('setup failed');
    expect(view.container.textContent).toContain('supplied content');
    // Failure released the singleton.
    sdk();
  });

  it('starts a distinct activation only when a committed route observes a Preview session change', async () => {
    const context = captureContext();
    const setup = vi.fn();
    const view = render(RuntimeHarness, {
      config: { ...config, preview: { accessToken: 'preview-test' } },
      onStatesReady: setup,
      capture: context.capture,
      routeKey: '/',
    });
    const firstOwner = context.current.owner;
    const destroy = vi.spyOn(ContentfulExperiences.prototype, 'destroy');
    window.history.replaceState({}, '', '/other?preview_session_id=one');
    await view.rerender({ routeKey: '/other?preview_session_id=one' });
    expect(setup).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(firstOwner.current.status).toBe('disposed');
    expect(context.current.owner).not.toBe(firstOwner);
    window.history.replaceState({}, '', '/third?preview_session_id=one');
    await view.rerender({ routeKey: '/third?preview_session_id=one' });
    expect(setup).toHaveBeenCalledTimes(2);
    window.history.replaceState({}, '', '/fourth');
    await view.rerender({ routeKey: '/fourth' });
    expect(setup).toHaveBeenCalledTimes(3);
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it('ends activation resources before the next Preview session while outgoing DOM remains', async () => {
    const context = captureContext();
    const order: string[] = [];
    const animations: { onfinish?: () => void; cancel(): void }[] = [];
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: () => {
        const animation = { cancel: vi.fn() };
        animations.push(animation);
        return animation;
      },
    });
    const originalDestroy = ContentfulExperiences.prototype.destroy;
    vi.spyOn(ContentfulExperiences.prototype, 'destroy').mockImplementation(function (
      this: ContentfulExperiences
    ) {
      order.push('destroy');
      originalDestroy.call(this);
    });
    const view = render(RuntimeHarness, {
      config: { ...config, preview: { accessToken: 'preview-test' } },
      capture: context.capture,
      routeKey: '/',
      outro: () => ({ duration: 1000 }),
      onStatesReady: () => {
        order.push('ready');
        return () => {
          order.push('cleanup');
        };
      },
    });
    for (const session of ['one', 'two', 'three']) {
      const oldOwner = context.current.owner;
      window.history.replaceState({}, '', `/?preview_session_id=${session}`);
      await view.rerender({ routeKey: `/?preview_session_id=${session}` });
      expect(oldOwner.current.status).toBe('disposed');
      expect(context.current.state.ready).toBe(true);
      expect(context.current.owner).not.toBe(oldOwner);
    }
    expect(view.container.querySelectorAll('[data-runtime]').length).toBeGreaterThan(1);
    expect(order).toEqual([
      'ready',
      'cleanup',
      'destroy',
      'ready',
      'cleanup',
      'destroy',
      'ready',
      'cleanup',
      'destroy',
      'ready',
    ]);
    const currentOwner = context.current.owner;
    for (const animation of animations) animation.onfinish?.();
    await tick();
    expect(context.current.owner).toBe(currentOwner);
    expect(currentOwner.current.status).toBe('ready');
    expect(view.container.querySelectorAll('[data-runtime]')).toHaveLength(1);
    view.unmount();
    expect(order.slice(-2)).toEqual(['cleanup', 'destroy']);
    // A delayed outgoing component must not dispose the final owner's resources.
    expect(order.filter((event) => event === 'destroy')).toHaveLength(4);
  });

  it('uses a neutral fallback after a new Preview activation fails and retains content', async () => {
    const context = captureContext();
    const setup = vi
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementation(() => {
        throw new Error('new activation failed');
      });
    const view = render(RuntimeHarness, {
      config: { ...config, preview: { accessToken: 'preview-test' } },
      snapshot: { locale: 'fr-FR', data: { profile: profile('server-visitor') } },
      capture: context.capture,
      onStatesReady: setup,
      routeKey: '/',
    });
    const oldOwner = context.current.owner;
    window.history.replaceState({}, '', '/?preview_session_id=new');
    await view.rerender({ routeKey: '/?preview_session_id=new' });
    expect(oldOwner.current.status).toBe('disposed');
    expect(context.current.state.profile).toBeUndefined();
    expect(view.container.textContent).toContain('error|fr-FR|neutral');
    expect(view.container.textContent).toContain('supplied content');
    await view.rerender({ routeKey: '/next?preview_session_id=new' });
    expect(setup).toHaveBeenCalledTimes(2);
  });
});
