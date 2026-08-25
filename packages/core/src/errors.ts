/*
 * Diagnostic types for non-happy-path Experience resolution and rendering.
 * Deliberately plain data, not an `Error` subclass — instances must survive
 * `<DebugExperience>`'s `safeStringify` and cross the RSC/SSR boundary as
 * ordinary JSON.
 *
 * Split by *when* a failure is knowable: resolve-time diagnostics (malformed
 * payload, a failing `resolveData`, an unresolved design token) are collected
 * inside `resolveExperience()` and land on `PortableRenderPlan.diagnostics`.
 * Render-time diagnostics (an unregistered id, a component that throws) are
 * only knowable per-framework, per-render — each adapter collects its own and
 * merges both lists for `<DebugExperience>`.
 */

export interface ExperienceDiagnostic {
  severity: 'warning' | 'error';
  /**
   * Short, stable slug identifying the failure mode (e.g. `'malformed-payload'`,
   * `'component-render-error'`). Free-form rather than a maintained union — a
   * new failure mode shouldn't require touching a central enum every call
   * site has to import and match.
   */
  code: string;
  /** Actionable — names the node/component id and what to fix. */
  message: string;
  /** Whatever identifiers are relevant, e.g. `{ nodeId }` or `{ componentId, slotName }`. */
  context?: Record<string, string>;
}

/** Builds a diagnostic's `context`, dropping any field that's `undefined`. */
export function diagnosticContext(
  fields: Record<string, string | undefined>
): Record<string, string> | undefined {
  const context: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) context[key] = value;
  }
  return Object.keys(context).length ? context : undefined;
}
