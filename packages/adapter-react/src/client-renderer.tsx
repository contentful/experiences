/*
 * Client Experience renderer. First paint matches the server renderer; after
 * hydration `useActiveViewport` takes over via `matchMedia`. Server-safe: the
 * hook returns the seeded index and registers no listeners when there's no
 * window, so SSR output matches `<ServerExperienceRenderer>`.
 */

'use client';

import { useCallback, useState, type ReactNode } from 'react';

import type {
  ExperienceContext,
  ExperienceDiagnostic,
  PortableRenderPlan,
  ViewportDef,
} from '@contentful/experiences-sdk-core';

import { ComponentError } from './component-error';
import { DiagnosticReporterContext } from './component-error-boundary';
import { DebugExperience } from './debug-experience';
import { ExperienceProvider } from './context';
import { MissingComponent } from './missing-component';
import { NodesRenderer, type RenderError, type RenderUnknown } from './nodes-renderer';
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
  /** Override the fallback rendered when a registered component throws. */
  renderError?: RenderError;
}

export function ClientExperienceRenderer({
  experience,
  config,
  initialViewportId,
  metadata,
  debug = false,
  renderUnknown = MissingComponent,
  renderError = ComponentError,
}: ClientExperienceRendererProps): ReactNode {
  const [renderDiagnostics, setRenderDiagnostics] = useState<ExperienceDiagnostic[]>([]);
  // A `setState` updater rather than the SSR renderer's plain-array push: this
  // tree stays mounted and interactive, so a component that throws well after
  // first paint (a later re-render, an event handler) must still make
  // `<DebugExperience>` re-render with the new diagnostic — a mutated array
  // wouldn't trigger that.
  const onDiagnostic = useCallback((diagnostic: ExperienceDiagnostic) => {
    setRenderDiagnostics((prev) => [...prev, diagnostic]);
  }, []);

  const { activeViewportIndex } = useActiveViewport(experience?.viewports ?? [], initialViewportId);
  if (!experience) return null;
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
      {/*
        Established here, not in `ServerExperienceRenderer`: this Provider
        (and the closure it carries) never crosses a Server→Client boundary
        because everything from `ClientExperienceRenderer` down is already
        client-rendered. `ComponentErrorBoundary` reads it via `contextType`
        to report a render-time throw without receiving a callback prop —
        see component-error-boundary.tsx for why that specifically matters.
      */}
      <DiagnosticReporterContext.Provider value={onDiagnostic}>
        <NodesRenderer
          nodes={experience.nodes}
          config={config}
          viewports={experience.viewports}
          activeViewportIndex={activeViewportIndex}
          fallbackViewportIndex={experience.fallbackViewportIndex}
          renderUnknown={renderUnknown}
          renderError={renderError}
          onDiagnostic={onDiagnostic}
        />
      </DiagnosticReporterContext.Provider>
      {debug ? (
        <DebugExperience
          experience={experience}
          errors={[...(experience.diagnostics ?? []), ...renderDiagnostics]}
        />
      ) : null}
    </ExperienceProvider>
  );
}
