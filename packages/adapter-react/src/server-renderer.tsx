/*
 * Server-safe Experience renderer. Resolves the active viewport once from
 * `initialViewportId` (typically derived from User-Agent on the request)
 * and renders without any reactive subscription. RSC-friendly.
 *
 * SSR + interactive editor mode are mutually exclusive — the message-event
 * preview client requires window listeners and lives only in the client
 * renderer. For editor mode, dynamically import the client variant behind
 * a `"use client"` boundary.
 */

import type { ReactNode } from 'react';

import type {
  ExperienceContext,
  PortableRenderPlan,
  ViewportDef,
} from '@contentful/experiences-core';
import { getViewportIndex } from '@contentful/experiences-design';

import { ExperienceProvider } from './context';
import { MissingComponent } from './missing-component';
import { NodesRenderer, WrapWithTemplate, type RenderUnknown } from './nodes-renderer';
import type { Config, RenderContext } from './types';

const DEFAULT_CONTEXT: ExperienceContext = {
  isPreview: false,
  metadata: {},
  viewports: [],
};

// Fallback used when an experience payload arrives with no declared viewports.
// `getValueForViewport` will treat any design value as `undefined` because
// the cascade list is empty, so this only exists to keep `activeViewport`
// non-null in the render context's type.
const FALLBACK_VIEWPORT: ViewportDef = {
  id: '_',
  query: '*',
  displayName: 'Default',
  previewSize: '100%',
};

export interface ServerExperienceRendererProps {
  experience: PortableRenderPlan | null | undefined;
  config: Config;
  /** Initial viewport seed (e.g. derived from User-Agent). Defaults to viewport[0]. */
  initialViewportId?: string;
  /** Per-render context shallow-merged onto defaults. */
  context?: Partial<ExperienceContext>;
  /** Override the fallback rendered for unregistered component types. */
  renderUnknown?: RenderUnknown;
}

export function ServerExperienceRenderer({
  experience,
  config,
  initialViewportId,
  context,
  renderUnknown = MissingComponent,
}: ServerExperienceRendererProps): ReactNode {
  if (!experience) return null;

  const activeViewportIndex = getViewportIndex(experience.viewports, initialViewportId);
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
