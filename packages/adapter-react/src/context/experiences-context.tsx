'use client';

import { createContext, useContext } from 'react';
import type { WebExperiencesRuntime } from '@contentful/experiences-web';

export interface ExperiencesContextValue {
  readonly sdk: WebExperiencesRuntime;
  readonly error: Error | undefined;
  readonly isLive: boolean;
  /** Activation/state hydration is terminal; this does not assert content or identity success. */
  readonly isContentReady: boolean;
}

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
