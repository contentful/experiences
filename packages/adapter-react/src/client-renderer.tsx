/*
 * Client Experience renderer. First paint matches the server renderer; after
 * hydration `useActiveViewport` takes over via `matchMedia`. Server-safe: the
 * hook returns the seeded index and registers no listeners when there's no
 * window, so SSR output matches `<ServerExperienceRenderer>`.
 */

'use client';

import type { ReactNode } from 'react';

import type {
  ExperienceContext,
  PortableRenderPlan,
  ViewportDef,
} from '@contentful/experiences-sdk-core';

import { DebugExperience } from './debug-experience';
import { ExperienceProvider } from './context';
import { MissingComponent } from './missing-component';
import { NodesRenderer, WrapWithTemplate, type RenderUnknown } from './nodes-renderer';
import type { Config, RenderContext } from './types';
import { useActiveViewport } from './use-active-viewport';

const DEFAULT_CONTEXT: ExperienceContext = {
  debug: false,
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
  /**
   * Arbitrary per-render metadata, readable by descendants via
   * `useExperience()` and by resolvers via `ctx.experience.metadata`.
   */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on: renders the visible missing-component box,
   * turns the default `renderUnknown` fallback into the debug component, and
   * auto-mounts `<DebugExperience>` after the tree.
   */
  debug?: boolean;
  renderUnknown?: RenderUnknown;
}

export function ClientExperienceRenderer({
  experience,
  config,
  initialViewportId,
  metadata,
  debug = false,
  renderUnknown = MissingComponent,
}: ClientExperienceRendererProps): ReactNode {
  if (!experience) return null;
  const { activeViewportIndex } = useActiveViewport(experience.viewports, initialViewportId);
  // Copy so the context shares no object identity with the plan arrays — see
  // the note in `server-renderer.tsx`.
  const contextViewports = experience.viewports.map((v) => ({ ...v }));
  const activeViewport = { ...(experience.viewports[activeViewportIndex] ?? FALLBACK_VIEWPORT) };

  const renderContext: RenderContext = {
    ...DEFAULT_CONTEXT,
    debug,
    metadata: { ...DEFAULT_CONTEXT.metadata, ...(metadata ?? {}) },
    viewports: contextViewports,
    activeViewport,
    activeViewportIndex,
  };

  return (
    <ExperienceProvider value={renderContext}>
      <WrapWithTemplate
        template={experience.template}
        config={config}
        viewports={experience.viewports}
        activeViewportIndex={activeViewportIndex}
      >
        <NodesRenderer
          nodes={experience.nodes}
          config={config}
          viewports={experience.viewports}
          activeViewportIndex={activeViewportIndex}
          renderUnknown={renderUnknown}
        />
      </WrapWithTemplate>
      {debug ? <DebugExperience experience={experience} /> : null}
    </ExperienceProvider>
  );
}
