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
   * Defaults to the viewport the plan was pre-resolved against.
   */
  initialViewportId?: string;
  renderUnknown?: RenderUnknown;
}

export function ClientExperienceRenderer({
  experience,
  config,
  initialViewportId,
  renderUnknown = MissingComponent,
}: ClientExperienceRendererProps): ReactNode {
  if (!experience) return null;
  // Seed from the plan so first paint matches the server renderer.
  const seedViewportId =
    initialViewportId ?? experience.viewports[experience.fallbackViewportIndex]?.id;
  const { activeViewportIndex } = useActiveViewport(experience.viewports, seedViewportId);
  // Copy so the context shares no object identity with the plan arrays — see
  // the note in `server-renderer.tsx`.
  const contextViewports = experience.viewports.map((v) => ({ ...v }));
  const activeViewport = { ...(experience.viewports[activeViewportIndex] ?? FALLBACK_VIEWPORT) };

  const renderContext: RenderContext = {
    ...DEFAULT_CONTEXT,
    debug: experience.debug,
    metadata: experience.metadata,
    viewports: contextViewports,
    activeViewport,
    activeViewportIndex,
    fallbackViewportIndex: experience.fallbackViewportIndex,
  };

  return (
    <ExperienceProvider value={renderContext}>
      {experience.debug ? <DebugExperience experience={experience} /> : null}
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
