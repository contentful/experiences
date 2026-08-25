/*
 * Server-safe Experience renderer. Resolves the active viewport once from
 * `initialViewportId` and renders without any reactive subscription.
 */

import type { ReactNode } from 'react';

import type {
  ExperienceContext,
  ExperienceDiagnostic,
  PortableRenderPlan,
  ViewportDef,
} from '@contentful/experiences-sdk-core';
import { getViewportIndex } from '@contentful/experiences-design';

import { ComponentError } from './component-error';
import { DebugExperience } from './debug-experience';
import { ExperienceProvider } from './context';
import { MissingComponent } from './missing-component';
import { NodesRenderer, type RenderError, type RenderUnknown } from './nodes-renderer';
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
  /** Initial viewport seed (e.g. derived from User-Agent). Defaults to viewport[0]. */
  initialViewportId?: string;
  /**
   * Arbitrary per-render metadata, readable by descendants via
   * `useExperience()` and by resolvers via `ctx.experience.metadata`.
   */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on: renders the visible missing-component box,
   * turns the default `renderUnknown` fallback into the debug component, and
   * auto-mounts `<DebugExperience>` (the resolved-plan JSON panel) after the
   * tree. Pair with `debug` on `fetchExperience` for end-to-end logging.
   */
  debug?: boolean;
  /** Override the fallback rendered for unregistered component types. */
  renderUnknown?: RenderUnknown;
  /** Override the fallback rendered when a registered component throws. */
  renderError?: RenderError;
}

export function ServerExperienceRenderer({
  experience,
  config,
  initialViewportId,
  metadata,
  debug = false,
  renderUnknown = MissingComponent,
  renderError = ComponentError,
}: ServerExperienceRendererProps): ReactNode {
  if (!experience) return null;

  const activeViewportIndex = getViewportIndex(experience.viewports, initialViewportId);

  // Copy viewports/activeViewport so the context (serialized + frozen by RSC)
  // shares no object identity with the plan arrays the renderers read below —
  // a shared reference makes Flight back-patch into frozen props and throw.
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

  // Render-time diagnostics (unregistered id, a component that threw),
  // collected into a plain array rather than React state: SSR is synchronous
  // top-down, so by the time `<DebugExperience>` renders — after the tree,
  // see the element-order note below — this array is already fully populated.
  const renderDiagnostics: ExperienceDiagnostic[] = [];

  const tree = (
    <NodesRenderer
      nodes={experience.nodes}
      config={config}
      viewports={experience.viewports}
      activeViewportIndex={activeViewportIndex}
      fallbackViewportIndex={experience.fallbackViewportIndex}
      renderUnknown={renderUnknown}
      renderError={renderError}
      onDiagnostic={(diagnostic) => renderDiagnostics.push(diagnostic)}
    />
  );

  // The node tree renders BEFORE `<DebugExperience>` — required, not
  // stylistic. React's render is synchronous top-down; if DebugExperience
  // rendered first (as it used to), it would read `renderDiagnostics` before
  // any descendant had a chance to push into it, and always see it empty.
  return (
    <ExperienceProvider value={renderContext}>
      {tree}
      {debug ? (
        <DebugExperience
          experience={experience}
          errors={[...(experience.diagnostics ?? []), ...renderDiagnostics]}
        />
      ) : null}
    </ExperienceProvider>
  );
}
