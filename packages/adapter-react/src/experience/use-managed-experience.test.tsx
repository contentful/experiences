/** @vitest-environment jsdom */

import { act, StrictMode, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContentfulExperiences,
  createWebSnapshotRuntime,
  type PortableRenderPlan,
} from '@contentful/experiences-web';
import type { RuntimeLivePreviewModule } from '@contentful/experiences-runtime';
import { ExperiencesContext } from '../runtime/experiences-context.js';
import {
  ExperienceRequestContext,
  type ExperienceRequestContextValue,
} from '../runtime/experience-request-context.js';
import { createReactTestRoot, type ReactTestRoot } from '../test/react-root.js';
import {
  useManagedExperience,
  type ManagedExperienceOptions,
  type ManagedExperienceResult,
} from './use-managed-experience.js';
import { deferred, plan, previewState, sourceSdk } from '../test/managed-experience.js';

const config = { components: {} };
let result: ManagedExperienceResult;
function Probe({ options }: { options: ManagedExperienceOptions }) {
  result = useManagedExperience(options);
  return (
    <output>
      {result.status}:{String(result.data?.nodes[0]?.props.content.title ?? '')}
    </output>
  );
}

describe('useManagedExperience', () => {
  let root: ReactTestRoot;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createReactTestRoot();
  });
  afterEach(() => {
    act(() => root.cleanup());
    vi.unstubAllGlobals();
  });

  const content = (
    source: ReturnType<typeof sourceSdk>,
    options: ManagedExperienceOptions,
    context?: ExperienceRequestContextValue
  ): ReactNode => (
    <ExperiencesContext.Provider
      value={{ sdk: source.sdk, error: undefined, isLive: true, isContentReady: false }}
    >
      <ExperienceRequestContext.Provider value={context}>
        <Probe options={options} />
      </ExperienceRequestContext.Provider>
    </ExperiencesContext.Provider>
  );

  it('starts fetch only after the parent layout guard is installed, without a content-readiness gate', async () => {
    const source = sourceSdk();
    let ready = false;
    const fetchExperience = vi.fn(async () => {
      expect(ready).toBe(true);
      return plan();
    });
    function Parent() {
      useLayoutEffect(() => {
        ready = true;
      }, []);
      return content(
        source,
        { experienceId: 'home', config },
        { revision: {}, fetchExperience, reset() {} }
      );
    }
    await act(async () => root.render(<Parent />));
    expect(fetchExperience).toHaveBeenCalledTimes(1);
    expect(root.container.textContent).toBe('success:content');
  });

  it('never fetches or binds preview during SSR or a suspended abandoned render', async () => {
    const source = sourceSdk();
    const node = content(source, { experienceId: 'home', config });
    expect(renderToStaticMarkup(node)).toContain('idle:');
    function Suspend(): never {
      throw new Promise(() => {});
    }
    await act(async () =>
      root.render(
        <Suspense fallback="pending">
          {node}
          <Suspend />
        </Suspense>
      )
    );
    expect(root.container.textContent).toBe('pending');
    expect(source.fetchExperience).not.toHaveBeenCalled();
    expect(source.subscribeToPreview).not.toHaveBeenCalled();
  });

  it('preserves a seed when activation changes SDK, inherited locale, attribution defaults and root revision', async () => {
    const source = sourceSdk();
    const snapshot = createWebSnapshotRuntime();
    const initialPlan = plan('server');
    const options = { experienceId: 'home', config, initialPlan };
    const fetchExperience = vi.fn().mockResolvedValue(plan('unwanted startup refetch'));
    await act(async () =>
      root.render(
        <ExperiencesContext.Provider
          value={{ sdk: snapshot, error: undefined, isLive: false, isContentReady: false }}
        >
          <ExperienceRequestContext.Provider value={{ revision: {}, fetchExperience, reset() {} }}>
            <Probe options={options} />
          </ExperienceRequestContext.Provider>
        </ExperiencesContext.Provider>
      )
    );
    await act(async () => result.refresh());
    expect(root.container.textContent).toBe('success:server');
    expect(fetchExperience).not.toHaveBeenCalled();
    await act(async () =>
      root.render(content(source, options, { revision: {}, fetchExperience, reset() {} }))
    );
    expect(root.container.textContent).toBe('success:server');
    expect(fetchExperience).not.toHaveBeenCalled();
  });

  it('requests ordinary source maps even with automatic tracking disabled and in static preview', async () => {
    const source = sourceSdk();
    await act(async () => root.render(content(source, { experienceId: 'home', config })));
    expect(source.fetchExperience.mock.calls[0]?.[0].extensions).toEqual({ sourceMap: {} });
    const previewSource = sourceSdk();
    Object.defineProperty(previewSource.sdk, 'isPreview', { value: true });
    await act(async () => root.render(content(previewSource, { experienceId: 'home', config })));
    expect(previewSource.fetchExperience.mock.calls.at(-1)?.[0].extensions).toEqual({
      sourceMap: {},
    });
  });

  it.each(['home', 'other'])(
    'waits for configured preview initialization, enriching only an unrelated ID (%s)',
    async (experienceId) => {
      const source = sourceSdk();
      Object.defineProperty(source.sdk, 'config', {
        value: {
          livePreview: { experienceId: 'home', sessionId: 'session', loadImplementation: vi.fn() },
        },
      });
      const fetchExperience = vi.fn().mockResolvedValue(plan());
      const context = { revision: {}, fetchExperience, reset() {} };
      await act(async () =>
        root.render(content(source, { experienceId: 'home', config }, context))
      );
      expect(fetchExperience).not.toHaveBeenCalled();
      expect(source.subscribeToPreview).not.toHaveBeenCalled();
      expect(result.status).toBe('loading');
      await act(async () => source.preview.emit(previewState({ experienceId })));
      expect(fetchExperience.mock.calls[0]?.[1].extensions).toEqual(
        experienceId === 'home' ? undefined : { sourceMap: {} }
      );
      expect(fetchExperience.mock.calls[0]?.[1].locale).toBe(
        experienceId === 'home' ? undefined : 'en-US'
      );
      expect(fetchExperience).toHaveBeenCalledTimes(1);
      await act(async () => source.preview.emit(previewState({ experienceId, status: 'static' })));
      expect(fetchExperience).toHaveBeenCalledTimes(1);
    }
  );

  it('cancels pending initializer observation on unmount and reports initialization errors', async () => {
    const source = sourceSdk();
    Object.defineProperty(source.sdk, 'config', {
      value: {
        livePreview: { experienceId: 'home', sessionId: 'session', loadImplementation: vi.fn() },
      },
    });
    await act(async () => root.render(content(source, { experienceId: 'home', config })));
    expect(source.fetchExperience).not.toHaveBeenCalled();
    await act(async () => root.cleanup());
    expect(source.preview.listeners.size).toBe(0);
    source.preview.emit(previewState());
    expect(source.fetchExperience).not.toHaveBeenCalled();

    root = createReactTestRoot();
    const error = new Error('initializer failed');
    source.preview.emit(previewState({ experienceId: undefined, error }));
    source.fetchExperience.mockRejectedValue(error);
    await act(async () => root.render(content(source, { experienceId: 'home', config })));
    expect(source.fetchExperience.mock.calls[0]?.[0].extensions).toBeUndefined();
    expect(result.error).toBe(error);
    expect(result.status).toBe('error');
  });

  it('keeps seeded preview setup errors without duplicate startup fetching and recovers through the binding', async () => {
    const source = sourceSdk();
    Object.defineProperty(source.sdk, 'config', {
      value: {
        livePreview: { experienceId: 'home', sessionId: 'session', loadImplementation: vi.fn() },
      },
    });
    const initialPlan = plan('seed');
    const options = { experienceId: 'home', config, initialPlan };
    await act(async () => root.render(content(source, options)));
    const error = new Error('initializer failed');
    await act(async () =>
      source.preview.emit(previewState({ experienceId: undefined, error, status: 'static' }))
    );
    expect(result.data).toBe(initialPlan);
    expect(result.error).toBe(error);
    expect(source.fetchExperience).not.toHaveBeenCalled();
    await act(async () =>
      source.preview.emit(previewState({ data: { sys: { type: 'Experience' }, nodes: [] } }))
    );
    await act(async () => source.bindings.at(-1)!.listener({ data: plan('recovered') }));
    expect(result.status).toBe('success');
    expect(result.error).toBeUndefined();
  });

  it('automatically fetches a replacement matching session when preview is static', async () => {
    const snapshot = deferred<PortableRenderPlan>();
    const implementation: RuntimeLivePreviewModule = {
      fetchPreviewSession: vi.fn(() => snapshot.promise),
      createLivePreviewClient() {
        throw new Error('socket unavailable');
      },
      sendPreviewStatus() {},
    };
    const sdk = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'master',
      delivery: { accessToken: 'delivery' },
      preview: { accessToken: 'preview' },
      livePreview: {
        experienceId: 'home',
        sessionId: 'session-a',
        loadImplementation: () => implementation,
      },
    });
    try {
      await act(async () =>
        root.render(
          <ExperiencesContext.Provider
            value={{ sdk, error: undefined, isLive: true, isContentReady: true }}
          >
            <Probe options={{ experienceId: 'home', config, initialPlan: plan('retained') }} />
          </ExperiencesContext.Provider>
        )
      );
      expect(implementation.fetchPreviewSession).not.toHaveBeenCalled();
      await act(async () =>
        sdk.replaceLivePreview({
          experienceId: 'home',
          sessionId: 'session-b',
          loadImplementation: () => implementation,
        })
      );
      expect(sdk.states.preview.current?.status).toBe('static');
      expect(result.data?.nodes[0]?.props.content.title).toBe('retained');
      expect(implementation.fetchPreviewSession).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ sessionId: 'session-b' }),
        expect.anything(),
        expect.anything()
      );
      await act(async () => snapshot.resolve(plan('replacement')));
      expect(result.data?.nodes[0]?.props.content.title).toBe('replacement');
    } finally {
      act(() => root.cleanup());
      sdk.destroy();
    }
  });

  it('does not invalidate an explicit refresh for connection/status-only notifications', async () => {
    const source = sourceSdk();
    Object.defineProperty(source.sdk, 'config', {
      value: {
        livePreview: { experienceId: 'home', sessionId: 'session', loadImplementation: vi.fn() },
      },
    });
    source.preview.emit(previewState());
    await act(async () =>
      root.render(content(source, { experienceId: 'home', config, initialPlan: plan('seed') }))
    );
    const pending = deferred<PortableRenderPlan>();
    source.fetchExperience.mockReturnValueOnce(pending.promise);
    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.refresh();
    });
    await act(async () => source.preview.emit(previewState({ status: 'static' })));
    await act(async () => {
      pending.resolve(plan('refreshed'));
      await refreshing;
    });
    expect(result.data?.nodes[0]?.props.content.title).toBe('refreshed');
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
  });

  it('joins root-owned initial work across StrictMode reconnects and ignores obsolete view completions', async () => {
    const source = sourceSdk();
    const pending = deferred<PortableRenderPlan>();
    const fetchExperience = vi.fn(() => pending.promise);
    const context = { revision: {}, fetchExperience, reset() {} };
    const onExperienceResolved = vi.fn();
    await act(async () =>
      root.render(
        <StrictMode>
          {content(source, { experienceId: 'home', config, onExperienceResolved }, context)}
        </StrictMode>
      )
    );
    expect(fetchExperience.mock.calls.length).toBeGreaterThanOrEqual(1);
    // Sharing remains the root's responsibility: both presentations receive its one promise.
    await act(async () => pending.resolve(plan('joined')));
    expect(root.container.textContent).toBe('success:joined');
    expect(onExperienceResolved).toHaveBeenCalledTimes(1);
    await act(async () => root.cleanup());
    expect(source.preview.listeners.size).toBe(0);
    expect(source.consent.listeners.size).toBe(0);
  });

  it('updates effective request/resolve values and inherited locale, preserving unchanged results', async () => {
    const source = sourceSdk();
    const initial = {
      experienceId: 'home',
      config,
      parameters: { segment: 'one' },
      resolveOptions: { metadata: { theme: 'light' } },
    };
    await act(async () => root.render(content(source, initial)));
    await act(async () =>
      root.render(content(source, { ...initial, parameters: { segment: 'one' } }))
    );
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    expect(source.subscribeToPreview).toHaveBeenCalledTimes(1);
    await act(async () =>
      root.render(content(source, { ...initial, resolveOptions: { debug: true } }))
    );
    expect(source.fetchExperience).toHaveBeenCalledTimes(2);
    await act(async () => source.locale.emit('de-DE'));
    expect(source.fetchExperience.mock.calls.at(-1)?.[0].locale).toBe('de-DE');
    expect(source.fetchExperience).toHaveBeenCalledTimes(3);
  });

  it('refetches for a route/reset revision while guarding previous results', async () => {
    const source = sourceSdk();
    const pending = deferred<PortableRenderPlan>();
    const fetchExperience = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(plan('new route'));
    const onExperienceResolved = vi.fn();
    const initial = { experienceId: 'home', config, onExperienceResolved };
    const context = { revision: {}, fetchExperience, reset() {} };
    await act(async () => root.render(content(source, initial, context)));
    await act(async () => root.render(content(source, initial, { ...context, revision: {} })));
    await act(async () => pending.resolve(plan('old route')));
    expect(result.data?.nodes[0]?.props.content.title).toBe('new route');
    expect(fetchExperience).toHaveBeenCalledTimes(2);
    expect(onExperienceResolved).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: result.data })
    );
  });
});
