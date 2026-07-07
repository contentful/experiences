import type { getExperiencesAdapter as GetExperiencesAdapter } from '@contentful/optimization-react-web/experiences-adapter';

/**
 * Optional-peer entry point. The peer package `@contentful/optimization-react-web`
 * is declared as an optional peer dependency (see `package.json`) — when a
 * consumer installs it, resolution succeeds and `adapterFactory` is populated
 * with `getExperiencesAdapter`. When the peer is absent, the import throws at
 * module evaluation, we swallow it here, and `adapterFactory` stays `null` so
 * the renderer's `optimization` prop degrades to a no-op.
 *
 * The import is a top-level `await import(...)` (not a `require`) so both
 * `ClientExperienceRenderer` and `ServerExperienceRenderer` observe the same
 * resolved value synchronously by first render. Bundlers treat this as a
 * peer-optional static target, keeping SSR one-pass.
 */
let adapterFactory: typeof GetExperiencesAdapter | null = null;
try {
  adapterFactory = (await import('@contentful/optimization-react-web/experiences-adapter'))
    .getExperiencesAdapter;
} catch {
  // Peer not installed — instrumentation stays disabled at runtime.
}

export { adapterFactory };
