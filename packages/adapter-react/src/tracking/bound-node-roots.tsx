'use client';

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentType,
  type Ref,
  type RefObject,
} from 'react';

import { getTrackingAttributes } from '@contentful/experiences-sdk-core';
import { getNodeTrackingAttributes } from './node-tracking-attributes.js';

import type { NodeSnapshot } from '../nodes/resolve-node-props.js';
import type {
  ExperienceRootBinding,
  ExperienceRootProps,
  ExperienceTrackingOptions,
  OnExperienceNodeRoot,
} from './root-binding-types.js';

/** Internal renderer seam. Supply the enclosing plan container to reject outside portals. */
export const NodeRootBoundaryContext = createContext<RefObject<HTMLElement | null> | undefined>(
  undefined
);

export interface BoundNodeRootsProps extends ExperienceTrackingOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry lookup erases per-component prop types.
  component: ComponentType<any>;
  props: Record<string, unknown>;
  node: NodeSnapshot;
  rootProp?: string;
  onNodeRoot?: OnExperienceNodeRoot;
}

interface RootRecord {
  element: HTMLElement | null;
  ref: (element: HTMLElement | null) => void;
  cleanup?: () => void;
}

const useCommitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Renders through React, without a host wrapper or SDK-owned interaction observers. */
export function BoundNodeRoots({
  component,
  props,
  node,
  rootProp,
  clickable,
  trackClicks,
  trackHovers,
  trackViews,
  onNodeRoot,
}: BoundNodeRootsProps) {
  const boundary = useContext(NodeRootBoundaryContext);
  const attribution = node.contentful.attribution;
  const latestNode = useRef(node);
  const previousNode = useRef<NodeSnapshot | undefined>(undefined);
  // Compare committed values, never update this cache during an abandoned render.
  const registrationNode =
    previousNode.current && sameSnapshot(previousNode.current, node) ? previousNode.current : node;
  const roots = useRef(new Map<string | undefined, RootRecord>());
  const refCache = useRef(
    new Map<
      string | undefined,
      {
        withoutRef?: RootRecord;
        withRef: WeakMap<NonNullable<Ref<HTMLElement>>, RootRecord>;
      }
    >()
  );
  const committed = useRef<(() => void) | undefined>(undefined);
  const pending = useRef(false);
  const warned = useRef(false);

  // Defer until the whole commit finishes: ancestor container refs attach after child refs.
  function scheduleRegistration() {
    if (pending.current) return;
    pending.current = true;
    queueMicrotask(() => {
      pending.current = false;
      committed.current?.();
    });
  }

  const binding = useMemo<ExperienceRootBinding>(
    () => ({
      attribution,
      getRootProps(rootKey, rootProps = {}) {
        const callerRef = rootProps.ref;
        let keyedRefs = refCache.current.get(rootKey);
        if (!keyedRefs) {
          keyedRefs = { withRef: new WeakMap() };
          refCache.current.set(rootKey, keyedRefs);
        }
        let record = callerRef ? keyedRefs.withRef.get(callerRef) : keyedRefs.withoutRef;
        if (!record) {
          let callerCleanup: (() => void) | undefined;
          let callerAttached = false;
          const next: RootRecord = {
            element: null,
            // Always return void, including when a React 19 caller ref returns cleanup.
            ref(element) {
              const cleanup = next.cleanup;
              next.cleanup = undefined;
              cleanup?.();
              if (callerCleanup) {
                const cleanup = callerCleanup;
                callerCleanup = undefined;
                cleanup();
              } else if (callerAttached) {
                assignRef(callerRef, null);
              }
              callerAttached = element !== null;
              next.element = isHtmlElement(element) ? element : null;
              // Render getters may run in an abandoned tree; only committed refs own roots.
              if (next.element) roots.current.set(rootKey, next);
              else if (roots.current.get(rootKey) === next) roots.current.delete(rootKey);
              if (element !== null) callerCleanup = assignRef(callerRef, element);
              scheduleRegistration();
            },
          };
          record = next;
          if (callerRef) keyedRefs.withRef.set(callerRef, record);
          else keyedRefs.withoutRef = record;
        }
        return {
          ...rootProps,
          'data-ctfl-scopes': undefined,
          ...getNodeTrackingAttributes(attribution, {
            clickable,
            trackClicks,
            trackHovers,
            trackViews,
          }),
          ref: record.ref,
        };
      },
    }),
    [attribution, clickable, trackClicks, trackHovers, trackViews]
  );

  // Snapshot wrappers are recreated during traversal; only committed data belongs to callbacks.
  useCommitEffect(() => {
    latestNode.current = node;
    previousNode.current = registrationNode;
  });

  useCommitEffect(() => {
    const records = roots.current;
    function registerRoots() {
      if (!onNodeRoot) return;
      for (const record of records.values()) {
        if (committed.current !== registerRoots) return;
        const { element } = record;
        if (!element || record.cleanup || (boundary && !boundary.current?.contains(element))) {
          continue;
        }
        const cleanup = onNodeRoot({
          element,
          node: latestNode.current,
          attribution,
          data: attribution?.roots.at(-1),
        });
        if (record.element !== element || committed.current !== registerRoots) {
          if (typeof cleanup === 'function') cleanup();
          continue;
        }
        // Retain registration even if the consumer has no cleanup to return.
        record.cleanup = typeof cleanup === 'function' ? cleanup : () => undefined;
      }
    }
    committed.current = registerRoots;
    scheduleRegistration();
    return () => {
      committed.current = undefined;
      for (const record of records.values()) {
        const cleanup = record.cleanup;
        record.cleanup = undefined;
        cleanup?.();
      }
    };
  }, [registrationNode, rootProp, onNodeRoot, boundary]);

  useEffect(() => {
    if (
      process.env.NODE_ENV === 'production' ||
      warned.current ||
      rootProp === undefined ||
      !attribution?.roots.length
    ) {
      return;
    }
    const scopes = getTrackingAttributes(attribution)['data-ctfl-scopes'];
    const forwarded = [...roots.current.values()].some(
      ({ element }) =>
        element &&
        (!boundary || boundary.current?.contains(element)) &&
        element.getAttribute('data-ctfl-scopes') === scopes
    );
    if (!forwarded) {
      warned.current = true;
      console.warn(
        `[@contentful/experiences-react] ${node.kind} "${node.id}" did not forward ` +
          `"${rootProp}.getRootProps()" to an HTML root within its plan boundary. ` +
          'Spread the returned attributes and ref onto each actual root.'
      );
    }
  }, [node, rootProp, attribution, onNodeRoot, boundary, binding]);

  return createElement(
    component,
    rootProp === undefined
      ? { ...props, ...binding.getRootProps(undefined, props as ExperienceRootProps) }
      : { ...props, [rootProp]: binding }
  );
}

function sameValues(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && Object.is(left[key], right[key]))
  );
}

function sameSnapshot(left: NodeSnapshot, right: NodeSnapshot): boolean {
  return (
    left.kind === right.kind &&
    left.id === right.id &&
    left.nodeId === right.nodeId &&
    left.contentful.content === right.contentful.content &&
    left.contentful.design === right.contentful.design &&
    left.contentful.resolved === right.contentful.resolved &&
    left.contentful.attribution === right.contentful.attribution &&
    sameValues(left.props, right.props) &&
    sameValues(left.design, right.design)
  );
}

function isHtmlElement(element: unknown): element is HTMLElement {
  const candidate = element as HTMLElement | null;
  const HtmlElement = candidate?.ownerDocument?.defaultView?.HTMLElement;
  return !!HtmlElement && candidate instanceof HtmlElement;
}

function assignRef(ref: Ref<HTMLElement> | undefined, element: HTMLElement | null) {
  if (typeof ref === 'function') {
    const cleanup = ref(element);
    return typeof cleanup === 'function' ? cleanup : undefined;
  }
  if (ref) (ref as { current: HTMLElement | null }).current = element;
  return undefined;
}
