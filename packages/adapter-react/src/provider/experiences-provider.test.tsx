/** @vitest-environment jsdom */

import {
  act,
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
  type ContentfulExperiences,
  type CoreStates,
  type ExperiencesHandoff,
  type ExperiencesSnapshot,
  type ExperiencesWebConfig,
  type Observable,
} from '@contentful/experiences-web';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { createReactTestRoot, type ReactTestRoot } from '../test/react-root.js';
import { minimalSourceMap } from '../test/source-map.js';
import {
  useExperiences,
  useExperiencesContext,
  type ExperiencesContextValue,
} from '../context/experiences-context.js';
import { usePreviewState } from '../hooks/use-experiences-state.js';
import type { OnExperienceNodeRoot } from '../tracking/root-binding-types.js';
import { createReactExperiences } from './create-react-experiences.js';
import {
  ExperiencesProvider,
  ExperiencesRoot,
  type ExperiencesStateInitialization,
} from './experiences-provider.js';
import {
  createExperiencesRootSdkBinding,
  disposeExperiencesRootSdkBinding,
} from './experiences-root-sdk-binding.js';

const { construct } = vi.hoisted(() => ({ construct: vi.fn() }));
vi.mock('@contentful/experiences-web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@contentful/experiences-web')>();
  return {
    ...actual,
    ContentfulExperiences: vi.fn(function (config: ExperiencesWebConfig) {
      return construct(config);
    }),
  };
});

// Ported ownership/activation expectations from OptimizationProvider.onStatesReady
// at 59add9d6ebff503b9033a59a2eee0149d4b4e925. Experiences always retains a
// presentation runtime, replaces injected SDKs, and leaves page/content work to callers.
const config: ExperiencesWebConfig = {
  spaceId: 'space',
  environmentId: 'master',
  delivery: { accessToken: 'delivery' },
};
const snapshot: ExperiencesSnapshot = {
  data: { profile: { id: 'server-profile' } },
  locale: 'en-US',
  consent: false,
};
function initialization(
  id = 'server-profile',
  routeKey = '/initial'
): ExperiencesStateInitialization {
  const handoff: ExperiencesHandoff = {
    spaceId: 'space',
    environmentId: 'master',
    cache: { scope: 'private-request' },
    state: { profile: { id } },
  };
  return { handoff, routeKey };
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function liveSdk() {
  return Object.assign(
    createWebSnapshotRuntime({ locale: 'en-US', data: { profile: { id: 'browser-profile' } } }),
    {
      spaceId: config.spaceId,
      environmentId: config.environmentId,
      destroy: vi.fn(),
      hydrateHandoffState: vi.fn(() => Promise.resolve()),
      setLocale: vi.fn(),
      page: vi.fn(),
      fetchExperience: vi.fn(),
      tracking: {
        enable: vi.fn(),
        disable: vi.fn(),
        enableElement: vi.fn(),
        disableElement: vi.fn(),
        clearElement: vi.fn(),
      },
    }
  );
}
type LiveSdk = ReturnType<typeof liveSdk>;
// A boundary double, not a second Web implementation: only React-observed calls are stubbed.
const inject = (sdk: LiveSdk): ContentfulExperiences => sdk as unknown as ContentfulExperiences;

describe('React runtime ownership and activation', () => {
  let view: ReactTestRoot;
  let runtime: LiveSdk;
  let captures: ExperiencesContextValue[];
  let extraViews: ReactTestRoot[];
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    view = createReactTestRoot();
    extraViews = [];
    captures = [];
    runtime = liveSdk();
    construct.mockReset().mockReturnValue(runtime);
  });
  afterEach(() => {
    act(() => {
      view.cleanup();
      extraViews.forEach((root) => root.cleanup());
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  function Probe() {
    const context = useExperiencesContext();
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
      const initial = initialization('private-visitor');
      const handoff = { ...initial.handoff, cache: { scope, key: 'public-key' } };
      const Child = child;
      expect(() =>
        renderToString(
          <ExperiencesRoot {...config} initialization={{ ...initial, handoff }}>
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
      const initial = initialization('other-visitor');
      const handoff = {
        ...initial.handoff,
        ...(owner === 'owned'
          ? { spaceId: 'other-space' }
          : { environmentId: 'other-environment' }),
      };
      const tree =
        owner === 'owned' ? (
          <ExperiencesRoot {...config} initialization={{ ...initial, handoff }}>
            <Child />
          </ExperiencesRoot>
        ) : (
          <ExperiencesProvider sdk={inject(runtime)} initialization={{ ...initial, handoff }}>
            <Child />
          </ExperiencesProvider>
        );
      expect(() => renderToString(tree)).toThrow(
        'Experiences handoff does not match this space or environment'
      );
      expect(child).not.toHaveBeenCalled();
      expect(construct).not.toHaveBeenCalled();
      expect(runtime.hydrateHandoffState).not.toHaveBeenCalled();
    }
  );

  it('validates later handoffs against the captured managed scope rather than ignored prop changes', async () => {
    const init = initialization();
    const tree = (spaceId: string) => (
      <ExperiencesRoot {...config} spaceId={spaceId} initialization={init}>
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
    expect(runtime.hydrateHandoffState).toHaveBeenCalledTimes(1);
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
    first.hydrateHandoffState.mockReturnValue(oldHydration.promise);
    second.hydrateHandoffState.mockReturnValue(newHydration.promise);
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
        <ExperiencesRoot
          {...config}
          initialization={initialization()}
          onStatesReady={() => cleanup}
        >
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
      const props = { snapshot, initialization: initialization(), onStatesReady };
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
      expect(runtime.hydrateHandoffState).not.toHaveBeenCalled();
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

  it('surfaces a conflicting managed owner without borrowing or destroying the active SDK', () => {
    render(
      <ExperiencesRoot {...config}>
        <Probe />
      </ExperiencesRoot>
    );
    const other = createReactTestRoot();
    extraViews.push(other);
    const error = new Error('A Web SDK instance is already active');
    construct.mockImplementation(() => {
      throw error;
    });
    act(() => other.render(<ExperiencesRoot {...config}>{suppliedContent()}</ExperiencesRoot>));
    expect(current()).toMatchObject({ error, isLive: false, isContentReady: true });
    expect(current().sdk).not.toBe(runtime);
    expect(other.container.textContent).toContain('Supplied server content');
    expect(runtime.destroy).not.toHaveBeenCalled();
    act(() => other.cleanup());
    expect(runtime.destroy).not.toHaveBeenCalled();
    act(() => view.cleanup());
    expect(runtime.destroy).toHaveBeenCalledOnce();
  });

  it('settles explicit static preview without waiting for a session payload', () => {
    render(
      <ExperiencesRoot {...config} isPreview>
        {suppliedContent()}
      </ExperiencesRoot>
    );
    expect(construct).toHaveBeenCalledExactlyOnceWith({ ...config, isPreview: true });
    expect(runtime.states.preview.current).toBeUndefined();
    expect(current()).toMatchObject({
      sdk: runtime,
      isLive: true,
      isContentReady: true,
      error: undefined,
    });
    expect(view.container.textContent).toContain('Supplied server content');
    expectNoContentWork();
  });

  it('shares one host across independent injected roots with independent observer cleanup', () => {
    const other = createReactTestRoot();
    extraViews.push(other);
    const hostCleanup = vi.fn(),
      firstCleanup = vi.fn(),
      secondCleanup = vi.fn();
    const host = createExperiencesRootSdkBinding({
      config,
      createSdk: () => runtime,
      onStatesReady: () => hostCleanup,
    });
    render(
      <ExperiencesProvider sdk={inject(host.sdk)} onStatesReady={() => firstCleanup}>
        <Probe />
      </ExperiencesProvider>
    );
    act(() =>
      other.render(
        <ExperiencesProvider sdk={inject(host.sdk)} onStatesReady={() => secondCleanup}>
          <Probe />
        </ExperiencesProvider>
      )
    );
    expect(captures.every((value) => value.sdk === runtime)).toBe(true);
    act(() => view.cleanup());
    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(secondCleanup).not.toHaveBeenCalled();
    expect(runtime.destroy).not.toHaveBeenCalled();
    act(() => other.cleanup());
    expect(secondCleanup).toHaveBeenCalledOnce();
    expect(runtime.destroy).not.toHaveBeenCalled();
    disposeExperiencesRootSdkBinding(host);
    expect(hostCleanup).toHaveBeenCalledOnce();
    expect(runtime.destroy).toHaveBeenCalledOnce();
  });

  it.each(['owned', 'injected'] as const)(
    'hydrates %s HTML from the same supplied snapshot without replacing DOM',
    async (owner) => {
      const pending = deferred();
      runtime.hydrateHandoffState.mockReturnValue(pending.promise);
      const props = { snapshot, initialization: initialization() };
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
    runtime.hydrateHandoffState.mockImplementation(() => {
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
        initialization={initialization()}
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
    expect(runtime.hydrateHandoffState).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ state: { profile: { id: 'server-profile' } } }),
      { routeKey: '/initial' }
    );
    act(() => view.cleanup());
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.destroy.mock.invocationCallOrder[0]!
    );
  });

  it.each(['success', 'rejection', 'synchronous throw'] as const)(
    'makes hydration %s terminal while retaining the live SDK and supplied content',
    async (outcome) => {
      const pending = deferred(),
        error = new Error('handoff failed');
      runtime.hydrateHandoffState.mockImplementation(() => {
        if (outcome === 'synchronous throw') throw error;
        return pending.promise;
      });
      render(
        <ExperiencesRoot {...config} initialization={initialization()}>
          {suppliedContent()}
        </ExperiencesRoot>
      );
      if (outcome !== 'synchronous throw') {
        expect(current().isContentReady).toBe(false);
        await act(async () => {
          if (outcome === 'success') pending.resolve();
          else pending.reject(error);
        });
      }
      expect(current()).toEqual({
        sdk: runtime,
        isLive: true,
        isContentReady: true,
        error: outcome === 'success' ? undefined : error,
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
      runtime.hydrateHandoffState.mockReturnValue(first.promise);
      replacement.hydrateHandoffState.mockReturnValue(second.promise);
      const cleanup = vi.fn();
      const init = initialization();
      render(
        <ExperiencesProvider
          sdk={inject(runtime)}
          initialization={init}
          onStatesReady={() => cleanup}
        >
          <Probe />
        </ExperiencesProvider>
      );
      render(
        <ExperiencesProvider sdk={inject(replacement)} initialization={init}>
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

  it('ignores superseded initialization and releases the terminal barrier when initialization is removed', async () => {
    const old = deferred(),
      latest = deferred();
    runtime.hydrateHandoffState
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    const ready = vi.fn();
    const tree = (init?: ExperiencesStateInitialization) => (
      <ExperiencesProvider sdk={inject(runtime)} initialization={init} onStatesReady={ready}>
        <Probe />
      </ExperiencesProvider>
    );
    render(tree(initialization('first', '/first')));
    render(tree(initialization('latest', '/latest')));
    await act(async () => old.resolve());
    expect(current().isContentReady).toBe(false);
    render(tree());
    expect(current()).toMatchObject({ sdk: runtime, isContentReady: true, error: undefined });
    await act(async () => latest.reject(new Error('removed initialization')));
    expect(current()).toMatchObject({ sdk: runtime, isContentReady: true, error: undefined });
    expect(ready).toHaveBeenCalledOnce();
    expect(runtime.hydrateHandoffState).toHaveBeenCalledTimes(2);
  });

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
      const init = initialization();
      runtime.hydrateHandoffState.mockReturnValue(pending.promise);
      const tree = (locale: string) => (
        <ExperiencesRoot {...config} locale={locale} initialization={init}>
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
      const ui = createReactExperiences({ config: registry });
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
        return (
          <ui.ExperienceRenderer experience={plan} trackViews={false} onNodeRoot={onNodeRoot} />
        );
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

  it('forwards a lazy preview initializer only at commit and keeps preview state separate from root readiness', async () => {
    let value: CoreStates['preview']['current'];
    const listeners = new Set<(state: CoreStates['preview']['current']) => void>();
    const preview: Observable<CoreStates['preview']['current']> = {
      get current() {
        return value;
      },
      subscribe(listener) {
        listeners.add(listener);
        listener(value);
        return {
          unsubscribe: () => {
            listeners.delete(listener);
          },
        };
      },
      subscribeOnce: vi.fn(),
    };
    runtime.states.preview = preview;
    const livePreview = vi.fn<NonNullable<ExperiencesWebConfig['livePreview']>>(() => {
      throw new Error('React must forward the initializer without invoking it');
    });
    const previewValues: Array<CoreStates['preview']['current']> = [];
    function PreviewProbe() {
      previewValues.push(usePreviewState());
      return <Probe />;
    }
    const tree = (
      <ExperiencesRoot {...config} livePreview={livePreview}>
        {suppliedContent()}
        <PreviewProbe />
      </ExperiencesRoot>
    );
    renderToString(tree);
    expect(construct).not.toHaveBeenCalled();
    expect(livePreview).not.toHaveBeenCalled();
    expect(previewValues[0]).toBeUndefined();
    render(tree);
    expect(construct).toHaveBeenCalledExactlyOnceWith({ ...config, livePreview });
    // The double does not initialize preview: loading and policy remain Web responsibilities.
    expect(livePreview).not.toHaveBeenCalled();
    const states: Array<CoreStates['preview']['current']> = [
      undefined,
      {
        experienceId: 'hero',
        sessionId: 'session',
        data: undefined,
        error: new Error('preview initialization failed'),
        status: undefined,
        revision: 0,
      },
      {
        experienceId: 'hero',
        sessionId: 'session',
        status: 'static',
        data: undefined,
        error: undefined,
        revision: 0,
      },
      {
        experienceId: 'replacement',
        sessionId: 'replacement-session',
        data: undefined,
        error: undefined,
        status: 'live',
        revision: 1,
      },
      undefined,
    ];
    for (const state of states) {
      act(() => {
        value = state;
        listeners.forEach((listener) => listener(state));
      });
      expect(previewValues.at(-1)).toBe(state);
      expect(current()).toMatchObject({
        sdk: runtime,
        isLive: true,
        isContentReady: true,
        error: undefined,
      });
      expect(view.container.textContent).toContain('Supplied server content');
      expectNoContentWork();
    }
    act(() => view.cleanup());
    expect(listeners.size).toBe(0);
    expect(runtime.destroy).toHaveBeenCalledOnce();
  });
});
