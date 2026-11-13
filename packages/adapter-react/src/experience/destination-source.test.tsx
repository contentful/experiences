/** @vitest-environment jsdom */

import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortableRenderPlan } from '@contentful/experiences-web';
import { RuntimeContext } from '../runtime/context.js';
import { RequestContext, type RequestContextValue } from '../runtime/request-context.js';
import { createDomTestRoot, type DomTestRoot } from '../test/dom-root.js';
import { Experience, type ManagedExperienceProps } from './experience.js';
import {
  useManagedExperience,
  type ManagedExperienceOptions,
  type ManagedExperienceResult,
} from './use-managed-experience.js';
import { deferred, plan, previewState, sourceSdk } from '../test/managed-experience.js';

const config = { components: {} };
const resolved = (title: string, experienceId = 'resolved'): PortableRenderPlan => ({
  ...plan(title),
  experienceId,
});

let result: ManagedExperienceResult;
function Probe({ options }: { options: ManagedExperienceOptions }) {
  result = useManagedExperience(options);
  return (
    <output>
      {result.status}:{String(result.data?.nodes[0]?.props.content.title ?? '')}:
      {result.redirect?.path ?? ''}
    </output>
  );
}

describe('managed Destination selectors', () => {
  let root: DomTestRoot;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createDomTestRoot();
  });
  afterEach(() => {
    act(() => root.cleanup());
    vi.unstubAllGlobals();
  });

  const live = (
    source: ReturnType<typeof sourceSdk>,
    node: ReactNode,
    context?: RequestContextValue
  ) => (
    <RuntimeContext.Provider
      value={{ sdk: source.sdk, error: undefined, isLive: true, isContentReady: false }}
    >
      <RequestContext.Provider value={context}>{node}</RequestContext.Provider>
    </RuntimeContext.Provider>
  );
  const probe = (source: ReturnType<typeof sourceSdk>, options: ManagedExperienceOptions) =>
    live(source, <Probe options={options} />);

  it('loads by path and by node through the existing controller without locale or source maps', async () => {
    const source = sourceSdk();
    source.fetchByDestinationPath.mockResolvedValueOnce(resolved('by path'));
    await act(async () =>
      root.render(probe(source, { destinationId: 'dest', path: '/products', config }))
    );
    expect(root.container.textContent).toBe('success:by path:');
    expect(source.fetchByDestinationPath.mock.calls[0]?.[0]).toEqual({
      destinationId: 'dest',
      path: '/products',
      personalization: undefined,
    });
    expect(source.fetchExperience).not.toHaveBeenCalled();

    source.fetchByDestinationNode.mockResolvedValueOnce(resolved('by node'));
    await act(async () =>
      root.render(probe(source, { destinationId: 'dest', nodeId: 'products', config }))
    );
    expect(root.container.textContent).toBe('success:by node:');
    expect(source.fetchByDestinationNode.mock.calls[0]?.[0]).toEqual({
      destinationId: 'dest',
      nodeId: 'products',
      personalization: undefined,
    });
  });

  it('surfaces redirects as explicit outcomes that never render content', async () => {
    const source = sourceSdk();
    const onExperienceRedirect = vi.fn();
    const onExperienceResolved = vi.fn();
    source.fetchByDestinationPath
      .mockResolvedValueOnce(resolved('content'))
      .mockResolvedValueOnce({ redirect: { path: '/new' } });
    const props: ManagedExperienceProps = {
      destinationId: 'dest',
      path: '/old',
      config,
      onExperienceRedirect,
      onExperienceResolved,
      redirectFallback: (current) => <a href={current.redirect?.path}>moved</a>,
    };
    await act(async () => root.render(live(source, <Experience {...props} />)));
    expect(onExperienceResolved).toHaveBeenCalledTimes(1);
    await act(async () => root.render(live(source, <Experience {...props} path="/older" />)));
    expect(root.container.innerHTML).toBe('<a href="/new">moved</a>');
    expect(onExperienceRedirect).toHaveBeenCalledTimes(1);
    expect(onExperienceRedirect.mock.calls[0]?.[0]).toEqual({ path: '/new' });
    expect(onExperienceRedirect.mock.calls[0]?.[1]).toMatchObject({
      status: 'redirect',
      data: undefined,
    });
    // Nothing is presented without an explicit fallback, and the SDK never navigates.
    await act(async () =>
      root.render(
        live(
          source,
          <Experience
            destinationId="dest"
            path="/older"
            config={config}
            initialRedirect={{ path: '/new' }}
          />
        )
      )
    );
    expect(root.container.innerHTML).toBe('');
  });

  it('adopts server-seeded content and redirects without a startup fetch, and retries event-free', async () => {
    const source = sourceSdk();
    await act(async () =>
      root.render(
        probe(source, {
          destinationId: 'dest',
          path: '/old',
          config,
          initialRedirect: { path: '/new' },
        })
      )
    );
    expect(root.container.textContent).toBe('redirect::/new');
    expect(source.fetchByDestinationPath).not.toHaveBeenCalled();

    const seeded = resolved('server');
    await act(async () =>
      root.render(
        probe(source, {
          destinationId: 'dest',
          path: '/page',
          config,
          initialPlan: seeded,
          personalization: { events: [{ type: 'page' }] },
        })
      )
    );
    expect(root.container.textContent).toBe('success:server:');
    expect(source.fetchByDestinationPath).not.toHaveBeenCalled();
    source.fetchByDestinationPath.mockResolvedValueOnce(resolved('retried'));
    await act(async () => result.retry());
    expect(source.fetchByDestinationPath.mock.calls[0]?.[0].personalization).toEqual({});
    expect(root.container.textContent).toBe('success:retried:');
  });

  it('reports not-found and other errors through the existing error state', async () => {
    const source = sourceSdk();
    const notFound = Object.assign(new Error('missing'), { name: 'NotFoundError' });
    source.fetchByDestinationNode.mockRejectedValueOnce(notFound);
    await act(async () =>
      root.render(
        live(
          source,
          <Experience
            destinationId="dest"
            nodeId="missing"
            config={config}
            errorFallback={(current) => <p>{current.error?.name}</p>}
          />
        )
      )
    );
    expect(root.container.textContent).toBe('NotFoundError');
  });

  it('discards superseded selector results, including redirects', async () => {
    const source = sourceSdk();
    const first = deferred<PortableRenderPlan | { redirect: { path: string } }>();
    source.fetchByDestinationPath.mockReturnValueOnce(first.promise);
    source.fetchByDestinationPath.mockResolvedValueOnce(resolved('second'));
    await act(async () =>
      root.render(probe(source, { destinationId: 'dest', path: '/a', config }))
    );
    await act(async () =>
      root.render(probe(source, { destinationId: 'dest', path: '/b', config }))
    );
    expect(root.container.textContent).toBe('success:second:');
    await act(async () => first.resolve({ redirect: { path: '/stale' } }));
    expect(root.container.textContent).toBe('success:second:');

    // Switching selector kind with an equal locator is a new descriptor.
    source.fetchExperience.mockResolvedValueOnce(resolved('by id', '/b'));
    await act(async () => root.render(probe(source, { experienceId: '/b', config })));
    expect(root.container.textContent).toBe('success:by id:');
  });

  it('binds Preview Session updates by the resolved Experience id and rebinds when it changes', async () => {
    const source = sourceSdk();
    source.fetchByDestinationPath.mockResolvedValueOnce(resolved('published', 'home'));
    await act(async () => root.render(probe(source, { destinationId: 'dest', path: '/', config })));
    expect(source.subscribeToPreview).toHaveBeenCalledTimes(1);
    expect(source.subscribeToPreview.mock.calls[0]?.[0]).toBe('home');
    await act(async () => source.bindings.at(-1)!.listener({ data: resolved('draft', 'home') }));
    expect(root.container.textContent).toBe('success:draft:');

    source.fetchByDestinationPath.mockResolvedValueOnce(resolved('moved', 'other'));
    await act(async () => result.refresh());
    expect(source.subscribeToPreview.mock.calls.at(-1)?.[0]).toBe('other');
    expect(source.bindings.at(-2)!.unsubscribe).toHaveBeenCalled();

    source.fetchByDestinationPath.mockResolvedValueOnce({ redirect: { path: '/x' } });
    await act(async () => result.refresh());
    expect(source.bindings.at(-1)!.unsubscribe).toHaveBeenCalled();
    expect(result.status).toBe('redirect');
  });

  it('scopes Preview errors to the resolved Experience id', async () => {
    const source = sourceSdk();
    source.preview.emit(previewState({ error: new Error('home only') }));
    source.fetchByDestinationPath.mockResolvedValueOnce(resolved('other', 'other'));
    await act(async () => root.render(probe(source, { destinationId: 'dest', path: '/', config })));
    expect(result.error).toBeUndefined();
    source.fetchByDestinationPath.mockResolvedValueOnce(resolved('home', 'home'));
    await act(async () => result.refresh());
    expect(result.error?.message).toBe('home only');
  });

  it('routes initial page intent through the request context for Destination selectors', async () => {
    const source = sourceSdk();
    const fetchExperience = vi.fn().mockResolvedValue(resolved('content'));
    await act(async () =>
      root.render(
        live(source, <Probe options={{ destinationId: 'dest', path: '/', config }} />, {
          revision: {},
          fetchExperience,
          reset() {},
        })
      )
    );
    expect(fetchExperience).toHaveBeenCalledWith(
      source.sdk,
      { destinationId: 'dest', path: '/', personalization: undefined },
      { config },
      false
    );
  });

  it('allows several managed Destination presentations at once', async () => {
    const source = sourceSdk();
    source.fetchByDestinationPath.mockImplementation(async ({ path }) => resolved(path));
    await act(async () =>
      root.render(
        live(
          source,
          <>
            <Experience destinationId="dest" path="/a" config={config} />
            <Experience destinationId="dest" path="/b" config={config} />
          </>
        )
      )
    );
    expect(source.fetchByDestinationPath).toHaveBeenCalledTimes(2);
  });
});
