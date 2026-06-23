/*
 * Client-side Experience renderer. Uses `useActiveViewport` to react to
 * window.matchMedia changes.
 *
 * Throws if rendered on the server — pair with `ServerExperienceRenderer`
 * for SSR. Use `initialViewportId` (typically derived from User-Agent on the
 * server) to seed the first render, matching what the server emitted; the
 * hook then takes over via media queries to switch viewports as the window
 * resizes.
 */

'use client';

import type { ReactNode } from 'react';

import type {
  ExperienceContext,
  PortableRenderPlan,
  ViewportDef,
} from '@contentful/experiences-core';

import { MissingComponent } from './missing-component';
import {
  NodesRenderer,
  WrapWithTemplate,
  type RenderUnknown,
} from './nodes-renderer';
import type { Config, RenderContext } from './types';
import { useActiveViewport } from './use-active-viewport';

const DEFAULT_CONTEXT: ExperienceContext = {
  isPreview: false,
  metadata: {},
};

const FALLBACK_VIEWPORT: ViewportDef = {
  id: '_',
  query: '*',
  displayName: 'Default',
  previewSize: '100%',
};

export interface ClientExperienceRendererProps {
  /**
   * The resolved experience returned by `resolveExperience`. The prop is
   * named `experience` because it's what customers think of as "the
   * experience to render"; `PortableRenderPlan` is the internal IR name.
   */
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
  if (typeof window === 'undefined') {
    throw new Error(
      'ClientExperienceRenderer cannot be used on the server. Use ServerExperienceRenderer for SSR.',
    );
  }
  if (!experience) return null;
  return (
    <ClientExperienceRendererInner
      experience={experience}
      config={config}
      initialViewportId={initialViewportId}
      context={context}
      renderUnknown={renderUnknown ?? MissingComponent}
    />
  );
}

interface InnerProps
  extends Required<Pick<ClientExperienceRendererProps, 'config' | 'renderUnknown'>> {
  experience: PortableRenderPlan;
  initialViewportId?: string;
  context?: Partial<ExperienceContext>;
}

function ClientExperienceRendererInner({
  experience,
  config,
  initialViewportId,
  context,
  renderUnknown,
}: InnerProps): ReactNode {
  const { activeViewportIndex } = useActiveViewport(
    experience.viewports,
    initialViewportId,
  );
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
    <WrapWithTemplate
      template={experience.template}
      config={config}
      experience={renderContext}
    >
      <NodesRenderer
        nodes={experience.nodes}
        config={config}
        experience={renderContext}
        renderUnknown={renderUnknown}
      />
    </WrapWithTemplate>
  );
}
