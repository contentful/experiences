'use client';

import { createContext, useContext } from 'react';
import type { ContentfulExperiences, WebExperiencesRuntime } from '@contentful/experiences-web';

interface ExperiencesPresentationState {
  readonly error: Error | undefined;
  /** Activation/state hydration is terminal; this does not assert content or identity success. */
  readonly isContentReady: boolean;
}

export type ExperiencesContextValue = ExperiencesPresentationState &
  (
    | { readonly isLive: true; readonly sdk: ContentfulExperiences }
    | { readonly isLive: false; readonly sdk: WebExperiencesRuntime }
  );

export const ExperiencesContext = createContext<ExperiencesContextValue | null>(null);

export function useExperiencesContext(): ExperiencesContextValue {
  const context = useContext(ExperiencesContext);
  if (!context)
    throw new Error('Experiences hooks require an ExperiencesRoot or ExperiencesProvider.');
  return context;
}

export function useExperiences(): WebExperiencesRuntime {
  return useExperiencesContext().sdk;
}
