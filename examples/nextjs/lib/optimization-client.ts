'use client';

/**
 * Browser-only optimization SDK instance. `ContentfulOptimization`'s
 * constructor attaches `window.contentfulOptimization`, so importing this
 * module inside a server component would throw. The `'use client'` directive
 * here plus the surrounding client component in `components/ClientExperience.tsx`
 * guarantees this only runs after hydration.
 *
 * A module-scope singleton is used so navigations don't spin up a new instance
 * on each render (the SDK's own guard already refuses that anyway).
 */

import ContentfulOptimization from '@contentful/optimization-web';

let instance: ContentfulOptimization | null = null;

export function getOptimizationClient(): ContentfulOptimization {
  if (instance !== null) return instance;
  instance = new ContentfulOptimization({
    clientId: process.env.NEXT_PUBLIC_OPTIMIZATION_CLIENT_ID ?? '',
    environment: process.env.NEXT_PUBLIC_OPTIMIZATION_ENVIRONMENT ?? 'main',
    defaults: {
      // Consent gating is a real concern — set this to `false` (or ask the
      // user) in production. For the spike smoke we opt in so events fire.
      consent: true,
    },
  });
  return instance;
}
