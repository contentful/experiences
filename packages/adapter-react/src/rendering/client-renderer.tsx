/*
 * Client Experience renderer. It renders the resolved plan directly, with no
 * browser-only design-property work.
 */

'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import type { ExperienceContext, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { ExperienceBoundary, type ExperienceBoundaryOptions } from './experience-boundary.js';
import { NodeRootBoundaryContext } from '../tracking/bound-node-roots.js';
import type { OnExperienceNodeRoot } from '../tracking/root-binding-types.js';

import { ComponentError } from '../diagnostics/component-error.js';
import { DiagnosticReporterContext } from '../diagnostics/component-error-boundary.js';
import { DebugExperience } from '../diagnostics/debug-experience.js';
import { ExperienceProvider } from './context.js';
import { MissingComponent } from '../diagnostics/missing-component.js';
import { NodesRenderer, type RenderError, type RenderUnknown } from './nodes-renderer.js';
import type { Config, RenderContext } from '../registry/types.js';

const DEFAULT_CONTEXT: ExperienceContext = {
  debug: false,
  metadata: {},
};

export interface ClientExperienceRendererProps extends ExperienceBoundaryOptions {
  experience: PortableRenderPlan | null | undefined;
  config: Config;
  /** Shallow-merges over the plan's `metadata`. Only needed to override it. */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on: renders the visible missing-component box,
   * turns the default `renderUnknown` fallback into the debug component, and
   * auto-mounts `<DebugExperience>` after the tree. Defaults to the plan's `debug`.
   */
  debug?: boolean;
  renderUnknown?: RenderUnknown;
  onNodeRoot?: OnExperienceNodeRoot;
  /** Override the fallback rendered when a registered component throws. */
  renderError?: RenderError;
}

export function ClientExperienceRenderer({
  experience,
  config,
  metadata,
  debug,
  as,
  rootProps,
  clickable,
  trackClicks,
  trackHovers,
  trackViews,
  onNodeRoot,
  renderUnknown = MissingComponent,
  renderError = ComponentError,
}: ClientExperienceRendererProps): ReactNode {
  const boundary = useRef<HTMLElement | null>(null);
  const callerRef = rootProps?.ref;
  const boundaryRef = useMemo(() => {
    let cleanup: (() => void) | undefined;
    let attached = false;
    return (element: HTMLElement | null): void => {
      boundary.current = element;
      if (cleanup) {
        const dispose = cleanup;
        cleanup = undefined;
        dispose();
      } else if (attached && typeof callerRef === 'function') {
        callerRef(null);
      }
      attached = element !== null;
      if (typeof callerRef === 'function' && element !== null) {
        const result = callerRef(element);
        if (typeof result === 'function') cleanup = result;
      } else if (callerRef && typeof callerRef !== 'function') {
        (callerRef as { current: HTMLElement | null }).current = element;
      }
    };
  }, [callerRef]);
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

  if (!experience) return null;
  // `??`, not `||`, so an explicit `debug={false}` overrides a debug-on plan.
  const resolvedDebug = debug ?? experience.debug;
  const renderContext: RenderContext = {
    ...DEFAULT_CONTEXT,
    debug: resolvedDebug,
    metadata: { ...DEFAULT_CONTEXT.metadata, ...experience.metadata, ...(metadata ?? {}) },
  };

  return (
    <ExperienceProvider value={renderContext}>
      <NodeRootBoundaryContext.Provider value={boundary}>
        <ExperienceBoundary
          experience={experience}
          as={as}
          rootProps={{ ...rootProps, ref: boundaryRef }}
        >
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
              renderUnknown={renderUnknown}
              renderError={renderError}
              onDiagnostic={onDiagnostic}
              clickable={clickable}
              trackClicks={trackClicks}
              trackHovers={trackHovers}
              trackViews={trackViews}
              onNodeRoot={onNodeRoot}
            />
          </DiagnosticReporterContext.Provider>
          {resolvedDebug ? (
            <DebugExperience
              experience={experience}
              errors={[...(experience.diagnostics ?? []), ...renderDiagnostics]}
            />
          ) : null}
        </ExperienceBoundary>
      </NodeRootBoundaryContext.Provider>
    </ExperienceProvider>
  );
}
