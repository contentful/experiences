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

import type { ReactNode } from 'react';

import type {
  ExperienceContext,
  PortableRenderPlan,
  ViewportDef,
} from '@contentful/experiences-core';

import { ExperienceProvider } from './context';
import { MissingComponent } from './missing-component';
import { NodesRenderer, WrapWithTemplate, type RenderUnknown } from './nodes-renderer';
import type { Config, RenderContext } from './types';
import { useActiveViewport } from './use-active-viewport';

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
}

export function ClientExperienceRenderer({
  experience,
  config,
  initialViewportId,
  context,
  renderUnknown = MissingComponent,
}: ClientExperienceRendererProps): ReactNode {
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

  return (
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
}
