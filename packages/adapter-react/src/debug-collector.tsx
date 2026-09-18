/*
 * Debug-mode diagnostics collector. Exists so `experience-renderer.tsx` can
 * stay directive-free and still render as a Server Component.
 *
 * It takes the already-rendered tree as `children` because elements cross the
 * RSC boundary while `config` (component references, render fns) does not.
 *
 * Why it must be reactive: `componentDidCatch` fires only client-side, after
 * hydration (see component-error-boundary.tsx), long past the synchronous
 * render pass — only state re-renders the panel with it. It arrives via
 * `DiagnosticReporterContext` because the boundary is a class component and a
 * closure prop cannot cross the boundary. `syncDiagnostics` covers the other
 * direction, for the diagnostics `NodeRenderer` reports during render (it is
 * hook-free, so it cannot use context).
 */

'use client';

import { useCallback, useState, type ReactNode } from 'react';

import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';

import { DiagnosticReporterContext } from './component-error-boundary';
import { DebugExperience } from './debug-experience';

export interface DebugCollectorProps {
  experience: PortableRenderPlan;
  /** Read by reference — see the file comment. */
  syncDiagnostics: Error[];
  /** The already-rendered node tree. */
  children: ReactNode;
}

export function DebugCollector({
  experience,
  syncDiagnostics,
  children,
}: DebugCollectorProps): ReactNode {
  const [renderErrors, setRenderErrors] = useState<Error[]>([]);

  // `queueMicrotask` keeps this safe to call from a render body, rather than
  // depending on where the caller happens to be.
  const onDiagnostic = useCallback((error: Error) => {
    queueMicrotask(() => {
      // Dedup by message: an ancestor re-render re-reports the same diagnostic.
      setRenderErrors((prev) =>
        prev.some((seen) => seen.message === error.message) ? prev : [...prev, error]
      );
    });
  }, []);

  // Passed BY REFERENCE on the first pass, not spread: this body runs before
  // `children` render, so a copy would capture an empty array. By the time a
  // caught error triggers a re-render the tree is fully rendered, so merging is
  // then both correct and needed, to dedup across the two channels.
  const seen = new Set(syncDiagnostics.map((error) => error.message));
  const errors =
    renderErrors.length === 0
      ? syncDiagnostics
      : [...syncDiagnostics, ...renderErrors.filter((error) => !seen.has(error.message))];

  // `children` render BEFORE the panel — required: render is top-down, so a
  // panel rendered first would read `syncDiagnostics` while still empty.
  return (
    <>
      <DiagnosticReporterContext.Provider value={onDiagnostic}>
        {children}
      </DiagnosticReporterContext.Provider>
      <DebugExperience experience={experience} errors={errors} />
    </>
  );
}
