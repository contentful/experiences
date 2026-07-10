/*
 * Client-side Experience renderer. Uses `useActiveViewport` to react to
 * `window.matchMedia` changes; throws on the server so pair it with
 * `ServerExperienceRenderer` for SSR, or use `ExperienceRenderer` for the
 * hybrid case (SSR first paint + client hydration + preview wire).
 *
 * Use `initialViewportId` (typically derived from User-Agent on the
 * server) to seed the first render, matching what the server emitted; the
 * hook then takes over via media queries to switch viewports as the
 * window resizes.
 *
 * When `enablePreview` is set, the renderer additionally connects to the
 * parent editor via postMessage on mount. Before `init` arrives — or when
 * the app is not embedded in a known editor origin — rendering falls back
 * to the `experience` prop. Once `init` arrives, the editor-delivered
 * plan is rendered instead and every subsequent `viewUpdate` from the
 * editor replaces it in place. Safe to leave on in production: the
 * preview SDK's `ancestorOrigins` check refuses to connect when no editor
 * is above the iframe.
 */

'use client';

import { useMemo, type ReactNode } from 'react';

import type {
  ExperienceContext,
  PortableRenderPlan,
  ViewportDef,
} from '@contentful/experiences-core';
import type { PreviewCapabilities } from '@contentful/experiences-preview-react';
import {
  usePreviewOverride,
  useResolvedPreviewPlan,
} from '@contentful/experiences-preview-react';

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

  /**
   * Opt in to Contentful editor preview.
   *
   * When enabled, the renderer connects to the parent editor via
   * postMessage on mount. Before `init` arrives — or when the app is not
   * embedded in a known editor origin — rendering falls back to the
   * `experience` prop. Once `init` arrives, the editor's plan is rendered
   * instead and every subsequent `viewUpdate` from the editor replaces it
   * in place.
   *
   * Safe to leave on in production: the SDK checks `ancestorOrigins`
   * against a hardcoded allow-list of Contentful editor origins and is a
   * no-op when no match is found.
   */
  enablePreview?: boolean;

  /**
   * Preview capabilities advertised to the editor. Defaults to fully
   * reactive (`liveUpdate: true`). Set `liveUpdate: false` to opt out of
   * `viewUpdate` — the editor will reload the iframe on save instead of
   * pushing incremental updates. Ignored when `enablePreview` is false.
   */
  previewCapabilities?: Partial<PreviewCapabilities>;

  /**
   * Optional origin override for the editor postMessage target. Accepts a
   * single origin or an array. Useful for self-hosted proxies, staging
   * setups, or tests. Ignored when `enablePreview` is false.
   */
  previewTargetOrigin?: string | string[];
}

export function ClientExperienceRenderer({
  experience,
  config,
  initialViewportId,
  context,
  renderUnknown = MissingComponent,
  enablePreview = false,
  previewCapabilities,
  previewTargetOrigin,
}: ClientExperienceRendererProps): ReactNode {
  if (typeof window === 'undefined') {
    throw new Error(
      'ClientExperienceRenderer cannot be used on the server. Use ServerExperienceRenderer for SSR-only routes, or ExperienceRenderer for the hybrid case.'
    );
  }

  // Set of component-type ids the customer registered — used by the
  // preview hook to detect missing components in the incoming view and
  // report `partial` render status back to the editor.
  const knownComponentTypeIds = useMemo(
    () => new Set(Object.keys(config.components)),
    [config.components]
  );

  const preview = usePreviewOverride(
    {
      enabled: enablePreview,
      capabilities: previewCapabilities,
      targetOrigin: previewTargetOrigin,
    },
    enablePreview ? knownComponentTypeIds : null
  );

  // Convert the API-generic HydratedView from the wire into the renderer's
  // internal `PortableRenderPlan` via the same `resolveExperience` path
  // customers use for their fetched payloads.
  const previewPlan = useResolvedPreviewPlan(preview.view, config);

  // postMessage view wins once it arrives (and finishes resolving);
  // otherwise the prop is authoritative.
  const activeExperience = previewPlan ?? experience;
  if (!activeExperience) return null;

  return (
    <ClientExperienceRendererInner
      experience={activeExperience}
      config={config}
      initialViewportId={initialViewportId}
      context={context}
      renderUnknown={renderUnknown ?? MissingComponent}
    />
  );
}

interface InnerProps extends Required<
  Pick<ClientExperienceRendererProps, 'config' | 'renderUnknown'>
> {
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
    <WrapWithTemplate template={experience.template} config={config} experience={renderContext}>
      <NodesRenderer
        nodes={experience.nodes}
        config={config}
        experience={renderContext}
        renderUnknown={renderUnknown}
      />
    </WrapWithTemplate>
  );
}
