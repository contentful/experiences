/*
 * The Experience renderer, for both server and client.
 *
 * Deliberately hook-free and directive-free, which is what lets it render as a
 * React Server Component. Adding a hook here would force `'use client'` onto
 * the whole tree. Client-only hooks live behind the directive in their own
 * modules; a customer component calling one becomes a Client Component while
 * this stays a Server Component.
 */

import type { ReactNode } from 'react';

import type { ExperienceContext, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { ComponentError } from './component-error';
import { DebugCollector } from './debug-collector';
import { ExperienceProvider } from './context';
import { MissingComponent } from './missing-component';
import { NodesRenderer, type RenderError, type RenderUnknown } from './nodes-renderer';
import type { Config, RenderContext } from './types';

const DEFAULT_CONTEXT: ExperienceContext = {
  debug: false,
  metadata: {},
};

export interface ExperienceRendererProps {
  experience: PortableRenderPlan | null | undefined;
  config: Config;
  /** Shallow-merges over the plan's `metadata`. Only needed to override it. */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on: renders the visible missing-component box,
   * turns the default `renderUnknown` fallback into the debug component, and
   * auto-mounts `<DebugExperience>` (the resolved-plan JSON panel) after the
   * tree. Defaults to the plan's `debug`.
   */
  debug?: boolean;
  /** Override the fallback rendered for unregistered component types. */
  renderUnknown?: RenderUnknown;
  /** Override the fallback rendered when a registered component throws. */
  renderError?: RenderError;
}

export function ExperienceRenderer({
  experience,
  config,
  metadata,
  debug,
  renderUnknown = MissingComponent,
  renderError = ComponentError,
}: ExperienceRendererProps): ReactNode {
  if (!experience) return null;

  // `??`, not `||`, so an explicit `debug={false}` overrides a debug-on plan.
  const resolvedDebug = debug ?? experience.debug;

  const renderContext: RenderContext = {
    ...DEFAULT_CONTEXT,
    debug: resolvedDebug,
    metadata: { ...DEFAULT_CONTEXT.metadata, ...experience.metadata, ...(metadata ?? {}) },
  };

  // A plain array, not state: `NodeRenderer` reports synchronously from its own
  // render body, and render is top-down, so this is fully populated by the time
  // the panel below reads it. (`component-render-error` is the exception —
  // `componentDidCatch` fires only client-side; `DebugCollector` catches it.)
  //
  // Seeded rather than spread in later: the panel reads this by reference, so a
  // copy would be built before React renders `tree` and can push into it.
  const renderDiagnostics: Error[] = [...(experience.diagnostics ?? [])];
  const seenDiagnostics = new Set(renderDiagnostics.map((error) => error.message));
  const onDiagnostic = (error: Error): void => {
    if (seenDiagnostics.has(error.message)) return;
    seenDiagnostics.add(error.message);
    renderDiagnostics.push(error);
  };

  const tree = (
    <NodesRenderer
      nodes={experience.nodes}
      config={config}
      renderUnknown={renderUnknown}
      renderError={renderError}
      onDiagnostic={onDiagnostic}
    />
  );

  // Debug off — every production render — mounts nothing client-side.
  if (!resolvedDebug) {
    return <ExperienceProvider value={renderContext}>{tree}</ExperienceProvider>;
  }

  // The tree is rendered here and passed as `children`: elements cross the RSC
  // boundary, `config` does not. That also keeps the tree rendering before the
  // panel, which is required — see debug-collector.tsx.
  return (
    <ExperienceProvider value={renderContext}>
      <DebugCollector experience={experience} syncDiagnostics={renderDiagnostics}>
        {tree}
      </DebugCollector>
    </ExperienceProvider>
  );
}
