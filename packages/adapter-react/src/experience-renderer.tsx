/*
 * Hybrid Experience renderer — the one to pick for any route that needs
 * both SSR (for first-paint HTML, SEO, LCP) and client-side interactivity
 * (`enablePreview`, or any other feature exclusive to the client
 * renderer).
 *
 * Behavior in one sentence: on the server, and on the very first client
 * render (before hydration), emits exactly what `ServerExperienceRenderer`
 * would; on every render after hydration, delegates to
 * `ClientExperienceRenderer`. React's `useSyncExternalStore` with a
 * `false` server snapshot gives us the two-phase behavior without a
 * hydration mismatch.
 *
 * The three renderers form a clear split:
 *   - `ServerExperienceRenderer` — RSC-only. No hydration, no state.
 *   - `ClientExperienceRenderer` — client-only. Throws on the server.
 *   - `ExperienceRenderer` (this file) — universal. SSR first paint +
 *     client hydration + `enablePreview` in one component.
 *
 * Customers pick by intent: pure marketing routes take
 * `ServerExperienceRenderer`; preview-capable and interactive routes take
 * `ExperienceRenderer`; advanced client-only setups (tests, native
 * shells) take `ClientExperienceRenderer`.
 */

'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

import {
  ClientExperienceRenderer,
  type ClientExperienceRendererProps,
} from './client-renderer';
import { ServerExperienceRenderer } from './server-renderer';

// Stable references so `useSyncExternalStore` doesn't refire on every
// render. `NOOP_SUBSCRIBE` never invokes its listener; the store's value
// is derived purely from the server-vs-client distinction.
const NOOP_SUBSCRIBE = (): (() => void) => () => {};
const IS_HYDRATED_TRUE = (): boolean => true;
const IS_HYDRATED_FALSE = (): boolean => false;

export type ExperienceRendererProps = ClientExperienceRendererProps;

export function ExperienceRenderer(props: ExperienceRendererProps): ReactNode {
  // Server snapshot returns `false`; first client render before hydration
  // also returns `false` (matches SSR HTML); after hydration flips to
  // `true` and re-renders as the client variant.
  const isHydrated = useSyncExternalStore(
    NOOP_SUBSCRIBE,
    IS_HYDRATED_TRUE,
    IS_HYDRATED_FALSE
  );

  if (!isHydrated) {
    // Server-render and pre-hydration client-render take the same code
    // path — byte-identical HTML on both sides means hydration doesn't
    // warn. Preview-specific props are dropped here on purpose; the
    // server renderer doesn't consume them and the client renderer picks
    // them up on the very next render after hydration.
    return (
      <ServerExperienceRenderer
        experience={props.experience}
        config={props.config}
        initialViewportId={props.initialViewportId}
        context={props.context}
        renderUnknown={props.renderUnknown}
      />
    );
  }

  return <ClientExperienceRenderer {...props} />;
}
