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
import { NodesRenderer, type RenderUnknown } from './nodes-renderer';
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
  /**
   * Viewport to render for, typically derived from the request's User-Agent.
   *
   * Defaults to the viewport the plan was pre-resolved against
   * (`fallbackViewportIndex`), so passing the same id to `fetchExperience` is
   * enough — first paint then matches the pre-resolved design with no
   * client-side recompute. Set this to render a different viewport than the one
   * the design was resolved for.
   */
  initialViewportId?: string;
  /**
   * Per-render metadata override. The plan already carries whatever `metadata`
   * the fetch ran with, so passing this again is only needed to add or replace
   * keys at render time — it shallow-merges over `experience.metadata`.
   */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on: renders the visible missing-component box,
   * turns the default `renderUnknown` fallback into the debug component, and
   * auto-mounts `<DebugExperience>` after the tree.
   *
   * Defaults to the `debug` the fetch ran with (carried on the plan). Set it
   * explicitly to override.
   */
  debug?: boolean;
  renderUnknown?: RenderUnknown;
}

export function ClientExperienceRenderer({
  experience,
  config,
  initialViewportId,
  metadata,
  debug,
  renderUnknown = MissingComponent,
}: ClientExperienceRendererProps): ReactNode {
  if (!experience) return null;
  // Plan is the source of truth; props override. See the note in `server-renderer.tsx`.
  const resolvedDebug = debug ?? experience.debug;
  // Seed from the plan's pre-resolved viewport when no explicit id is given, so
  // first paint matches the server renderer byte-for-byte before matchMedia
  // takes over. See `server-renderer.tsx`.
  const seedViewportId =
    initialViewportId ?? experience.viewports[experience.fallbackViewportIndex]?.id;
  const { activeViewportIndex } = useActiveViewport(experience.viewports, seedViewportId);
  // Copy so the context shares no object identity with the plan arrays — see
  // the note in `server-renderer.tsx`.
  const contextViewports = experience.viewports.map((v) => ({ ...v }));
  const activeViewport = { ...(experience.viewports[activeViewportIndex] ?? FALLBACK_VIEWPORT) };

  const renderContext: RenderContext = {
    ...DEFAULT_CONTEXT,
    debug: resolvedDebug,
    metadata: { ...DEFAULT_CONTEXT.metadata, ...experience.metadata, ...(metadata ?? {}) },
    viewports: contextViewports,
    activeViewport,
    activeViewportIndex,
    fallbackViewportIndex: experience.fallbackViewportIndex,
  };

  return (
    <ExperienceProvider value={renderContext}>
      {resolvedDebug ? <DebugExperience experience={experience} /> : null}
      <NodesRenderer
        nodes={experience.nodes}
        config={config}
        viewports={experience.viewports}
        activeViewportIndex={activeViewportIndex}
        fallbackViewportIndex={experience.fallbackViewportIndex}
        renderUnknown={renderUnknown}
      />
    </ExperienceProvider>
  );
}
