'use client';

import type {
  ExperiencesOptimizationAdapter,
  ResolvedNodeMetadata,
} from '@contentful/optimization-react-web/experiences-adapter';
import { createContext, useContext } from 'react';

import type { DeliveryViewSourceMap } from '@contentful/experiences-core';

/**
 * Root-level runtime injected by `ClientExperienceRenderer` /
 * `ServerExperienceRenderer` when the optimization prop is enabled and the
 * peer package is installed. `sourceMap` is the plan's opaque XDA
 * `extensions.sourceMap` passthrough; the adapter interprets it per-node.
 */
export interface OptimizationRuntime {
  adapter: ExperiencesOptimizationAdapter;
  sourceMap: DeliveryViewSourceMap | undefined;
}

const OptimizationRuntimeContext = createContext<OptimizationRuntime | null>(null);
const OptimizationNodeContext = createContext<ResolvedNodeMetadata | null>(null);

export const OptimizationProvider = OptimizationRuntimeContext.Provider;

/**
 * Provider for the per-node resolved metadata published by
 * `InstrumentedNode` (Milestone 10). Kept here so `useOptimization()` can read
 * from a single context regardless of where in the subtree the consumer
 * component sits.
 */
export const OptimizationNodeProvider = OptimizationNodeContext.Provider;

/**
 * Root-level runtime lookup. Returns `null` when no `OptimizationProvider` is
 * mounted — i.e. the renderer's `optimization` prop is absent, disabled, or
 * the optional peer isn't installed.
 */
export function useOptimizationRuntime(): OptimizationRuntime | null {
  return useContext(OptimizationRuntimeContext);
}

/**
 * Per-node introspection hook for consumer components. Returns the
 * `ResolvedNodeMetadata` selected for the nearest enclosing instrumented node,
 * or `null` when the component isn't inside a personalized node (or the
 * optimization surface is disabled entirely).
 */
export function useOptimization(): { resolved: ResolvedNodeMetadata | null } {
  return { resolved: useContext(OptimizationNodeContext) };
}
