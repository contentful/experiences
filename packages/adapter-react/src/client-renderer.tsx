/*
 * Client Experience renderer. First paint matches the server renderer
 * (active viewport resolved from `initialViewportId`); after hydration,
 * `useActiveViewport` takes over via `window.matchMedia` and re-renders
 * when the viewport changes.
 *
 * Safe to render on the server: when `typeof window === 'undefined'`, the
 * hook returns the seeded index and registers no listeners, so SSR output
 * matches `<ServerExperienceRenderer>`.
 */

'use client';

import { useEffect, useMemo, type ReactNode } from 'react';

import type {
  ExperienceContext,
  PortableRenderPlan,
  ViewportDef,
} from '@contentful/experiences-core';
import type { getExperiencesAdapter } from '@contentful/optimization-react-web/experiences-adapter';

import { ExperienceProvider } from './context';
import { MissingComponent } from './missing-component';
import { NodesRenderer, WrapWithTemplate, type RenderUnknown } from './nodes-renderer';
import { adapterFactory } from './optimization/load-adapter';
import { OptimizationProvider, type OptimizationRuntime } from './optimization/context';
import type { Config, RenderContext } from './types';
import { useActiveViewport } from './use-active-viewport';

/**
 * Consumer-facing type for the optimization root prop. `client` is typed as
 * the argument of the peer's `getExperiencesAdapter` so consumers who
 * install `@contentful/optimization-react-web` see the real
 * `ContentfulOptimization` type; without the peer installed, this workspace
 * sees `unknown` via the ambient declaration.
 */
export interface OptimizationOption {
  enabled: boolean;
  client: Parameters<typeof getExperiencesAdapter>[0];
}

const DEFAULT_CONTEXT: ExperienceContext = {
  isPreview: false,
  metadata: {},
  viewports: [],
};

const FALLBACK_VIEWPORT: ViewportDef = {
  id: '_',
  query: '*',
  displayName: 'Default',
  previewSize: '100%',
};

export interface ClientExperienceRendererProps {
  experience: PortableRenderPlan | null | undefined;
  config: Config;
  /** Initial viewport seed; should match what the server-rendered output used. */
  initialViewportId?: string;
  context?: Partial<ExperienceContext>;
  renderUnknown?: RenderUnknown;
  /**
   * Personalization + analytics runtime. When `enabled` is true and the
   * optional peer `@contentful/optimization-react-web` is installed, the
   * client renderer publishes an `OptimizationRuntime` context to descendants
   * and attaches view/click/hover tracking after hydration. Omitting the prop
   * (or setting `enabled: false`) renders exactly as today.
   */
  optimization?: OptimizationOption;
}

export function ClientExperienceRenderer({
  experience,
  config,
  initialViewportId,
  context,
  renderUnknown = MissingComponent,
  optimization,
}: ClientExperienceRendererProps): ReactNode {
  const runtime = useOptimizationRuntimeMemo(experience, optimization);

  useOptimizationInteractionEffect(runtime);

  if (!experience) return null;
  const { activeViewportIndex } = useActiveViewport(experience.viewports, initialViewportId);
  const activeViewport = experience.viewports[activeViewportIndex] ?? FALLBACK_VIEWPORT;

  const renderContext: RenderContext = {
    ...DEFAULT_CONTEXT,
    ...context,
    metadata: { ...DEFAULT_CONTEXT.metadata, ...(context?.metadata ?? {}) },
    viewports: experience.viewports,
    activeViewport,
    activeViewportIndex,
  };

  const tree = (
    <ExperienceProvider value={renderContext}>
      <WrapWithTemplate template={experience.template} config={config} experience={renderContext}>
        <NodesRenderer
          nodes={experience.nodes}
          config={config}
          experience={renderContext}
          renderUnknown={renderUnknown}
        />
      </WrapWithTemplate>
    </ExperienceProvider>
  );

  if (runtime === null) return tree;
  return <OptimizationProvider value={runtime}>{tree}</OptimizationProvider>;
}

/**
 * Builds the per-render `OptimizationRuntime` when the prop is enabled and
 * the peer is installed. Returns `null` when the surface should stay a
 * no-op — the caller then skips the provider wrap entirely.
 */
function useOptimizationRuntimeMemo(
  experience: PortableRenderPlan | null | undefined,
  optimization: OptimizationOption | undefined,
): OptimizationRuntime | null {
  return useMemo(() => {
    if (!optimization?.enabled || !optimization.client) return null;
    if (adapterFactory === null) return null;
    return {
      adapter: adapterFactory(optimization.client),
      sourceMap: experience?.sourceMap,
    };
  }, [optimization?.enabled, optimization?.client, experience?.sourceMap]);
}

/**
 * Attaches views/clicks/hovers on mount, detaches on unmount. Runs
 * unconditionally so the hook order stays stable across renders; when the
 * runtime is null the effect is a no-op.
 */
function useOptimizationInteractionEffect(runtime: OptimizationRuntime | null): void {
  useEffect(() => {
    if (runtime === null) return;
    return runtime.adapter.attachInteractionRuntime({
      views: true,
      clicks: true,
      hovers: true,
    });
  }, [runtime]);
}
