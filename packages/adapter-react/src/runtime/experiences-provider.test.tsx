/** @vitest-environment jsdom */

import {
  act,
  startTransition,
  StrictMode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebSnapshotRuntime,
  signals,
  toObservable,
  type ConsentInput,
  type ContentfulExperiences,
  type States,
  type ExperiencesHandoff,
  type ExperiencesSnapshot,
  type Config,
  type PersonalizationState,
} from '@contentful/experiences-web';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { EventBuilder } from '@contentful/experiences-runtime';
import { createDomTestRoot, type DomTestRoot } from '../test/dom-root.js';
import { profileFixture } from '../test/profile.js';
import { minimalSourceMap } from '../test/source-map.js';
import { useExperiences, useRuntimeContext, type RuntimeContextValue } from './context.js';
import { observable } from '../test/managed-experience.js';
import { usePreviewState } from './use-experiences-state.js';
import { useRequestContext, type RequestContextValue } from './request-context.js';
import type { OnExperienceNodeRoot } from '../tracking/root-binding-types.js';
import { createExperiences } from '../experience/create-experiences.js';
import {
  ExperiencesProvider,
  ExperiencesRoot,
  type ExperiencesProviderProps,
} from './experiences-provider.js';

const { construct } = vi.hoisted(() => ({ construct: vi.fn() }));
vi.mock('@contentful/experiences-web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@contentful/experiences-web')>();
  return {
    ...actual,
    ContentfulExperiences: vi.fn(function (config: Config) {
      return construct(config);
    }),
  };
});

// Ported ownership/activation expectations from OptimizationProvider.onStatesReady
// at f76f1ff04df1b466c98fc6ce5db6b569f9212438. Experiences always retains a
// presentation runtime, replaces injected SDKs, and consumes caller-supplied handoffs.
const config: Config = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'delivery' },
};
const snapshot: ExperiencesSnapshot = {
  data: { profile: profileFixture('server-profile') },
  locale: 'en-US',
  consent: false,
};
function handoff(id = 'server-profile'): ExperiencesHandoff {
  return {
    spaceId: 'space',
    environmentId: 'master',
    cache: { scope: 'private-request' },
    state: { profile: profileFixture(id) },
  };
}
function deferred() {
  let resolve!: (result?: { accepted: boolean }) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<{ accepted: boolean }>((yes, no) => {
    resolve = (result = { accepted: true }) => yes(result);
    reject = no;
  });
  return { promise, resolve, reject };
}
function liveSdk() {
  const sdk = createWebSnapshotRuntime({
    locale: 'en-US',
    data: { profile: profileFixture('browser-profile') },
  });
  return Object.assign(sdk, {
    states: { ...sdk.states, consent: toObservable(signals.consent) },
    consent: vi.fn((input: ConsentInput) => {
      signals.consent.value = typeof input === 'boolean' ? input : input.events;
    }),
    spaceId: config.spaceId,
    environmentId: config.environmentId,
    destroy: vi.fn(),
    hydrateAndTrackCurrentPage: vi.fn<ContentfulExperiences['hydrateAndTrackCurrentPage']>(() =>
      Promise.resolve({ accepted: false })
    ),
    setLocale: vi.fn(),
    page: vi.fn(),
    trackCurrentPage: vi
      .fn<ContentfulExperiences['trackCurrentPage']>()
      .mockResolvedValue({ accepted: true }),
    fetchExperience: vi
      .fn()
      .mockResolvedValue({ nodes: [], metadata: {}, debug: false, diagnostics: [] }),
    tracking: {
      enable: vi.fn(),
      disable: vi.fn(),
      enableElement: vi.fn(),
      disableElement: vi.fn(),
      clearElement: vi.fn(),
    },
  });
}
type LiveSdk = ReturnType<typeof liveSdk>;
// A boundary double, not a second Web implementation: only React-observed calls are stubbed.
const inject = (sdk: LiveSdk): ContentfulExperiences => sdk as unknown as ContentfulExperiences;

describe('React runtime ownership and activation', () => {
  let view: DomTestRoot;
  let runtime: LiveSdk;
  let captures: RuntimeContextValue[];
  let browser: ContentfulExperiences | undefined;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.history.replaceState(null, '', '/initial');
    view = createDomTestRoot();
    captures = [];
    signals.consent.value = undefined;
    runtime = liveSdk();
    construct.mockReset().mockReturnValue(runtime);
  });
  afterEach(() => {
    act(() => {
      view.cleanup();
    });
    browser?.destroy();
    browser = undefined;
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  function Probe() {
    const context = useRuntimeContext();
    captures.push(context);
    return <output>{context.sdk.states.profile.current?.id}</output>;
  }
  const current = () => captures.at(-1)!;
  const render = (children: ReactNode) => act(() => view.render(children));
  function suppliedContent() {
    return (
      <>
        <article>Supplied server content</article>
        <Probe />
      </>
    );
  }
  const expectNoContentWork = (sdk = runtime) => {
    expect(sdk.page).not.toHaveBeenCalled();
    expect(sdk.fetchExperience).not.toHaveBeenCalled();
  };

  it.each(['static', 'public-permutation'] as const)(
    'rejects unsafe %s handoffs before SSR children can read private profile state',
    (scope) => {
      const child = vi.fn(() => <Probe />);
      const initial = handoff('private-visitor');
      const unsafeHandoff = { ...initial, cache: { scope, key: 'public-key' } };
      const Child = child;
      expect(() =>
        renderToString(
          <ExperiencesRoot {...config} handoff={unsafeHandoff}>
            <Child />
          </ExperiencesRoot>
        )
      ).toThrow(TypeError);
      expect(child).not.toHaveBeenCalled();
      expect(construct).not.toHaveBeenCalled();
    }
  );

  it.each(['owned', 'injected'] as const)(
    'rejects a mismatching handoff scope before %s SSR children render',
    (owner) => {
      const child = vi.fn(() => <Probe />);
      const Child = child;
      const initial = handoff('other-visitor');
      const mismatchedHandoff = {
        ...initial,
        ...(owner === 'owned'
          ? { spaceId: 'other-space' }
          : { environmentId: 'other-environment' }),
      };
      const tree =
        owner === 'owned' ? (
          <ExperiencesRoot {...config} handoff={mismatchedHandoff}>
            <Child />
          </ExperiencesRoot>
        ) : (
          <ExperiencesProvider sdk={inject(runtime)} handoff={mismatchedHandoff}>
            <Child />
          </ExperiencesProvider>
        );
      expect(() => renderToString(tree)).toThrow(
        'Experiences handoff does not match this space or environment'
      );
      expect(child).not.toHaveBeenCalled();
      expect(construct).not.toHaveBeenCalled();
      expect(runtime.hydrateAndTrackCurrentPage).not.toHaveBeenCalled();
    }
  );

  it('validates later handoffs against the captured managed scope rather than ignored prop changes', async () => {
    const suppliedHandoff = handoff();
    const tree = (spaceId: string) => (
      <ExperiencesRoot {...config} spaceId={spaceId} handoff={suppliedHandoff}>
        <Probe />
      </ExperiencesRoot>
    );
    await act(async () => view.render(tree(config.spaceId)));
    await act(async () => view.render(tree('ignored-space')));
    expect(construct).toHaveBeenCalledTimes(1);
    expect(current()).toMatchObject({
      sdk: runtime,
      isLive: true,
      isContentReady: true,
      error: undefined,
    });
    expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(1);
  });

  it('constructs an owned SDK only on commit', () => {
    const tree = <ExperiencesRoot {...config}>{suppliedContent()}</ExperiencesRoot>;
    expect(renderToString(tree)).toContain('Supplied server content');
    expect(construct).not.toHaveBeenCalled();
    expect(current()).toMatchObject({ isLive: false, isContentReady: false, error: undefined });
    render(tree);
    expect(construct).toHaveBeenCalledExactlyOnceWith(config);
    expect(current()).toMatchObject({ sdk: runtime, isLive: true, isContentReady: true });
    expect(view.container.textContent).toContain('Supplied server content');
    expectNoContentWork();
  });

  it.each(['owned', 'injected'] as const)(
    'uses the static payload in ordinary XDA navigation and reset (%s)',
    async (owner) => {
      let requests!: RequestContextValue;
      function RequestProbe() {
        requests = useRequestContext()!;
        return <Probe />;
      }
      const tree = (
        routeKey: string,
        initialPagePayload: ExperiencesProviderProps['initialPagePayload']
      ) => {
        const props = { routeKey, initialPagePayload, children: <RequestProbe /> };
        return owner === 'owned' ? (
          <ExperiencesRoot {...config} {...props} />
        ) : (
          <ExperiencesProvider sdk={inject(runtime)} {...props} />
        );
      };
      const first = Object.freeze({ properties: Object.freeze({ route: 'home' }) });
      const next = { properties: { route: 'next' } };
      const resolve = { config: { components: {} } };
      render(tree('/initial', first));
      await requests.fetchExperience(inject(runtime), { experienceId: 'home' }, resolve, false);
      expect(runtime.fetchExperience).toHaveBeenLastCalledWith(
        { experienceId: 'home', personalization: { events: [{ type: 'page', ...first }] } },
        resolve,
        expect.objectContaining({ isCurrent: expect.any(Function) })
      );
      const initialScope = runtime.fetchExperience.mock.lastCall![2];
      expect(initialScope.routeKey).toBe('/initial');
      expect(initialScope.isCurrent()).toBe(true);
      if (owner === 'owned') expect(construct).toHaveBeenCalledExactlyOnceWith(config);
      render(tree('/next', next));
      expect(initialScope.isCurrent()).toBe(false);
      await requests.fetchExperience(inject(runtime), { experienceId: 'next' }, resolve, false);
      expect(runtime.fetchExperience).toHaveBeenLastCalledWith(
        { experienceId: 'next', personalization: { events: [{ type: 'page', ...next }] } },
        resolve,
        expect.objectContaining({ isCurrent: expect.any(Function) })
      );
      const nextScope = runtime.fetchExperience.mock.lastCall![2];
      expect(nextScope.routeKey).toBe('/next');
      expect(nextScope.isCurrent()).toBe(true);
      act(() => requests.reset());
      expect(nextScope.isCurrent()).toBe(false);
      await requests.fetchExperience(inject(runtime), { experienceId: 'next' }, resolve, false);
      expect(runtime.fetchExperience).toHaveBeenLastCalledWith(
        { experienceId: 'next', personalization: { events: [{ type: 'page', ...next }] } },
        resolve,
        expect.objectContaining({ isCurrent: expect.any(Function) })
      );
      const resetScope = runtime.fetchExperience.mock.lastCall![2];
      expect(resetScope.isCurrent()).toBe(true);
      act(() => view.cleanup());
      expect(resetScope.isCurrent()).toBe(false);
      expect(runtime.trackCurrentPage).not.toHaveBeenCalled();
      expect(first).toEqual({ properties: { route: 'home' } });
    }
  );

  it.each([undefined, { properties: { source: 'builder' } }])(
    'gives the explicit builder precedence over static page arguments (result=%j)',
    async (payload) => {
      let requests!: RequestContextValue;
      function RequestProbe() {
        requests = useRequestContext()!;
        return null;
      }
      const buildPagePayload = vi.fn(() => payload);
      render(
        <ExperiencesProvider
          sdk={inject(runtime)}
          initialPagePayload={{ properties: { source: 'static' } }}
          buildPagePayload={buildPagePayload}
        >
          <RequestProbe />
        </ExperiencesProvider>
      );
      const resolve = { config: { components: {} } };
      await requests.fetchExperience(inject(runtime), { experienceId: 'home' }, resolve, false);
      expect(buildPagePayload).toHaveBeenCalledExactlyOnceWith({ isInitialEmission: true });
      expect(runtime.fetchExperience).toHaveBeenCalledExactlyOnceWith(
        payload === undefined
          ? { experienceId: 'home' }
          : { experienceId: 'home', personalization: { events: [{ type: 'page', ...payload }] } },
        resolve,
        expect.objectContaining({ isCurrent: expect.any(Function) })
      );
    }
  );

  it.each(['static', 'builder'] as const)(
    'retains pending and completed handoff work across inline %s payload updates',
    async (kind) => {
      const pending = deferred();
      runtime.hydrateAndTrackCurrentPage.mockReturnValue(pending.promise);
      const suppliedHandoff = handoff();
      const tree = (value: string) => (
        <ExperiencesProvider
          sdk={inject(runtime)}
          handoff={suppliedHandoff}
          {...(kind === 'static'
            ? { initialPagePayload: { properties: { value } } }
            : { buildPagePayload: () => ({ properties: { value } }) })}
        >
          <Probe />
        </ExperiencesProvider>
      );
      render(tree('initial'));
      const options = runtime.hydrateAndTrackCurrentPage.mock.calls[0]![1];
      render(tree('pending'));
      expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(1);
      expect(options.isCurrent!()).toBe(true);
      expect(options.buildPayload?.({ isInitialEmission: true })?.properties?.value).toBe(
        'pending'
      );
      await act(async () => pending.resolve());
      const settledRenderCount = captures.length;
      render(tree('completed'));
      expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(1);
      expect(captures.slice(settledRenderCount).every((state) => state.isContentReady)).toBe(true);
      expect(options.isCurrent!()).toBe(true);
      expect(options.buildPayload?.({ isInitialEmission: false })?.properties?.value).toBe(
        'completed'
      );
    }
  );

  it('restarts handoff work when payload capability is added or removed', () => {
    runtime.hydrateAndTrackCurrentPage.mockReturnValue(deferred().promise);
    const suppliedHandoff = handoff();
    const tree = (payload: Partial<ExperiencesProviderProps> = {}) => (
      <ExperiencesProvider sdk={inject(runtime)} handoff={suppliedHandoff} {...payload}>
        <Probe />
      </ExperiencesProvider>
    );
    const options = () => runtime.hydrateAndTrackCurrentPage.mock.calls.at(-1)![1];
    render(tree());
    expect(options().buildPayload).toBeUndefined();
    const absent = options();
    render(tree({ initialPagePayload: { properties: { source: 'static' } } }));
    expect(absent.isCurrent!()).toBe(false);
    const enabled = options();
    expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(2);
    expect(enabled.buildPayload).toEqual(expect.any(Function));
    render(tree({ buildPagePayload: () => ({ properties: { source: 'builder' } }) }));
    expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(2);
    expect(enabled.buildPayload?.({ isInitialEmission: true })).toEqual({
      properties: { source: 'builder' },
    });
    render(tree());
    expect(enabled.isCurrent!()).toBe(false);
    expect(options().buildPayload).toBeUndefined();
    expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(3);
  });

  it('keeps retained payload readers on committed props during an abandoned update', async () => {
    runtime.hydrateAndTrackCurrentPage.mockReturnValue(deferred().promise);
    const suppliedHandoff = handoff();
    const suspended = vi.fn();
    const pending = new Promise<void>(() => {});
    function Suspend(): never {
      suspended();
      throw pending;
    }
    const tree = (value: string, suspend = false) => (
      <Suspense fallback="waiting">
        <ExperiencesProvider
          sdk={inject(runtime)}
          handoff={suppliedHandoff}
          buildPagePayload={() => ({ properties: { value } })}
        >
          {suspend ? <Suspend /> : <Probe />}
        </ExperiencesProvider>
      </Suspense>
    );
    render(tree('committed'));
    const options = runtime.hydrateAndTrackCurrentPage.mock.calls[0]![1];
    await act(async () => startTransition(() => view.render(tree('abandoned', true))));
    expect(suspended).toHaveBeenCalled();
    expect(options.buildPayload?.({ isInitialEmission: true })?.properties?.value).toBe(
      'committed'
    );
    render(tree('replacement'));
    expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(1);
    expect(options.buildPayload?.({ isInitialEmission: true })?.properties?.value).toBe(
      'replacement'
    );
  });

  it('uses the latest static payload after a standalone callback and on consent retry', async () => {
    const pending = deferred();
    const beforeInitialPage = { run: vi.fn(() => pending.promise) };
    const tree = (
      routeKey: string,
      initialPagePayload: ExperiencesProviderProps['initialPagePayload']
    ) => (
      <ExperiencesProvider
        sdk={inject(runtime)}
        routeKey={routeKey}
        initialPagePayload={initialPagePayload}
        beforeInitialPage={beforeInitialPage}
      >
        <Probe />
      </ExperiencesProvider>
    );
    render(tree('/initial', { properties: { route: 'home' } }));
    render(tree('/next', { properties: { route: 'intermediate' } }));
    const next = { properties: { route: 'next' } };
    render(tree('/next', next));
    runtime.trackCurrentPage.mockResolvedValueOnce({ accepted: false });
    await act(async () => pending.resolve());
    expect(beforeInitialPage.run).toHaveBeenCalledTimes(1);
    expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(1);
    expect(runtime.trackCurrentPage.mock.calls[0]![0].routeKey).toBe('/next');
    expect(
      runtime.trackCurrentPage.mock.calls[0]![0].buildPayload({ isInitialEmission: true })
    ).toBe(next);
    const retry = { properties: { route: 'retry' } };
    render(tree('/next', retry));
    await act(async () => runtime.consent({ events: true }));
    expect(runtime.trackCurrentPage).toHaveBeenCalledTimes(2);
    expect(
      runtime.trackCurrentPage.mock.calls[1]![0].buildPayload({ isInitialEmission: false })
    ).toBe(retry);
    expect(runtime.fetchExperience).not.toHaveBeenCalled();
  });

  it('does not construct or attach observers for a suspended, abandoned render', () => {
    const onStatesReady = vi.fn();
    const pending = new Promise<void>(() => {});
    function Suspend(): never {
      throw pending;
    }
    render(
      <Suspense fallback="waiting">
        <ExperiencesRoot {...config} onStatesReady={onStatesReady}>
          <Suspend />
        </ExperiencesRoot>
      </Suspense>
    );
    expect(view.container.textContent).toBe('waiting');
    render(<p>Replacement</p>);
    expect(construct).not.toHaveBeenCalled();
    expect(onStatesReady).not.toHaveBeenCalled();
  });

  it('releases the StrictMode owner immediately while hydration is still pending', async () => {
    const first = liveSdk(),
      second = liveSdk();
    const oldHydration = deferred(),
      newHydration = deferred();
    first.hydrateAndTrackCurrentPage.mockReturnValue(oldHydration.promise);
    second.hydrateAndTrackCurrentPage.mockReturnValue(newHydration.promise);
    const cleanup = vi.fn();
    construct
      .mockReset()
      .mockReturnValueOnce(first)
      .mockImplementationOnce(() => {
        expect(first.destroy).toHaveBeenCalledOnce();
        expect(cleanup).toHaveBeenCalledOnce();
        return second;
      });
    render(
      <StrictMode>
        <ExperiencesRoot {...config} handoff={handoff()} onStatesReady={() => cleanup}>
          <Probe />
        </ExperiencesRoot>
      </StrictMode>
    );
    expect(construct).toHaveBeenCalledTimes(2);
    expect(current()).toMatchObject({ sdk: second, isLive: true, isContentReady: false });
    await act(async () => oldHydration.reject(new Error('retired owner')));
    expect(current()).toMatchObject({ sdk: second, isContentReady: false, error: undefined });
    act(() => view.cleanup());
    expect(second.destroy).toHaveBeenCalledOnce();
    const renderCount = captures.length;
    await act(async () => newHydration.resolve());
    expect(captures).toHaveLength(renderCount);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it.each(['construction', 'owned observer', 'injected observer'] as const)(
    'retains snapshot and supplied HTML after %s failure',
    (failure) => {
      const error = new Error(failure);
      const onStatesReady = vi.fn(() => {
        throw error;
      });
      if (failure === 'construction')
        construct.mockImplementation(() => {
          throw error;
        });
      const props = { snapshot, handoff: handoff(), onStatesReady };
      render(
        failure === 'injected observer' ? (
          <ExperiencesProvider sdk={inject(runtime)} {...props}>
            {suppliedContent()}
          </ExperiencesProvider>
        ) : (
          <ExperiencesRoot {...config} {...props}>
            {suppliedContent()}
          </ExperiencesRoot>
        )
      );
      const initialSnapshot = captures[0]!.sdk;
      expect(current()).toEqual({
        sdk: initialSnapshot,
        error,
        isLive: false,
        isContentReady: true,
      });
      expect(view.container.textContent).toContain('Supplied server content');
      expect(view.container.textContent).toContain('server-profile');
      expect(runtime.destroy).toHaveBeenCalledTimes(failure === 'owned observer' ? 1 : 0);
      expect(runtime.hydrateAndTrackCurrentPage).not.toHaveBeenCalled();
      act(() => view.cleanup());
      expect(runtime.destroy).toHaveBeenCalledTimes(failure === 'owned observer' ? 1 : 0);
      expectNoContentWork();
    }
  );

  it('exposes client-only injection on the very first render and cleans observers without destruction', () => {
    const cleanup = vi.fn();
    const onStatesReady = vi.fn(() => cleanup);
    render(
      <ExperiencesProvider sdk={inject(runtime)} onStatesReady={onStatesReady}>
        <Probe />
      </ExperiencesProvider>
    );
    expect(captures[0]).toMatchObject({ sdk: runtime, isLive: true, isContentReady: true });
    expect(onStatesReady).toHaveBeenCalledExactlyOnceWith(runtime.states);
    act(() => view.cleanup());
    expect(cleanup).toHaveBeenCalledOnce();
    expect(runtime.destroy).not.toHaveBeenCalled();
    expect(construct).not.toHaveBeenCalled();
  });

  it.each(['owned', 'injected'] as const)(
    'hydrates %s HTML from the same supplied snapshot without replacing DOM',
    async (owner) => {
      const pending = deferred();
      runtime.hydrateAndTrackCurrentPage.mockReturnValue(pending.promise);
      const props = { snapshot, handoff: handoff() };
      const tree =
        owner === 'owned' ? (
          <ExperiencesRoot {...config} {...props}>
            {suppliedContent()}
          </ExperiencesRoot>
        ) : (
          <ExperiencesProvider sdk={inject(runtime)} {...props}>
            {suppliedContent()}
          </ExperiencesProvider>
        );
      view.container.innerHTML = renderToString(tree);
      const serverState = captures[0]!;
      const article = view.container.querySelector('article');
      captures.length = 0;
      const recover = vi.fn();
      await act(async () => view.hydrate(tree, { onRecoverableError: recover }));
      expect(captures[0]!.sdk.states.profile.current).toEqual(
        serverState.sdk.states.profile.current
      );
      expect(captures[0]).toMatchObject({ isLive: false, isContentReady: false });
      expect(recover).not.toHaveBeenCalled();
      expect(view.container.querySelector('article')).toBe(article);
      expect(current()).toMatchObject({ sdk: runtime, isLive: true, isContentReady: false });
      expectNoContentWork();
    }
  );

  it('attaches onStatesReady observers before hydration and passive child effects', () => {
    const order: string[] = [];
    const unsubscribe = vi.fn();
    runtime.states.profile.subscribe = vi.fn((listener) => {
      listener(runtime.states.profile.current);
      return { unsubscribe };
    });
    runtime.hydrateAndTrackCurrentPage.mockImplementation(() => {
      order.push('hydrate');
      return new Promise(() => {});
    });
    function Child() {
      useEffect(() => {
        order.push('child effect');
      }, []);
      return <Probe />;
    }
    render(
      <ExperiencesRoot
        {...config}
        handoff={handoff()}
        onStatesReady={(states) => {
          order.push('attach');
          const subscription = states.profile.subscribe(() => order.push('immediate emission'));
          return () => subscription.unsubscribe();
        }}
      >
        <Child />
      </ExperiencesRoot>
    );
    expect(order).toEqual(['attach', 'immediate emission', 'hydrate', 'child effect']);
    expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ state: { profile: profileFixture('server-profile') } }),
      { routeKey: '/initial', isCurrent: expect.any(Function) }
    );
    act(() => view.cleanup());
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.destroy.mock.invocationCallOrder[0]!
    );
  });

  it('forwards the complete handoff using the visible route, independently of supplied content', async () => {
    window.history.replaceState(null, '', '/initial?view=one#section');
    const builder = new EventBuilder({
      channel: 'server',
      library: { name: 'test', version: '1' },
    });
    const suppliedHandoff = {
      ...handoff(),
      profileId: 'continuation-profile',
      replay: {
        routeKey: '/initial?view=one',
        locale: 'de-DE',
        events: [builder.buildIdentify({ userId: 'visitor' }), builder.buildPageView()],
      },
    };
    await act(async () =>
      view.render(
        <ExperiencesProvider sdk={inject(runtime)} handoff={suppliedHandoff}>
          {suppliedContent()}
        </ExperiencesProvider>
      )
    );
    const [received, options] = runtime.hydrateAndTrackCurrentPage.mock.calls[0]!;
    expect(received).toBe(suppliedHandoff);
    expect(options.routeKey).toBe('/initial?view=one');
    expect(current().isContentReady).toBe(true);
    expect(view.container.textContent).toContain('Supplied server content');
    expectNoContentWork();
  });

  it.each([
    [false, undefined],
    [true, undefined],
    [false, 'original'],
  ] as const)(
    'drops the pre-reset handoff and accepts a fresh handoff (replay: %s, key: %s)',
    async (withReplay, handoffKey) => {
      let requests!: RequestContextValue;
      function Requests() {
        requests = useRequestContext()!;
        return <Probe />;
      }
      const suppliedHandoff = {
        ...handoff(),
        replay: withReplay
          ? {
              routeKey: '/initial',
              events: [
                new EventBuilder({
                  channel: 'server',
                  library: { name: 'test', version: '1' },
                }).buildPageView(),
              ],
            }
          : undefined,
      };
      const initialPagePayload = {};
      const tree = (
        value: ExperiencesHandoff = suppliedHandoff,
        key: string | undefined = handoffKey
      ) => (
        <ExperiencesProvider
          sdk={inject(runtime)}
          handoff={value}
          handoffKey={key}
          initialPagePayload={initialPagePayload}
        >
          <Requests />
        </ExperiencesProvider>
      );
      await act(async () => view.render(tree()));
      const oldIsCurrent = runtime.hydrateAndTrackCurrentPage.mock.calls[0]![1].isCurrent!;
      act(() => {
        requests.reset();
        expect(oldIsCurrent()).toBe(false);
      });
      await act(async () => view.render(tree()));
      await act(async () => view.render(tree(globalThis.structuredClone(suppliedHandoff))));
      expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(1);
      expect(current()).toMatchObject({ sdk: runtime, isLive: true, isContentReady: true });
      await requests.fetchExperience(
        inject(runtime),
        { experienceId: 'home' },
        { config: { components: {} } },
        false
      );
      expect(runtime.fetchExperience.mock.calls[0]![0].personalization.events).toEqual([
        { type: 'page' },
      ]);
      const fresh = handoff('fresh');
      if (handoffKey !== undefined) {
        await act(async () => view.render(tree(fresh)));
        expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(1);
      }
      await act(async () =>
        view.render(tree(fresh, handoffKey === undefined ? undefined : 'fresh'))
      );
      expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(2);
      expect(runtime.hydrateAndTrackCurrentPage.mock.calls[1]![0]).toBe(fresh);
      await act(async () => view.render(tree(globalThis.structuredClone(suppliedHandoff))));
      expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(2);
      await act(async () =>
        view.render(tree(globalThis.structuredClone(suppliedHandoff), 'identical'))
      );
      expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(3);
    }
  );

  it.each(['success', 'refusal', 'rejection', 'synchronous throw'] as const)(
    'makes hydration %s terminal while retaining the live SDK and supplied content',
    async (outcome) => {
      const pending = deferred(),
        error = new Error('handoff failed');
      runtime.hydrateAndTrackCurrentPage.mockImplementation(() => {
        if (outcome === 'synchronous throw') throw error;
        return pending.promise;
      });
      render(
        <ExperiencesRoot {...config} handoff={handoff()}>
          {suppliedContent()}
        </ExperiencesRoot>
      );
      if (outcome !== 'synchronous throw') {
        expect(current().isContentReady).toBe(false);
        await act(async () => {
          if (outcome === 'success' || outcome === 'refusal')
            pending.resolve({ accepted: outcome === 'success' });
          else pending.reject(error);
        });
      }
      expect(current()).toEqual({
        sdk: runtime,
        isLive: true,
        isContentReady: true,
        error: outcome === 'success' || outcome === 'refusal' ? undefined : error,
      });
      expect(view.container.textContent).toContain('Supplied server content');
      expect(runtime.destroy).not.toHaveBeenCalled();
      expectNoContentWork();
    }
  );

  it.each(['resolve', 'reject'] as const)(
    'ignores old hydration %s after injected owner replacement',
    async (outcome) => {
      const first = deferred(),
        second = deferred(),
        replacement = liveSdk();
      runtime.hydrateAndTrackCurrentPage.mockReturnValue(first.promise);
      replacement.hydrateAndTrackCurrentPage.mockReturnValue(second.promise);
      const cleanup = vi.fn();
      const suppliedHandoff = handoff();
      render(
        <ExperiencesProvider
          sdk={inject(runtime)}
          handoff={suppliedHandoff}
          onStatesReady={() => cleanup}
        >
          <Probe />
        </ExperiencesProvider>
      );
      render(
        <ExperiencesProvider sdk={inject(replacement)} handoff={suppliedHandoff}>
          <Probe />
        </ExperiencesProvider>
      );
      expect(cleanup).toHaveBeenCalledOnce();
      await act(async () => {
        if (outcome === 'resolve') first.resolve();
        else first.reject(new Error('old failure'));
      });
      expect(current()).toMatchObject({
        sdk: replacement,
        isLive: true,
        isContentReady: false,
        error: undefined,
      });
      await act(async () => second.resolve());
      expect(current()).toMatchObject({ sdk: replacement, isContentReady: true, error: undefined });
      act(() => view.cleanup());
      expect(runtime.destroy).not.toHaveBeenCalled();
      expect(replacement.destroy).not.toHaveBeenCalled();
    }
  );

  it('ignores superseded handoffs and releases the terminal barrier when the handoff is removed', async () => {
    const old = deferred(),
      latest = deferred();
    runtime.hydrateAndTrackCurrentPage
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    const ready = vi.fn();
    const tree = (suppliedHandoff?: ExperiencesHandoff) => (
      <ExperiencesProvider sdk={inject(runtime)} handoff={suppliedHandoff} onStatesReady={ready}>
        <Probe />
      </ExperiencesProvider>
    );
    window.history.replaceState(null, '', '/first');
    render(tree(handoff('first')));
    const firstIsCurrent = runtime.hydrateAndTrackCurrentPage.mock.calls[0]![1].isCurrent!;
    expect(firstIsCurrent()).toBe(true);
    window.history.replaceState(null, '', '/latest');
    render(tree(handoff('latest')));
    const latestIsCurrent = runtime.hydrateAndTrackCurrentPage.mock.calls[1]![1].isCurrent!;
    expect(firstIsCurrent()).toBe(false);
    expect(latestIsCurrent()).toBe(true);
    await act(async () => old.resolve());
    expect(current().isContentReady).toBe(false);
    render(tree());
    expect(latestIsCurrent()).toBe(false);
    expect(current()).toMatchObject({ sdk: runtime, isContentReady: true, error: undefined });
    await act(async () => latest.reject(new Error('removed handoff')));
    expect(current()).toMatchObject({ sdk: runtime, isContentReady: true, error: undefined });
    expect(ready).toHaveBeenCalledOnce();
    expect(runtime.hydrateAndTrackCurrentPage).toHaveBeenCalledTimes(2);
  });

  it.each(['static', 'builder'] as const)(
    'uses %s arguments for the fresh page after consent grants a denied page-bearing handoff',
    async (kind) => {
      const { ContentfulExperiences: ActualSdk } = await vi.importActual<
        typeof import('@contentful/experiences-web')
      >('@contentful/experiences-web');
      browser = new ActualSdk({
        ...config,
        allowedEventTypes: [],
        defaults: {
          profile: profileFixture('browser-profile'),
          consent: false,
          persistenceConsent: false,
        },
      });
      const sdk = browser;
      const send = vi.spyOn(sdk.api.personalization, 'upsertProfile').mockResolvedValue({
        profile: profileFixture('browser-profile'),
      } as never);
      const consume = vi.spyOn(sdk, 'hydrateAndTrackCurrentPage');
      const builder = new EventBuilder({
        channel: 'server',
        library: { name: 'react-test', version: '1' },
        getConsent: () => true,
      });
      const events = [builder.buildTrack({ event: 'prepared' }), builder.buildPageView()];
      const suppliedHandoff: ExperiencesHandoff = {
        ...handoff(),
        replay: { routeKey: '/initial', events },
      };
      const initialPagePayload = { properties: { source: 'static' } };
      const buildPagePayload =
        kind === 'builder' ? () => ({ properties: { source: 'builder' } }) : undefined;
      await act(async () =>
        view.render(
          <ExperiencesProvider
            sdk={sdk}
            handoff={suppliedHandoff}
            initialPagePayload={initialPagePayload}
            buildPagePayload={buildPagePayload}
          >
            {suppliedContent()}
          </ExperiencesProvider>
        )
      );
      expect(await consume.mock.results[0]!.value).toMatchObject({ accepted: false });
      expect(current()).toMatchObject({ sdk, isLive: true, isContentReady: true });
      expect(send).not.toHaveBeenCalled();
      expect(sdk.states.eventStream.current).toBeUndefined();
      const settledRenderCount = captures.length;
      await act(async () => {
        sdk.consent({ events: true });
        await consume.mock.results[1]!.value;
        await sdk.flush();
      });
      expect(consume).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenCalledOnce();
      const sent = send.mock.calls[0]![0].events;
      expect(sent.map((event) => event.type)).toEqual(['page']);
      expect(sent[0]).toMatchObject({ properties: { source: kind } });
      expect(events.map((event) => event.messageId)).not.toContain(sent[0]!.messageId);
      expect(sent[0]!.context.gdpr?.isConsentGiven).toBe(true);
      expect(captures.slice(settledRenderCount).every((state) => state.isContentReady)).toBe(true);
      expect(current()).toMatchObject({
        sdk,
        isLive: true,
        isContentReady: true,
        error: undefined,
      });
      expect(view.container.textContent).toContain('Supplied server content');
    }
  );

  it.each(['remove handoff', 'unmount'] as const)(
    'prevents late state and replay admission on %s while the injected SDK stays alive',
    async (action) => {
      const { ContentfulExperiences: ActualSdk } = await vi.importActual<
        typeof import('@contentful/experiences-web')
      >('@contentful/experiences-web');
      browser = new ActualSdk({
        ...config,
        defaults: {
          profile: profileFixture('browser-profile'),
          consent: true,
          persistenceConsent: false,
        },
      });
      const sdk = browser;
      const send = vi.spyOn(sdk.api.personalization, 'upsertProfile').mockResolvedValue({
        profile: profileFixture('browser-profile'),
      } as never);
      const destroy = vi.spyOn(sdk, 'destroy');
      const consume = vi.spyOn(sdk, 'hydrateAndTrackCurrentPage');
      const started = deferred();
      const release = deferred();
      const stateInterceptor = vi.fn(async (state: PersonalizationState) => {
        started.resolve();
        await release.promise;
        return state;
      });
      sdk.interceptors.state.add(stateInterceptor);
      const events = [sdk.eventBuilder.buildPageView()];
      const suppliedHandoff: ExperiencesHandoff = {
        ...handoff(),
        replay: { routeKey: '/initial', events },
      };
      const publishedState = vi.fn();
      const publishedEvent = vi.fn();
      const onStatesReady = vi.fn((states: States) => {
        const state = states.profile.subscribe(publishedState);
        const event = states.eventStream.subscribe(publishedEvent);
        return () => {
          state.unsubscribe();
          event.unsubscribe();
        };
      });
      const tree = (handoff?: ExperiencesHandoff) => (
        <ExperiencesProvider sdk={sdk} handoff={handoff} onStatesReady={onStatesReady}>
          <Probe />
        </ExperiencesProvider>
      );
      await act(async () => {
        view.render(tree(suppliedHandoff));
      });
      await started.promise;
      expect(stateInterceptor).toHaveBeenCalledOnce();
      expect(current().isContentReady).toBe(false);
      const isCurrent = consume.mock.calls[0]![1].isCurrent!;
      act(() => {
        if (action === 'remove handoff') view.render(tree());
        else view.cleanup();
      });
      expect(isCurrent()).toBe(false);
      const renderCount = captures.length;
      await act(async () => {
        release.resolve();
        expect(await consume.mock.results[0]!.value).toMatchObject({ accepted: false });
      });
      expect(destroy).not.toHaveBeenCalled();
      expect(captures).toHaveLength(renderCount);
      expect(sdk.states.profile.current).toEqual(profileFixture('browser-profile'));
      expect(sdk.states.personalizationRequestState.current).toEqual({ status: 'idle' });
      expect(sdk.states.eventStream.current).toBeUndefined();
      expect(publishedState).toHaveBeenCalledExactlyOnceWith(profileFixture('browser-profile'));
      expect(publishedEvent).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(send).not.toHaveBeenCalled();
      act(() => sdk.consent({ events: false }));
      expect(sdk.states.consent.current).toBe(false);
      expect(consume).toHaveBeenCalledOnce();
      if (action === 'remove handoff')
        expect(current()).toMatchObject({ sdk, isLive: true, isContentReady: true });
    }
  );

  it('captures structural configuration until keyed replacement and updates locale without reconstruction', () => {
    const ready = vi.fn();
    const tree = (key: string, locale: string, spaceId = 'space') => (
      <ExperiencesRoot
        key={key}
        {...config}
        spaceId={spaceId}
        locale={locale}
        onStatesReady={ready}
      >
        <Probe />
      </ExperiencesRoot>
    );
    render(tree('first', 'en-US'));
    render(tree('first', 'de-DE', 'ignored-until-replacement'));
    expect(construct).toHaveBeenCalledTimes(1);
    expect(runtime.setLocale).toHaveBeenCalledWith('de-DE');
    const error = new Error('invalid locale');
    runtime.setLocale.mockImplementation(() => {
      throw error;
    });
    render(tree('first', 'invalid'));
    expect(current()).toMatchObject({ sdk: runtime, isLive: true, isContentReady: true, error });
    for (const locale of ['en-US', 'de-DE']) {
      runtime.setLocale.mockReset();
      render(tree('first', locale));
      expect(current().error).toBeUndefined();
      runtime.setLocale.mockImplementation(() => {
        throw error;
      });
      render(tree('first', 'invalid'));
      expect(current().error).toBe(error);
    }
    const next = liveSdk();
    construct.mockReturnValue(next);
    render(tree('next', 'en-US', 'replacement-space'));
    expect(runtime.destroy).toHaveBeenCalledOnce();
    expect(construct).toHaveBeenLastCalledWith(
      expect.objectContaining({ spaceId: 'replacement-space' })
    );
    expect(current()).toMatchObject({ sdk: next, error: undefined });
  });

  it.each(['success', 'rejection'] as const)(
    'keeps locale recovery independent of hydration %s',
    async (outcome) => {
      const pending = deferred();
      const error = new Error('invalid locale');
      const hydrationError = new Error('hydration failed');
      const suppliedHandoff = handoff();
      runtime.hydrateAndTrackCurrentPage.mockReturnValue(pending.promise);
      const tree = (locale: string) => (
        <ExperiencesRoot {...config} locale={locale} handoff={suppliedHandoff}>
          <Probe />
        </ExperiencesRoot>
      );
      render(tree('en-US'));
      runtime.setLocale.mockImplementation(() => {
        throw error;
      });
      render(tree('!!!'));
      expect(current()).toMatchObject({ error, isLive: true, isContentReady: false });
      await act(async () => {
        if (outcome === 'success') pending.resolve();
        else pending.reject(hydrationError);
      });
      expect(current()).toMatchObject({ sdk: runtime, error, isLive: true, isContentReady: true });
      runtime.setLocale.mockReset();
      render(tree('en-US'));
      expect(current().error).toBe(outcome === 'success' ? undefined : hydrationError);
    }
  );

  it.each([false, true])(
    'cleans context-based manual registration on injected replacement (initial snapshot=%s)',
    async (withSnapshot) => {
      const registry = {
        components: {
          probe: (props: HTMLAttributes<HTMLElement>) => <article {...props}>Manual view</article>,
        },
      };
      const { ExperienceRenderer, ExperiencesProvider } = createExperiences({
        config: registry,
      });
      const plan = await resolveExperience(
        {
          nodes: [
            {
              id: 'n',
              component: {
                sys: {
                  type: 'ResourceLink',
                  linkType: 'Contentful:Component',
                  urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/probe',
                },
              },
            },
          ],
        },
        registry,
        { sourceMap: minimalSourceMap() }
      );
      let initialElement: HTMLElement | null = null;
      function Content() {
        const sdk = useExperiences();
        // Child layout runs after DOM attachment, before ancestor SDK activation.
        useLayoutEffect(() => {
          initialElement ??= view.container.querySelector('article');
        }, []);
        const onNodeRoot = useCallback<OnExperienceNodeRoot>(
          ({ element, data }) => {
            if (!data) return;
            sdk.tracking.enableElement('views', element, { data });
            return () => sdk.tracking.clearElement('views', element);
          },
          [sdk]
        );
        return <ExperienceRenderer experience={plan} trackViews={false} onNodeRoot={onNodeRoot} />;
      }
      await act(async () =>
        view.render(
          <ExperiencesProvider sdk={inject(runtime)} snapshot={withSnapshot ? snapshot : undefined}>
            <Content />
          </ExperiencesProvider>
        )
      );
      expect(initialElement).not.toBeNull();
      expect(view.container.querySelector('article')).toBe(initialElement);
      const element = initialElement!;
      const data = plan.nodes[0]!.attribution!.roots.at(-1);
      expect(data).toBeDefined();
      expect(runtime.tracking.enableElement).toHaveBeenCalledExactlyOnceWith('views', element, {
        data,
      });
      const next = liveSdk();
      await act(async () =>
        view.render(
          <ExperiencesProvider sdk={inject(next)} snapshot={withSnapshot ? snapshot : undefined}>
            <Content />
          </ExperiencesProvider>
        )
      );
      expect(view.container.querySelector('article')).toBe(element);
      expect(runtime.tracking.clearElement).toHaveBeenCalledExactlyOnceWith('views', element);
      expect(next.tracking.enableElement).toHaveBeenCalledExactlyOnceWith('views', element, {
        data,
      });
      act(() => view.cleanup());
      expect(next.tracking.clearElement).toHaveBeenCalledExactlyOnceWith('views', element);
      expect(runtime.destroy).not.toHaveBeenCalled();
      expect(next.destroy).not.toHaveBeenCalled();
    }
  );

  it('forwards preview configuration at commit and keeps preview independent of activation', async () => {
    const source = observable<States['preview']['current']>(undefined);
    runtime.states.preview = source.state;
    const previewConfig: NonNullable<Config['preview']> = {
      accessToken: 'preview',
      createClient: vi.fn(),
    };
    let preview: States['preview']['current'];
    function Preview() {
      preview = usePreviewState();
      return <Probe />;
    }
    const tree = (
      <ExperiencesRoot {...config} preview={previewConfig}>
        <Preview />
      </ExperiencesRoot>
    );
    renderToString(tree);
    expect(construct).not.toHaveBeenCalled();
    expect(previewConfig.createClient).not.toHaveBeenCalled();
    render(tree);
    expect(construct).toHaveBeenCalledExactlyOnceWith({ ...config, preview: previewConfig });
    const state = {
      sessionId: 'session',
      data: { sys: { id: 'hero', type: 'Experience' as const }, nodes: [] },
      error: new Error('preview unavailable'),
      status: 'static' as const,
      revision: 1,
    };
    act(() => {
      source.emit(state);
    });
    expect(preview).toMatchObject({ ...state, error: { message: 'preview unavailable' } });
    expect(current()).toMatchObject({
      sdk: runtime,
      isLive: true,
      isContentReady: true,
      error: undefined,
    });
    expect(previewConfig.createClient).not.toHaveBeenCalled();
    expectNoContentWork();
  });
});
