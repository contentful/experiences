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
  /**
   * Viewport to render for, typically derived from the request's User-Agent.
   * Defaults to the viewport the plan was pre-resolved against.
   */
  initialViewportId?: string;
  /** Shallow-merges over the plan's `metadata`. Only needed to override it. */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on: renders the visible missing-component box,
   * turns the default `renderUnknown` fallback into the debug component, and
   * auto-mounts `<DebugExperience>` after the tree. Defaults to the plan's `debug`.
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
  debug,
  renderUnknown = MissingComponent,
  renderError = ComponentError,
}: ClientExperienceRendererProps): ReactNode {
  const [renderDiagnostics, setRenderDiagnostics] = useState<Error[]>([]);
  // A `setState` updater rather than the SSR renderer's plain-array push: this
  // tree stays mounted and interactive, so a component that throws well after
  // first paint (a later re-render, an event handler) must still make
  // `<DebugExperience>` re-render with the new diagnostic — a mutated array
  // wouldn't trigger that.
  //
  // `queueMicrotask` defers the actual `setState` call: most of these
  // diagnostics (component-not-registered, malformed-slot,
  // experience-template-not-registered) are reported synchronously from
  // *inside* NodeRenderer's own render body, i.e. while React is mid-render
  // of a descendant — calling this component's setState right there is
  // exactly React's "Cannot update a component while rendering a different
  // component" anti-pattern. Escaping to a microtask (same "break the
  // synchronous call chain" rationale as core's resolveData deferral)
  // schedules the update for after the current render/commit fully unwinds.
  // `component-render-error`, reported from `componentDidCatch`, is already
  // commit-phase-safe — deferring it too is harmless and keeps one code path.
  // This is client-only (NodeRenderer's own onDiagnostic call is unchanged
  // and stays synchronous — see nodes-renderer.tsx for why SSR needs that):
  // `ServerExperienceRenderer` threads a plain synchronous array-push
  // closure instead of this setState-backed one, so SSR is unaffected.
  const onDiagnostic = useCallback((error: Error) => {
    queueMicrotask(() => {
      // Dedup by message, the guard `NodeRenderer` used to hold in a `useRef`.
      // It lives here so that module stays hook-free and therefore usable from
      // a React Server Component. Returning `prev` unchanged also skips a
      // pointless re-render, which matters more here than on the server: every
      // ancestor re-render re-reports the same diagnostic.
      setRenderDiagnostics((prev) =>
        prev.some((seen) => seen.message === error.message) ? prev : [...prev, error]
      );
    });
  }, []);

  // Seed from the plan so first paint matches the server renderer. Computed
  // before the `experience` guard because the hook below cannot be called
  // conditionally.
  const seedViewportId =
    initialViewportId ??
    (experience ? experience.viewports[experience.fallbackViewportIndex]?.id : undefined);
  const { activeViewportIndex } = useActiveViewport(experience?.viewports ?? [], seedViewportId);
  if (!experience) return null;
  // `??`, not `||`, so an explicit `debug={false}` overrides a debug-on plan.
  const resolvedDebug = debug ?? experience.debug;
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
      {resolvedDebug ? (
        <DebugExperience
          experience={experience}
          errors={[...(experience.diagnostics ?? []), ...renderDiagnostics]}
        />
      ) : null}
    </ExperienceProvider>
  );
}
