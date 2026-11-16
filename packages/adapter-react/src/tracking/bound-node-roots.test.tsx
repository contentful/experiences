/** @vitest-environment jsdom */

import {
  act,
  createRef,
  forwardRef,
  memo,
  startTransition,
  StrictMode,
  Suspense,
  useState,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NodeAttribution } from '@contentful/experiences-sdk-core';

import { BoundNodeRoots, NodeRootBoundaryContext } from './bound-node-roots';
import type { NodeSnapshot } from '../nodes/resolve-node-props';
import type {
  ExperienceNodeRoot,
  ExperienceRootBinding,
  ExperienceRootProps,
  OnExperienceNodeRoot,
} from './root-binding-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scope = {
  key: 'experience:0',
  entityId: 'experience',
  entityKind: 'Experience' as const,
  variantIndex: 0,
};
const attribution: NodeAttribution = { scopes: [scope], roots: [scope] };
const node: NodeSnapshot = {
  kind: 'component',
  id: 'card',
  nodeId: 'n1',
  props: {},
  design: {},
  contentful: { componentId: 'card', content: {}, design: {}, attribution },
};

const Direct = forwardRef<HTMLElement, ExperienceRootProps>((props, ref) => (
  <article {...props} ref={ref} />
));

function Named({ root }: { root: ExperienceRootBinding }) {
  return <article {...root.getRootProps()} />;
}

let container: HTMLDivElement;
let renderer: Root | undefined;

async function render(element: ReactElement) {
  if (!renderer) {
    container = document.createElement('div');
    document.body.append(container);
    renderer = createRoot(container);
  }
  await act(async () => {
    renderer!.render(element);
  });
}

async function unmount() {
  await act(async () => renderer?.unmount());
  renderer = undefined;
}

afterEach(async () => {
  await unmount();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('BoundNodeRoots', () => {
  it.each(['props', 'design'] as const)(
    'refreshes effective snapshot %s without restarting equivalent copies',
    async (field) => {
      const cleanup = vi.fn();
      const callback = vi.fn<OnExperienceNodeRoot>(() => cleanup);
      let snapshot = { ...node, [field]: { label: 'first' } };
      const element = () => (
        <BoundNodeRoots
          component={Named}
          node={snapshot}
          rootProp="root"
          props={{}}
          onNodeRoot={callback}
        />
      );
      await render(element());
      snapshot = { ...snapshot, [field]: { label: 'first' } };
      await render(element());
      expect(callback).toHaveBeenCalledTimes(1);
      expect(cleanup).not.toHaveBeenCalled();
      snapshot = { ...snapshot, [field]: { label: 'second' } };
      await render(element());
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback.mock.calls[1]![0].node[field]).toEqual({ label: 'second' });
    }
  );

  it('renders direct and named SSR roots without wrappers, and reserves the named property', () => {
    const direct = renderToStaticMarkup(
      <BoundNodeRoots component={Direct} node={node} props={{ id: 'card', children: 'body' }} />
    );
    function Pair({ root }: { root: ExperienceRootBinding }) {
      return (
        <>
          <header {...root.getRootProps('header')} />
          <footer {...root.getRootProps('footer')} />
        </>
      );
    }
    const named = renderToStaticMarkup(
      <BoundNodeRoots component={Pair} node={node} rootProp="root" props={{ root: 'collision' }} />
    );
    expect(direct).toBe('<article id="card" data-ctfl-scopes="experience:0">body</article>');
    expect(named).toBe(
      '<header data-ctfl-scopes="experience:0"></header><footer data-ctfl-scopes="experience:0"></footer>'
    );
  });

  it('keeps keyed refs stable, preserves caller props/refs, and groups roots under the node scopes', async () => {
    const firstRef = createRef<HTMLElement>();
    const secondRef = vi.fn();
    const clicked = vi.fn();
    const onNodeRoot = vi.fn();
    const seen: ExperienceRootProps[][] = [];
    function Pair({ root, text }: { root: ExperienceRootBinding; text: string }) {
      const first = root.getRootProps('first', {
        ref: firstRef,
        className: 'caller',
        'aria-label': 'card',
        'data-custom': 5,
        'data-ctfl-scopes': 'wrong',
        onClick: clicked,
      });
      const second = root.getRootProps('second', { ref: secondRef });
      seen.push([first, second]);
      return (
        <>
          <article {...first}>{text}</article>
          <aside {...second} />
        </>
      );
    }
    const element = (text: string) => (
      <BoundNodeRoots
        component={Pair}
        node={{ ...node, props: { ...node.props }, contentful: { ...node.contentful } }}
        rootProp="root"
        props={{ text }}
        onNodeRoot={onNodeRoot}
      />
    );
    await render(element('first'));
    const article = container.querySelector('article')!;
    const aside = container.querySelector('aside')!;
    expect(firstRef.current).toBe(article);
    expect(secondRef).toHaveBeenCalledExactlyOnceWith(aside);
    expect(article.outerHTML).toContain('class="caller" aria-label="card" data-custom="5"');
    expect(
      Array.from(container.children).map((root) => root.getAttribute('data-ctfl-scopes'))
    ).toEqual(['experience:0', 'experience:0']);
    act(() => article.click());
    expect(clicked).toHaveBeenCalledOnce();
    await render(element('second'));
    expect(seen[1]![0]!.ref).toBe(seen[0]![0]!.ref);
    expect(seen[1]![1]!.ref).toBe(seen[0]![1]!.ref);
    expect(seen[0]![0]!.ref).not.toBe(seen[0]![1]!.ref);
    expect(onNodeRoot).toHaveBeenCalledTimes(2);
    expect(secondRef).toHaveBeenCalledTimes(1);
    await unmount();
    expect(firstRef.current).toBeNull();
    expect(secondRef).toHaveBeenLastCalledWith(null);
  });

  it('cleans each root on detach and registers replacements produced by the component itself', async () => {
    const cleanups: ReturnType<typeof vi.fn>[] = [];
    const onNodeRoot = vi.fn((_root: ExperienceNodeRoot) => {
      const cleanup = vi.fn();
      cleanups.push(cleanup);
      return cleanup;
    });
    function Toggle({ root }: { root: ExperienceRootBinding }) {
      const [alternate, setAlternate] = useState(false);
      return (
        <>
          <button onClick={() => setAlternate(!alternate)}>replace</button>
          {alternate ? <aside {...root.getRootProps()} /> : <article {...root.getRootProps()} />}
        </>
      );
    }
    await render(
      <BoundNodeRoots
        component={Toggle}
        node={node}
        rootProp="root"
        props={{}}
        onNodeRoot={onNodeRoot}
      />
    );
    const original = container.querySelector('article');
    const latestSnapshot = {
      ...node,
      props: { ...node.props },
      contentful: { ...node.contentful },
    };
    await render(
      <BoundNodeRoots
        component={Toggle}
        node={latestSnapshot}
        rootProp="root"
        props={{}}
        onNodeRoot={onNodeRoot}
      />
    );
    expect(onNodeRoot).toHaveBeenCalledOnce();
    await act(async () => container.querySelector('button')!.click());
    expect(cleanups[0]).toHaveBeenCalledOnce();
    expect(onNodeRoot.mock.calls.map(([root]) => root.element)).toEqual([
      original,
      container.querySelector('aside'),
    ]);
    expect(onNodeRoot.mock.calls[1]![0].node).toBe(latestSnapshot);
    await unmount();
    expect(cleanups[1]).toHaveBeenCalledOnce();
  });

  it('refreshes snapshot/attribution/callback ownership independently of automatic overrides', async () => {
    const cleanup = vi.fn();
    const callback = vi.fn(() => cleanup);
    const nextCleanup = vi.fn();
    const nextCallback = vi.fn(() => nextCleanup);
    let snapshot = node;
    const element = (
      trackViews?: boolean,
      onNodeRoot: OnExperienceNodeRoot | undefined = callback
    ) => (
      <BoundNodeRoots
        component={Named}
        node={snapshot}
        rootProp="root"
        props={{}}
        trackViews={trackViews}
        onNodeRoot={onNodeRoot}
      />
    );
    await render(element());
    const article = container.querySelector('article');
    snapshot = { ...node, contentful: { ...node.contentful, content: { revision: 2 } } };
    await render(element());
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({
      element: article,
      node: snapshot,
      attribution,
      data: scope,
    });
    await render(element(false));
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(article!.getAttribute('data-ctfl-scopes')).toBe(scope.key);
    expect(article!.getAttribute('data-ctfl-track-views')).toBe('false');
    snapshot = { ...snapshot, contentful: { ...node.contentful, attribution: undefined } };
    await render(element(false));
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({
      element: article,
      node: snapshot,
      attribution: undefined,
      data: undefined,
    });
    expect(article!.hasAttribute('data-ctfl-scopes')).toBe(false);
    await render(element(false, nextCallback));
    expect(cleanup).toHaveBeenCalledTimes(3);
    expect(nextCallback).toHaveBeenCalledOnce();
    await render(
      <BoundNodeRoots
        component={Named}
        node={snapshot}
        rootProp="root"
        props={{}}
        trackViews={false}
      />
    );
    expect(nextCleanup).toHaveBeenCalledOnce();
    await unmount();
    expect(nextCleanup).toHaveBeenCalledOnce();
  });

  it('keeps attribution and manual callbacks when all automatic kinds are disabled', async () => {
    const callback = vi.fn();
    await render(
      <BoundNodeRoots
        component={Direct}
        node={node}
        props={{ 'data-ctfl-scopes': 'wrong', 'data-other': 'kept' }}
        trackViews={false}
        trackHovers={false}
        trackClicks={false}
        onNodeRoot={callback}
      />
    );
    const article = container.querySelector('article')!;
    expect(article.getAttribute('data-ctfl-scopes')).toBe(scope.key);
    expect(article.getAttribute('data-ctfl-track-views')).toBe('false');
    expect(article.getAttribute('data-ctfl-track-hovers')).toBe('false');
    expect(article.getAttribute('data-ctfl-track-clicks')).toBe('false');
    expect(article.dataset.other).toBe('kept');
    expect(callback).toHaveBeenCalledExactlyOnceWith({
      element: article,
      node,
      attribution,
      data: scope,
    });
  });

  it('composes React 19 ref cleanup, ref replacement, and a void-returning SDK ref', async () => {
    const callerCleanup = vi.fn();
    const callerRef = vi.fn(() => callerCleanup);
    const nextRef = vi.fn();
    const rootCleanup = vi.fn();
    const onNodeRoot = vi.fn(() => rootCleanup);
    let binding: ExperienceRootBinding | undefined;
    function Capture({
      root,
      forwardedRef,
    }: {
      root: ExperienceRootBinding;
      forwardedRef: ExperienceRootProps['ref'];
    }) {
      binding = root;
      return <article {...root.getRootProps('root', { ref: forwardedRef })} />;
    }
    const element = (forwardedRef: ExperienceRootProps['ref']) => (
      <BoundNodeRoots
        component={Capture}
        node={node}
        props={{ forwardedRef }}
        rootProp="root"
        onNodeRoot={onNodeRoot}
      />
    );
    await render(element(callerRef));
    await render(element(nextRef));
    expect(callerCleanup).toHaveBeenCalledOnce();
    expect(callerRef).toHaveBeenCalledTimes(1);
    expect(rootCleanup).toHaveBeenCalledOnce();
    expect(nextRef).toHaveBeenCalledExactlyOnceWith(container.querySelector('article'));
    await unmount();
    expect(nextRef).toHaveBeenLastCalledWith(null);
    expect(rootCleanup).toHaveBeenCalledTimes(2);
    const sdkRef = binding!.getRootProps('probe').ref as (element: HTMLElement | null) => unknown;
    expect(sdkRef(document.createElement('div'))).toBeUndefined();
    expect(sdkRef(null)).toBeUndefined();
  });

  it('only registers actual HTML roots inside a supplied plan boundary, preserving standalone manual roots', async () => {
    const boundary = createRef<HTMLElement>();
    const portal = document.createElement('div');
    document.body.append(portal);
    const onNodeRoot = vi.fn();
    function Roots({ root }: { root: ExperienceRootBinding }) {
      return (
        <>
          <article {...root.getRootProps('inside')} />
          {createPortal(<aside {...root.getRootProps('portal')} />, portal)}
          <svg {...(root.getRootProps('svg') as any)} />
        </>
      );
    }
    await render(
      <NodeRootBoundaryContext.Provider value={boundary}>
        <main ref={boundary} data-ctfl-attribution="{}">
          <BoundNodeRoots
            component={Roots}
            node={node}
            rootProp="root"
            props={{}}
            trackViews={false}
            onNodeRoot={onNodeRoot}
          />
        </main>
      </NodeRootBoundaryContext.Provider>
    );
    expect(onNodeRoot).toHaveBeenCalledExactlyOnceWith({
      element: container.querySelector('article'),
      node,
      attribution,
      data: scope,
    });
    await unmount();
    await render(
      <BoundNodeRoots
        component={Named}
        node={node}
        rootProp="root"
        props={{}}
        trackViews={false}
        onNodeRoot={onNodeRoot}
      />
    );
    expect(onNodeRoot).toHaveBeenCalledTimes(2);
  });

  it('warns only in development for attributed named bindings that fail to forward attributes/ref', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const callback = vi.fn();
    const Unsupported = () => <article />;
    await render(
      <BoundNodeRoots
        component={Unsupported}
        node={node}
        rootProp="root"
        props={{}}
        onNodeRoot={callback}
      />
    );
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('root.getRootProps()'));
    expect(callback).not.toHaveBeenCalled();
    await unmount();
    vi.stubEnv('NODE_ENV', 'production');
    await render(<BoundNodeRoots component={Unsupported} node={node} rootProp="root" props={{}} />);
    expect(warn).toHaveBeenCalledOnce();
    await unmount();
    vi.stubEnv('NODE_ENV', 'development');
    const unattributed = { ...node, contentful: { ...node.contentful, attribution: undefined } };
    await render(
      <BoundNodeRoots component={Unsupported} node={unattributed} rootProp="root" props={{}} />
    );
    expect(warn).toHaveBeenCalledOnce();
  });

  it('balances callback cleanup under Strict Mode while React renders memoized components with hooks', async () => {
    let active = 0;
    const callback: OnExperienceNodeRoot = () => {
      active++;
      return () => {
        active--;
      };
    };
    const Hooked = memo(function Hooked({ root }: { root: ExperienceRootBinding }) {
      const [text] = useState('React owns this render');
      return <article {...root.getRootProps()}>{text}</article>;
    });
    await render(
      <StrictMode>
        <BoundNodeRoots
          component={Hooked}
          node={node}
          rootProp="root"
          props={{}}
          onNodeRoot={callback}
        />
      </StrictMode>
    );
    expect(container.textContent).toBe('React owns this render');
    expect(active).toBe(1);
    await unmount();
    expect(active).toBe(0);
  });

  it('retains the committed root and ref when a transition abandons a different caller ref', async () => {
    const callerRef = createRef<HTMLElement>();
    const abandonedRef = vi.fn();
    const cleanup = vi.fn();
    const onNodeRoot = vi.fn(() => cleanup);
    const refs: ExperienceRootProps['ref'][] = [];
    const suspended = new Promise<void>(() => undefined);
    function Candidate({
      root,
      forwardedRef,
      suspend,
    }: {
      root: ExperienceRootBinding;
      forwardedRef: ExperienceRootProps['ref'];
      suspend: boolean;
    }) {
      const rootProps = root.getRootProps('root', { ref: forwardedRef });
      refs.push(rootProps.ref);
      if (suspend) throw suspended;
      return <article {...rootProps} />;
    }
    const element = (
      forwardedRef: ExperienceRootProps['ref'],
      suspend: boolean,
      snapshot = node
    ) => (
      <Suspense fallback={<p>loading</p>}>
        <BoundNodeRoots
          component={Candidate}
          node={snapshot}
          rootProp="root"
          props={{ forwardedRef, suspend }}
          onNodeRoot={onNodeRoot}
        />
      </Suspense>
    );
    await render(element(callerRef, false));
    const article = callerRef.current;
    await act(async () => {
      startTransition(() => renderer!.render(element(abandonedRef, true)));
    });
    expect(container.querySelector('article')).toBe(article);
    expect(abandonedRef).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    const nextNode = { ...node, contentful: { ...node.contentful, content: { revision: 2 } } };
    await render(element(callerRef, false, nextNode));
    expect(callerRef.current).toBe(article);
    expect(refs.at(-1)).toBe(refs[0]);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(onNodeRoot).toHaveBeenCalledTimes(2);
    expect(onNodeRoot).toHaveBeenLastCalledWith({
      element: article,
      node: nextNode,
      attribution,
      data: scope,
    });
    await unmount();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
