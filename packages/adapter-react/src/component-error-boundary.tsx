/*
 * Split into its own file, `'use client'`-marked, because it's a class
 * component: Next.js's RSC bundler statically rejects a class component
 * import from a file with no directive ("You're importing a class component.
 * It only works in a Client Component..."), even though the class itself
 * renders fine under every SSR path this SDK supports. `nodes-renderer.tsx`
 * stays directive-free so it can still be imported from `server-renderer.tsx`
 * (a genuine Server Component); Server Components importing Client
 * Components is the normal RSC pattern, so this split costs nothing.
 *
 * Reporting goes through `DiagnosticReporterContext`, not a prop, for a
 * second RSC reason beyond the class-component one above: `NodeRenderer`
 * runs as part of the SERVER render when reached from
 * `ServerExperienceRenderer` (a real Server Component with no directive), and
 * React refuses to serialize a plain closure passed as a Client Component
 * prop from there ("Event handlers cannot be passed to Client Component
 * props"). Only `ClientExperienceRenderer` establishes this context (with a
 * `Provider` element that, being entirely within its own already-client-
 * rendered tree, never crosses that boundary); `context` reads `null` under
 * `ServerExperienceRenderer`, which is fine because `componentDidCatch` never
 * runs there anyway (see the class doc comment).
 */
'use client';

import { Component, Suspense, createContext, type ReactNode } from 'react';

export const DiagnosticReporterContext = createContext<((error: Error) => void) | null>(null);

interface ComponentErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  /** Plain, serializable identity — never a callback; see the file doc comment. */
  componentId: string;
  kind: string;
  nodeId?: string;
}

interface ComponentErrorBoundaryState {
  hasError: boolean;
}

/**
 * Per-node isolation for a customer component that throws during render. A
 * class component is the only mechanism React offers for this — there is no
 * hook equivalent.
 *
 * `getDerivedStateFromError`/`componentDidCatch` do NOT catch at all during
 * React's SSR — neither the legacy `renderToString`/`renderToStaticMarkup`
 * NOR the modern streaming `renderToPipeableStream`/`renderToReadableStream`
 * (the one Next.js's App Router actually uses) run the class-error-boundary
 * machinery server-side. What the modern streaming renderer DOES support is
 * Suspense-based recovery: if a `<Suspense>` boundary's content throws during
 * the server walk, Fizz emits that Suspense's `fallback` as the initial HTML
 * and defers real rendering of that subtree to the client after hydration —
 * "switch to client rendering" in React's own error message. Wrapping
 * `children` in an internal `<Suspense fallback={fallback}>` (same fallback
 * either way) is what makes this component degrade gracefully server-side:
 * Fizz isolates the failing node without our own `hasError` branch ever
 * running server-side. Once the client hydrates and re-executes that
 * Suspense boundary's content, if the throw repeats, the client fiber
 * reconciler *does* run `getDerivedStateFromError` and re-renders with
 * `hasError: true` — siblings render normally because Fizz isolates
 * per-Suspense-boundary.
 *
 * Net effect: the diagnostic fires only client-side — after hydration for an
 * SSR-rendered page, or immediately for a client-only render.
 * `ServerExperienceRenderer`'s own SSR-time diagnostics list can therefore
 * never contain a `component-render-error` entry; only
 * `ClientExperienceRenderer`'s reactive collector can, which is exactly why
 * that collector is `useState`-based rather than a plain array. See the
 * README's error-handling section.
 *
 * The legacy synchronous `renderToString`/`renderToStaticMarkup` APIs also
 * honor the Suspense `fallback` for a thrown Error, not just a thrown
 * thenable — so a customer calling those directly still gets the graceful
 * fallback and sibling isolation. The difference from the streaming renderer
 * is that legacy output carries no hydration data and gets no client-side
 * retry: the fallback markup is permanent, and — same as above — no
 * diagnostic is ever recorded for that render, since our `hasError` branch
 * still never runs server-side.
 */
export class ComponentErrorBoundary extends Component<
  ComponentErrorBoundaryProps,
  ComponentErrorBoundaryState
> {
  static override contextType = DiagnosticReporterContext;
  declare context: React.ContextType<typeof DiagnosticReporterContext>;

  override state: ComponentErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ComponentErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown): void {
    const { componentId, kind, nodeId } = this.props;
    const reason = error instanceof Error ? error.message : String(error);
    const message =
      `Component "${componentId}" (${kind}${nodeId ? `, node "${nodeId}"` : ''}) threw ` +
      `while rendering: ${reason}. Rendering the error fallback instead of crashing the ` +
      `surrounding tree.`;
    if (typeof console !== 'undefined') {
      console.warn(`[@contentful/experiences-react] ${message}`);
    }
    this.context?.(new Error(message, { cause: error instanceof Error ? error : undefined }));
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>;
  }
}
