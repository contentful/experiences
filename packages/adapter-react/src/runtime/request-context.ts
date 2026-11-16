'use client';

import { createContext, useContext } from 'react';
import type { ManagedExperienceRequestContext } from '../experience/source-controller.js';

/** React route lifetime only; the SDK retains event, identity and transport policy. */
export interface RequestContextValue extends ManagedExperienceRequestContext {
  readonly reset: () => void;
}

export const RequestContext = createContext<RequestContextValue | undefined>(undefined);

export function useRequestContext(): RequestContextValue | undefined {
  return useContext(RequestContext);
}
