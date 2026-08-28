/*
 * Server-safe Experience renderer. Resolves the active viewport once from
 * `initialViewportId` and renders without any reactive subscription.
 */

import type { ReactNode } from 'react';

import type {
  ExperienceContext,
  PortableRenderPlan,
  ViewportDef,
} from '@contentful/experiences-sdk-core';
import { getViewportIndex } from '@contentful/experiences-design';

import { DebugExperience } from './debug-experience';
import { ExperienceProvider } from './context';
import { MissingComponent } from './missing-component';
import { NodesRenderer, type RenderUnknown } from './nodes-renderer';
import type { Config, RenderContext } from './types';

const DEFAULT_CONTEXT: ExperienceContext = {
  debug: false,
  metadata: {},
  viewports: [],
};

// Keeps `activeViewport` non-null when a payload declares no viewports.
const FALLBACK_VIEWPORT: ViewportDef = {
  id: '_',
  query: '*',
  displayName: 'Default',
  previewSize: '100%',
};

export interface ServerExperienceRendererProps {
  experience: PortableRenderPlan | null | undefined;
  config: Config;
  /**
   * Viewport to render for, typically derived from the request's User-Agent.
   * Defaults to the viewport the plan was pre-resolved against.
   */
  initialViewportId?: string;
  /** Override the fallback rendered for unregistered component types. */
  renderUnknown?: RenderUnknown;
}

export function ServerExperienceRenderer({
  experience,
  config,
  initialViewportId,
  renderUnknown = MissingComponent,
}: ServerExperienceRendererProps): ReactNode {
  if (!experience) return null;

  // Default to the pre-resolved viewport so first paint needs no recompute.
  const activeViewportIndex =
    initialViewportId === undefined
      ? experience.fallbackViewportIndex
      : getViewportIndex(experience.viewports, initialViewportId);

  // Copy viewports/activeViewport so the context (serialized + frozen by RSC)
  // shares no object identity with the plan arrays the renderers read below —
  // a shared reference makes Flight back-patch into frozen props and throw.
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
