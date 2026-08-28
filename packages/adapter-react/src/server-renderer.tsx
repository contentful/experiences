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
   * auto-mounts `<DebugExperience>` (the resolved-plan JSON panel) after the
   * tree.
   *
   * Defaults to whatever `debug` the fetch ran with (carried on the plan), so
   * enabling it once on `fetchExperience` covers logging *and* rendering. Set
   * it explicitly here to override the plan for rendering only.
   */
  debug?: boolean;
  /** Override the fallback rendered for unregistered component types. */
  renderUnknown?: RenderUnknown;
}

export function ServerExperienceRenderer({
  experience,
  config,
  initialViewportId,
  metadata,
  debug,
  renderUnknown = MissingComponent,
}: ServerExperienceRendererProps): ReactNode {
  if (!experience) return null;

  // The plan is the source of truth; props override. `debug` uses `??` rather
  // than `||` so an explicit `debug={false}` can switch off a plan that was
  // fetched with debug on.
  const resolvedDebug = debug ?? experience.debug;
  // No explicit seed means "whatever the plan was pre-resolved for", which keeps
  // first paint aligned with `props.design` instead of falling back to
  // viewport[0] and recomputing.
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
