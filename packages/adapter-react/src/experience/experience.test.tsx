/** @vitest-environment jsdom */

import { act, StrictMode, Suspense, useEffect, useState, type HTMLAttributes } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { ExperiencesContext } from '../runtime/experiences-context.js';
import { createReactTestRoot, type ReactTestRoot } from '../test/react-root.js';
import { Experience, type ManagedExperienceProps } from './experience.js';
import { deferred, plan, previewState, sourceSdk } from '../test/managed-experience.js';
import type { ManagedExperienceResult } from './use-managed-experience.js';

const config = {
  components: {
    hero: ({ title, ...props }: HTMLAttributes<HTMLElement> & { title: string }) => (
      <h1 {...props}>{title}</h1>
    ),
  },
};

describe('Experience', () => {
  let root: ReactTestRoot;
  let source: ReturnType<typeof sourceSdk>;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createReactTestRoot();
    source = sourceSdk();
  });
  afterEach(() => {
    act(() => root.cleanup());
    vi.unstubAllGlobals();
  });
  const render = async (
    props: Partial<Extract<ManagedExperienceProps, { experienceId: string }>> = {}
  ) => {
    await act(async () =>
      root.render(
        <ExperiencesContext.Provider
          value={{ sdk: source.sdk, error: undefined, isLive: true, isContentReady: true }}
        >
          <Experience experienceId="home" config={config} {...props} />
        </ExperiencesContext.Provider>
      )
    );
  };

  it('renders loading then current preview content without letting a pending fetch overwrite it', async () => {
    const pending = deferred<PortableRenderPlan>();
    source.fetchExperience.mockReturnValue(pending.promise);
    await render({ loadingFallback: <p>loading</p> });
    expect(root.container.textContent).toBe('loading');
    await act(async () => source.bindings.at(-1)!.listener({ data: plan('selected') }));
    expect(root.container.querySelector('h1')?.textContent).toBe('selected');
    await act(async () => pending.resolve(plan('older snapshot')));
    expect(root.container.querySelector('h1')?.textContent).toBe('selected');
  });

  it('keeps presentation props and notifications out of the SDK request', async () => {
    const onExperienceResolved = vi.fn();
    await render({
      as: 'section',
      rootProps: { id: 'presentation' },
      trackViews: false,
      loadingFallback: 'Loading',
      onExperienceResolved,
    });
    const request = source.fetchExperience.mock.calls[0]![0];
    for (const key of ['as', 'rootProps', 'trackViews', 'loadingFallback', 'onExperienceResolved'])
      expect(request).not.toHaveProperty(key);
    expect(root.container.querySelector('section')?.id).toBe('presentation');
    expect(onExperienceResolved).toHaveBeenCalledTimes(1);
  });

  it('binds an error-only seed without startup fetching and clears it through preview updates', async () => {
    const initialError = new Error('comparison snapshot failed');
    const onExperienceError = vi.fn();
    const onExperienceResolved = vi.fn();
    const props = {
      initialError,
      onExperienceError,
      onExperienceResolved,
      errorFallback: (value: ManagedExperienceResult) => value.error?.message,
    };
    await render(props);
    await render(props);
    expect(root.container.textContent).toBe(initialError.message);
    expect(source.fetchExperience).not.toHaveBeenCalled();
    expect(source.subscribeToPreview).toHaveBeenCalledTimes(1);
    expect(onExperienceError).toHaveBeenCalledExactlyOnceWith(
      initialError,
      expect.objectContaining({ status: 'error', data: undefined })
    );
    const selected = plan('preview recovered');
    await act(async () => source.bindings.at(-1)!.listener({ data: selected }));
    await render(props);
    expect(root.container.textContent).toBe('preview recovered');
    expect(onExperienceResolved).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: selected, error: undefined })
    );
    expect(onExperienceError).toHaveBeenCalledTimes(1);
    expect(source.fetchExperience).not.toHaveBeenCalled();
  });

  it('supports a plan/error seed and explicit retry without leaking seed or callback fields to the SDK', async () => {
    const initialPlan = plan('partial seed');
    const initialError = new Error('partial failure');
    const onExperienceError = vi.fn();
    const onExperienceResolved = vi.fn();
    const props = { initialPlan, initialError, onExperienceError, onExperienceResolved };
    await render(props);
    expect(root.container.textContent).toBe('partial seed');
    expect(onExperienceResolved).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: initialPlan, error: initialError })
    );
    expect(onExperienceError).toHaveBeenCalledTimes(1);
    expect(source.fetchExperience).not.toHaveBeenCalled();
    await act(async () => onExperienceError.mock.calls[0]![1].retry());
    await render(props);
    expect(root.container.textContent).toBe('content');
    const request = source.fetchExperience.mock.calls[0]![0];
    for (const key of ['initialError', 'initialPlan', 'onExperienceError', 'onExperienceResolved'])
      expect(request).not.toHaveProperty(key);
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    expect(onExperienceError).toHaveBeenCalledTimes(1);
  });

  it('retains usable content through preview errors and uses the same per-kind/root binding surface', async () => {
    const onNodeRoot = vi.fn();
    const errorFallback = vi.fn(() => <p>error</p>);
    await render({
      initialPlan: plan('seeded'),
      loadingFallback: <p>loading</p>,
      errorFallback,
      as: 'section',
      rootProps: { 'data-testid': 'managed' },
      trackViews: false,
      trackClicks: true,
      trackHovers: false,
      clickable: true,
      onNodeRoot,
    });
    expect(root.container.querySelector('section')?.getAttribute('data-testid')).toBe('managed');
    const node = root.container.querySelector('h1')!;
    expect(node.getAttribute('data-ctfl-track-views')).toBe('false');
    expect(node.getAttribute('data-ctfl-track-clicks')).toBe('true');
    expect(node.getAttribute('data-ctfl-track-hovers')).toBe('false');
    expect(node.getAttribute('data-ctfl-clickable')).toBe('true');
    expect(onNodeRoot).toHaveBeenCalledWith(expect.objectContaining({ element: node }));
    await act(async () =>
      source.bindings.at(-1)!.listener({ error: new Error('preview disconnected') })
    );
    expect(root.container.textContent).toBe('seeded');
    expect(errorFallback).not.toHaveBeenCalled();
    expect(source.fetchExperience).not.toHaveBeenCalled();
  });

  it('retains the current matching preview error when snapshots arrive, notifying once until source recovery', async () => {
    const pending = deferred<PortableRenderPlan>();
    source.preview.emit(previewState());
    source.fetchExperience.mockReturnValueOnce(pending.promise);
    const onExperienceResolved = vi.fn();
    const onExperienceError = vi.fn();
    await render({ onExperienceResolved, onExperienceError });
    const error = new Error('connection interrupted');
    await act(async () => source.preview.emit(previewState({ error, status: 'static' })));
    expect(onExperienceError).toHaveBeenCalledTimes(1);
    const selected = plan('usable snapshot');
    await act(async () => pending.resolve(selected));
    expect(root.container.textContent).toBe('usable snapshot');
    expect(onExperienceResolved).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        data: selected,
        error,
        status: 'error',
      })
    );
    expect(onExperienceError).toHaveBeenCalledTimes(1);
    const refresh = deferred<PortableRenderPlan>();
    source.fetchExperience.mockReturnValueOnce(refresh.promise);
    let refreshing!: Promise<void>;
    act(() => {
      refreshing = onExperienceResolved.mock.calls[0]![0].refresh();
    });
    expect(onExperienceError).toHaveBeenCalledTimes(1);
    await act(async () => {
      refresh.resolve(selected);
      await refreshing;
    });
    expect(onExperienceError).toHaveBeenCalledTimes(1);
    await act(async () => source.preview.emit(previewState({ error: undefined })));
    let result!: ManagedExperienceResult;
    await render({
      onExperienceResolved,
      onExperienceError,
      children: (value) => {
        result = value;
        return null;
      },
    });
    expect(result).toMatchObject({ status: 'success', data: selected, error: undefined });
    expect(onExperienceResolved).toHaveBeenCalledTimes(1);
    expect(onExperienceError).toHaveBeenCalledTimes(1);
  });

  it('forwards unknown-node and debug rendering options', async () => {
    await render({
      initialPlan: {
        ...plan(),
        nodes: [{ ...plan().nodes[0]!, registration: { kind: 'component', id: 'missing' } }],
      },
      renderUnknown: () => <p>custom unknown</p>,
      debug: false,
    });
    expect(root.container.textContent).toBe('custom unknown');
  });

  it('accepts loading functions and error nodes, while children retain the full result', async () => {
    const pending = deferred<PortableRenderPlan>();
    source.fetchExperience.mockReturnValue(pending.promise);
    const loading = vi.fn((value: ManagedExperienceResult) => <p>{value.status}</p>);
    await render({ loadingFallback: loading, errorFallback: <p>error node</p> });
    expect(root.container.textContent).toBe('loading');
    expect(loading).toHaveBeenLastCalledWith(
      expect.objectContaining({ refresh: expect.any(Function) })
    );
    await act(async () => pending.reject(new Error('failed')));
    expect(root.container.textContent).toBe('error node');
    await render({ children: (value) => <p>{value.error?.message}</p> });
    expect(root.container.textContent).toBe('failed');
  });

  it('notifies committed seeded and preview presentations once, including data alongside errors', async () => {
    const seed = plan('seed');
    const resolved = vi.fn((value: ManagedExperienceResult) => {
      expect(root.container.textContent).toBe(value.data?.nodes[0]?.props.content.title);
    });
    const error = vi.fn();
    const content = (onExperienceResolved = resolved) => (
      <StrictMode>
        <ExperiencesContext.Provider
          value={{ sdk: source.sdk, error: undefined, isLive: true, isContentReady: true }}
        >
          <Experience
            experienceId="home"
            config={config}
            initialPlan={seed}
            onExperienceResolved={onExperienceResolved}
            onExperienceError={error}
          />
        </ExperiencesContext.Provider>
      </StrictMode>
    );
    await act(async () => root.render(content()));
    expect(resolved).toHaveBeenCalledTimes(1);
    const replacement = vi.fn();
    await act(async () => root.render(content(replacement)));
    expect(replacement).not.toHaveBeenCalled();
    const partial = plan('partial');
    const warning = new Error('warning');
    await act(async () => source.bindings.at(-1)!.listener({ data: partial, error: warning }));
    expect(replacement).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: partial, error: warning })
    );
    expect(error).toHaveBeenCalledExactlyOnceWith(
      warning,
      expect.objectContaining({ data: partial, retry: expect.any(Function) })
    );
    await act(async () => source.bindings.at(-1)!.listener({ data: partial, error: warning }));
    expect(error).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledTimes(1);
  });

  it('never notifies during server rendering or an abandoned render', async () => {
    const resolved = vi.fn();
    const error = vi.fn();
    const content = (
      <Experience
        experience={plan('supplied')}
        config={config}
        onExperienceResolved={resolved}
        onExperienceError={error}
      />
    );
    expect(renderToString(content)).toContain('supplied');
    expect(resolved).not.toHaveBeenCalled();
    function Suspend(): never {
      throw new Promise(() => {});
    }
    await act(async () =>
      root.render(
        <Suspense fallback="pending">
          {content}
          <Suspend />
        </Suspense>
      )
    );
    expect(root.container.textContent).toBe('pending');
    expect(resolved).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('preserves seeded SSR markup through hydration and notifies only the committed presentation', async () => {
    const seed = plan('server');
    const resolved = vi.fn();
    const content = (
      <ExperiencesContext.Provider
        value={{ sdk: source.sdk, error: undefined, isLive: true, isContentReady: true }}
      >
        <Experience
          experienceId="home"
          config={config}
          initialPlan={seed}
          onExperienceResolved={resolved}
        />
      </ExperiencesContext.Provider>
    );
    root.container.innerHTML = renderToString(content);
    const serverNode = root.container.querySelector('h1');
    expect(resolved).not.toHaveBeenCalled();
    await act(async () => root.hydrate(content));
    expect(root.container.querySelector('h1')).toBe(serverNode);
    expect(resolved).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ data: seed }));
    expect(source.fetchExperience).not.toHaveBeenCalled();
  });

  it('does not publish a concurrent error after a resolution callback supersedes that result', async () => {
    let refresh!: Promise<void>;
    const error = vi.fn();
    const pending = deferred<PortableRenderPlan>();
    source.fetchExperience.mockReturnValue(pending.promise);
    await render({
      initialPlan: plan('seed'),
      onExperienceResolved: (result) => {
        if (result.error) refresh = result.refresh();
      },
      onExperienceError: error,
    });
    await act(async () =>
      source.bindings.at(-1)!.listener({ data: plan('partial'), error: new Error('obsolete') })
    );
    expect(error).not.toHaveBeenCalled();
    expect(source.fetchExperience.mock.calls[0]?.[0]).not.toHaveProperty('onExperienceResolved');
    await act(async () => {
      pending.resolve(plan('fresh'));
      await refresh;
    });
    expect(root.container.textContent).toBe('fresh');
  });

  it('suppresses stale view completions and releases replaced or unmounted bindings', async () => {
    const first = deferred<PortableRenderPlan>();
    const second = deferred<PortableRenderPlan>();
    source.fetchExperience.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const resolved = vi.fn();
    const error = vi.fn();
    await render({ onExperienceResolved: resolved, onExperienceError: error });
    const oldBinding = source.bindings.at(-1)!;
    await render({
      experienceId: 'next',
      onExperienceResolved: resolved,
      onExperienceError: error,
    });
    await act(async () => first.resolve(plan('old')));
    expect(oldBinding.unsubscribe).toHaveBeenCalledTimes(1);
    expect(resolved).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const replacement = sourceSdk();
    const third = deferred<PortableRenderPlan>();
    replacement.fetchExperience.mockReturnValue(third.promise);
    source = replacement;
    await render({
      experienceId: 'next',
      onExperienceResolved: resolved,
      onExperienceError: error,
    });
    await act(async () => second.reject(new Error('old SDK')));
    expect(error).not.toHaveBeenCalled();
    const currentBinding = source.bindings.at(-1)!;
    await act(async () => root.cleanup());
    await act(async () => third.resolve(plan('unmounted')));
    expect(currentBinding.unsubscribe).toHaveBeenCalledTimes(1);
    expect(resolved).not.toHaveBeenCalled();
  });

  it('renders supplied content without a provider and forwards the existing tracking and root surface', async () => {
    const onNodeRoot = vi.fn();
    const resolved = vi.fn();
    const supplied = plan('supplied');
    await act(async () =>
      root.render(
        <StrictMode>
          <Experience
            experience={supplied}
            config={config}
            as="section"
            rootProps={{ id: 'supplied' }}
            trackViews={false}
            trackClicks={true}
            trackHovers={false}
            clickable
            onNodeRoot={onNodeRoot}
            onExperienceResolved={resolved}
          />
        </StrictMode>
      )
    );
    expect(root.container.querySelector('section')?.id).toBe('supplied');
    const node = root.container.querySelector('h1')!;
    expect(node.getAttribute('data-ctfl-track-views')).toBe('false');
    expect(node.getAttribute('data-ctfl-track-clicks')).toBe('true');
    expect(node.getAttribute('data-ctfl-track-hovers')).toBe('false');
    expect(node.getAttribute('data-ctfl-clickable')).toBe('true');
    expect(onNodeRoot).toHaveBeenCalledWith(expect.objectContaining({ element: node }));
    expect(resolved).toHaveBeenCalledTimes(1);
    await act(async () => resolved.mock.calls[0]![0].refresh());
    expect(source.fetchExperience).not.toHaveBeenCalled();
    expect(source.subscribeToPreview).not.toHaveBeenCalled();
  });

  it('still requires a provider for managed sources', () => {
    expect(() => renderToString(<Experience experienceId="home" config={config} />)).toThrow(
      'Experiences hooks require an ExperiencesRoot or ExperiencesProvider.'
    );
  });

  it('fetches a newly managed source when its previous supplied plan is not explicitly offered as a seed', async () => {
    const seed = plan('supplied');
    const pending = deferred<PortableRenderPlan>();
    source.fetchExperience.mockReturnValue(pending.promise);
    await act(async () =>
      root.render(
        <ExperiencesContext.Provider
          value={{ sdk: source.sdk, error: undefined, isLive: true, isContentReady: true }}
        >
          <Experience experience={seed} config={config} />
        </ExperiencesContext.Provider>
      )
    );
    await render({ loadingFallback: 'loading' });
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    expect(root.container.textContent).toBe('loading');
    await act(async () => pending.resolve(plan('managed')));
    expect(root.container.textContent).toBe('managed');
  });

  it('cleans up managed bindings on supplied transitions and adopts a managed seed without refetch', async () => {
    const pending = deferred<PortableRenderPlan>();
    source.fetchExperience.mockReturnValue(pending.promise);
    const resolved = vi.fn();
    await render({ onExperienceResolved: resolved });
    const binding = source.bindings.at(-1)!;
    const supplied = plan('authoritative');
    await act(async () =>
      root.render(
        <Experience experience={supplied} config={config} onExperienceResolved={resolved} />
      )
    );
    expect(binding.unsubscribe).toHaveBeenCalledTimes(1);
    expect(source.preview.listeners.size).toBe(0);
    expect(source.locale.listeners.size).toBe(0);
    expect(source.consent.listeners.size).toBe(0);
    await act(async () => pending.resolve(plan('obsolete')));
    expect(root.container.textContent).toBe('authoritative');
    expect(resolved).toHaveBeenCalledTimes(1);
    await act(async () => resolved.mock.calls[0]![0].retry());
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    await render({ initialPlan: supplied, onExperienceResolved: resolved });
    expect(root.container.textContent).toBe('authoritative');
    expect(source.fetchExperience).toHaveBeenCalledTimes(1);
    expect(source.subscribeToPreview).toHaveBeenCalledTimes(2);
  });

  it('treats an explicitly empty supplied source as authoritative and adopts updates without SDK work', async () => {
    let result!: ManagedExperienceResult;
    const resolved = vi.fn();
    const present = (experience: PortableRenderPlan | null | undefined) => (
      <Experience
        experience={experience}
        config={config}
        onExperienceResolved={resolved}
        children={(value) => {
          result = value;
          return (
            <p>{value.data ? String(value.data.nodes[0]?.props.content.title) : value.status}</p>
          );
        }}
      />
    );
    await act(async () => root.render(present(undefined)));
    expect(root.container.textContent).toBe('idle');
    const supplied = plan('new content');
    await act(async () => root.render(present(supplied)));
    expect(root.container.textContent).toBe('new content');
    expect(resolved).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ data: supplied }));
    await act(async () => result.retry());
    await act(async () => root.render(present(supplied)));
    expect(resolved).toHaveBeenCalledTimes(1);
    expect(source.fetchExperience).not.toHaveBeenCalled();
    expect(source.subscribeToPreview).not.toHaveBeenCalled();
  });

  it('retains same-plan DOM, local state and refs across supplied/managed ownership changes', async () => {
    const mounted = vi.fn();
    const disposed = vi.fn();
    function Stateful(props: HTMLAttributes<HTMLElement>) {
      const [count, setCount] = useState(0);
      useEffect(() => {
        mounted();
        return () => {
          disposed();
        };
      }, []);
      return (
        <button {...props} onClick={() => setCount((value) => value + 1)}>
          {count}
        </button>
      );
    }
    const statefulConfig = { components: { hero: Stateful } };
    const seed = plan('same plan');
    const rootRef = vi.fn();
    const nodeCleanup = vi.fn();
    const onNodeRoot = vi.fn(() => nodeCleanup);
    const onExperienceResolved = vi.fn();
    const rootProps = { ref: rootRef };
    const content = (managed: boolean) => (
      <ExperiencesContext.Provider
        value={{ sdk: source.sdk, error: undefined, isLive: true, isContentReady: true }}
      >
        {managed ? (
          <Experience
            experienceId="home"
            config={statefulConfig}
            initialPlan={seed}
            rootProps={rootProps}
            onNodeRoot={onNodeRoot}
            onExperienceResolved={onExperienceResolved}
          />
        ) : (
          <Experience
            experience={seed}
            config={statefulConfig}
            rootProps={rootProps}
            onNodeRoot={onNodeRoot}
            onExperienceResolved={onExperienceResolved}
          />
        )}
      </ExperiencesContext.Provider>
    );
    await act(async () => root.render(content(false)));
    const suppliedNode = root.container.querySelector('button')!;
    act(() => suppliedNode.click());
    expect(suppliedNode.textContent).toBe('1');
    await act(async () => root.render(content(true)));
    expect(root.container.querySelector('button')).toBe(suppliedNode);
    expect(root.container.textContent).toBe('1');
    const binding = source.bindings.at(-1)!;
    const managedNode = root.container.querySelector('button');
    await act(async () => root.render(content(false)));
    expect(root.container.querySelector('button')).toBe(managedNode);
    expect(binding.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(disposed).not.toHaveBeenCalled();
    expect(rootRef).toHaveBeenCalledTimes(1);
    expect(nodeCleanup).not.toHaveBeenCalled();
    expect(source.preview.listeners.size).toBe(0);
    expect(source.fetchExperience).not.toHaveBeenCalled();
    await act(async () => root.render(content(true)));
    expect(root.container.querySelector('button')).toBe(suppliedNode);
    expect(root.container.textContent).toBe('1');
    expect(onExperienceResolved).toHaveBeenCalledTimes(1);
    expect(source.fetchExperience).not.toHaveBeenCalled();
    await act(async () => root.cleanup());
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(rootRef.mock.calls.filter(([element]) => element === null)).toHaveLength(1);
    expect(nodeCleanup).toHaveBeenCalledTimes(1);
  });
});
