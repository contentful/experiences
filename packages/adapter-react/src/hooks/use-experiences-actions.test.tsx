/** @vitest-environment jsdom */

import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { WebExperiencesRuntime } from '@contentful/experiences-web';
import { ExperiencesContext } from '../context/experiences-context.js';
import { createReactTestRoot, type ReactTestRoot } from '../test/react-root.js';
import {
  useExperiencesActions,
  type UseExperiencesActionsResult,
} from './use-experiences-actions.js';

const methods = {
  setConsent: 'consent',
  flushEvents: 'flush',
  identifyUser: 'identify',
  trackPageView: 'page',
  resetUser: 'reset',
  trackEvent: 'track',
  setLocale: 'setLocale',
  trackView: 'trackView',
  trackClick: 'trackClick',
  trackHover: 'trackHover',
  trackFlagView: 'trackFlagView',
} as const;

function runtimeDouble() {
  const receivers: unknown[] = [];
  const accepted = Promise.resolve({ accepted: true });
  const sdk = Object.fromEntries(
    Object.values(methods).map((method) => [
      method,
      vi.fn(function (this: WebExperiencesRuntime) {
        receivers.push(this);
        if (method === 'setLocale') return 'normalized-locale';
        if (method === 'consent' || method === 'reset') return undefined;
        if (method === 'flush') return Promise.resolve();
        return accepted;
      }),
    ])
  ) as unknown as WebExperiencesRuntime;
  return { sdk, receivers, accepted };
}

describe('useExperiencesActions', () => {
  let rendered: ReactTestRoot;
  let captures: UseExperiencesActionsResult[];

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    rendered = createReactTestRoot();
    captures = [];
  });

  afterEach(() => {
    act(() => rendered.cleanup());
    vi.unstubAllGlobals();
  });

  function Probe() {
    captures.push(useExperiencesActions());
    return null;
  }

  function render(sdk: WebExperiencesRuntime, children: ReactNode = <Probe />, isLive = true) {
    act(() =>
      rendered.render(
        <ExperiencesContext.Provider
          value={{ sdk, error: undefined, isLive, isContentReady: isLive }}
        >
          {children}
        </ExperiencesContext.Provider>
      )
    );
    return captures.at(-1)!;
  }

  it('retains the underlying method types', () => {
    expectTypeOf<UseExperiencesActionsResult['setConsent']>().toEqualTypeOf<
      WebExperiencesRuntime['consent']
    >();
    expectTypeOf<UseExperiencesActionsResult['flushEvents']>().toEqualTypeOf<
      WebExperiencesRuntime['flush']
    >();
    expectTypeOf<UseExperiencesActionsResult['identifyUser']>().toEqualTypeOf<
      WebExperiencesRuntime['identify']
    >();
    expectTypeOf<UseExperiencesActionsResult['trackPageView']>().toEqualTypeOf<
      WebExperiencesRuntime['page']
    >();
    expectTypeOf<UseExperiencesActionsResult['resetUser']>().toEqualTypeOf<
      WebExperiencesRuntime['reset']
    >();
    expectTypeOf<UseExperiencesActionsResult['trackEvent']>().toEqualTypeOf<
      WebExperiencesRuntime['track']
    >();
    expectTypeOf<UseExperiencesActionsResult['setLocale']>().toEqualTypeOf<
      WebExperiencesRuntime['setLocale']
    >();
    expectTypeOf<UseExperiencesActionsResult['trackView']>().toEqualTypeOf<
      WebExperiencesRuntime['trackView']
    >();
    expectTypeOf<UseExperiencesActionsResult['trackClick']>().toEqualTypeOf<
      WebExperiencesRuntime['trackClick']
    >();
    expectTypeOf<UseExperiencesActionsResult['trackHover']>().toEqualTypeOf<
      WebExperiencesRuntime['trackHover']
    >();
    expectTypeOf<UseExperiencesActionsResult['trackFlagView']>().toEqualTypeOf<
      WebExperiencesRuntime['trackFlagView']
    >();
  });

  it('memoizes actions for one SDK, including context readiness changes', () => {
    const { sdk } = runtimeDouble();
    const first = render(sdk, <Probe />, false);
    expect(render(sdk)).toBe(first);
    expect(Object.keys(first)).toEqual(Object.keys(methods));
  });

  it('forwards every destructured action with its receiver, arguments and original result', async () => {
    const { sdk, receivers, accepted } = runtimeDouble();
    const actions = render(sdk);
    const {
      setConsent,
      flushEvents,
      identifyUser,
      trackPageView,
      resetUser,
      trackEvent,
      setLocale,
      trackView,
      trackClick,
      trackHover,
      trackFlagView,
    } = actions;
    const consent = { events: false, persistence: true };
    const identify = { userId: 'user-1' };
    const page = { properties: { title: 'Home' } };
    const track = { event: 'purchase', properties: { revenue: 99 } };
    expect(setConsent(consent)).toBeUndefined();
    await flushEvents();
    expect(identifyUser(identify)).toBe(accepted);
    expect(trackPageView(page)).toBe(accepted);
    expect(resetUser()).toBeUndefined();
    expect(trackEvent(track)).toBe(accepted);
    expect(setLocale('en-US')).toBe('normalized-locale');
    // Tracking payloads are opaque to the binding, just as they are to application callbacks.
    const view = {} as Parameters<typeof trackView>[0];
    const click = {} as Parameters<typeof trackClick>[0];
    const hover = {} as Parameters<typeof trackHover>[0];
    const flag = {} as Parameters<typeof trackFlagView>[0];
    expect(trackView(view)).toBe(accepted);
    expect(trackClick(click)).toBe(accepted);
    expect(trackHover(hover)).toBe(accepted);
    expect(trackFlagView(flag)).toBe(accepted);
    for (const [method, payload] of [
      ['consent', consent],
      ['identify', identify],
      ['page', page],
      ['track', track],
      ['setLocale', 'en-US'],
      ['trackView', view],
      ['trackClick', click],
      ['trackHover', hover],
      ['trackFlagView', flag],
    ] as const) {
      expect(sdk[method]).toHaveBeenCalledExactlyOnceWith(payload);
    }
    expect(sdk.flush).toHaveBeenCalledExactlyOnceWith();
    expect(sdk.reset).toHaveBeenCalledExactlyOnceWith();
    expect(receivers).toEqual(Array.from({ length: 11 }, () => sdk));
  });

  it('rebinds all callbacks after snapshot-to-live or injected SDK replacement', async () => {
    const first = runtimeDouble();
    const second = runtimeDouble();
    const oldActions = render(first.sdk, <Probe />, false);
    const currentActions = render(second.sdk);
    expect(currentActions).not.toBe(oldActions);
    // Arguments/results are covered above; replacement must rebind every receiver.
    for (const key of Object.keys(methods) as Array<keyof typeof methods>) {
      expect(currentActions[key]).not.toBe(oldActions[key]);
      await Reflect.apply(currentActions[key], undefined, []);
      expect(second.sdk[methods[key]]).toHaveBeenCalledExactlyOnceWith();
      expect(first.sdk[methods[key]]).not.toHaveBeenCalled();
    }
    expect(first.receivers).toEqual([]);
    expect(second.receivers).toEqual(Array.from({ length: 11 }, () => second.sdk));
  });

  it('preserves refusals, rejections and synchronous throws without adding policy', async () => {
    const { sdk } = runtimeDouble();
    const refusal = Promise.resolve({ accepted: false });
    const failure = new Error('transport failure');
    const rejection = Promise.reject(failure);
    // Attach a handler before rendering, so the intentionally rejected double cannot leak.
    void rejection.catch(() => undefined);
    vi.spyOn(sdk, 'identify').mockReturnValue(refusal);
    vi.spyOn(sdk, 'flush').mockReturnValue(rejection);
    vi.spyOn(sdk, 'setLocale').mockImplementation(() => {
      throw failure;
    });
    const actions = render(sdk);
    expect(actions.identifyUser({ userId: 'user-1' })).toBe(refusal);
    await expect(actions.identifyUser({ userId: 'user-1' })).resolves.toEqual({ accepted: false });
    expect(actions.flushEvents()).toBe(rejection);
    await expect(actions.flushEvents()).rejects.toBe(failure);
    expect(() => actions.setLocale(undefined)).toThrow(failure);
  });
});
