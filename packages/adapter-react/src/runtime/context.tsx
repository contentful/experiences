'use client';

import { createContext, useContext } from 'react';
import type { ContentfulExperiences, WebExperiencesRuntime } from '@contentful/experiences-web';

interface PresentationState {
  readonly error: Error | undefined;
  /** Activation/state hydration is terminal; this does not assert content or identity success. */
  readonly isContentReady: boolean;
}

export type RuntimeContextValue = PresentationState &
  (
    | { readonly isLive: true; readonly sdk: ContentfulExperiences }
    | { readonly isLive: false; readonly sdk: WebExperiencesRuntime }
  );

export const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function useRuntimeContext(): RuntimeContextValue {
  const context = useContext(RuntimeContext);
  if (!context)
    throw new Error('Experiences hooks require an ExperiencesRoot or ExperiencesProvider.');
  return context;
}

export function useExperiences(): WebExperiencesRuntime {
  return useRuntimeContext().sdk;
}
