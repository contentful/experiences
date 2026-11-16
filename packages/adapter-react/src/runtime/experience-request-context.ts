'use client';

import { createContext, useContext } from 'react';
import type { ManagedExperienceRequestContext } from '../experience/experience-source-controller.js';

/** React route lifetime only; the SDK retains event, identity and transport policy. */
export interface ExperienceRequestContextValue extends ManagedExperienceRequestContext {
  readonly reset: () => void;
}

export const ExperienceRequestContext = createContext<ExperienceRequestContextValue | undefined>(
  undefined
);

export function useExperienceRequestContext(): ExperienceRequestContextValue | undefined {
  return useContext(ExperienceRequestContext);
}
