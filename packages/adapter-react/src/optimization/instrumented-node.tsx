'use client';

import type {
  ExperiencesOptimizationAdapter,
  ResolvedNodeMetadata,
} from '@contentful/optimization-react-web/experiences-adapter';
import { type ReactNode } from 'react';

import type { DeliveryViewSourceMap } from '@contentful/experiences-core';

import { OptimizationNodeProvider } from './context';

export interface InstrumentedNodeProps {
  adapter: ExperiencesOptimizationAdapter;
  nodeId: string;
  sourceMap: DeliveryViewSourceMap;
  children: ReactNode;
}

/**
 * Per-node instrumentation wrapper.
 *
 * Consults the optimization adapter to resolve the node's variant metadata
 * from the plan's `sourceMap`. When the node isn't inside a personalized
 * subtree (`resolved === null`), renders `{children}` unchanged — no
 * wrapper, no context, no DOM cost. When it is, wraps `{children}` in a
 * `display: contents` div carrying the seven `data-ctfl-*` attrs and
 * publishes the picked `ResolvedNodeMetadata` for descendants that call
 * `useOptimization()`.
 *
 * The seven `data-ctfl-*` attrs are stamped by the adapter's ref-callback
 * (not written declaratively here) so their vocabulary stays owned by
 * `resolveNodeDataset` on the optimization runtime side.
 */
export function InstrumentedNode({
  adapter,
  nodeId,
  sourceMap,
  children,
}: InstrumentedNodeProps): ReactNode {
  const { ref, resolved } = adapter.useNodeBinding(nodeId, sourceMap);

  if (resolved === null) return <>{children}</>;

  return (
    <OptimizationNodeProvider value={resolved}>
      <div ref={ref} data-ctfl-node-id={nodeId} style={{ display: 'contents' }}>
        {children}
      </div>
    </OptimizationNodeProvider>
  );
}

export type { ResolvedNodeMetadata };
