'use client';

import { useMemo } from 'react';
import type { WebExperiencesRuntime } from '@contentful/experiences-web';
import { useExperiences } from '../context/experiences-context.js';

/** SDK actions safe to destructure, retaining their original signatures/results. */
export interface UseExperiencesActionsResult {
  readonly setConsent: WebExperiencesRuntime['consent'];
  readonly flushEvents: WebExperiencesRuntime['flush'];
  readonly identifyUser: WebExperiencesRuntime['identify'];
  readonly trackPageView: WebExperiencesRuntime['page'];
  readonly resetUser: WebExperiencesRuntime['reset'];
  readonly trackEvent: WebExperiencesRuntime['track'];
  readonly setLocale: WebExperiencesRuntime['setLocale'];
  readonly trackView: WebExperiencesRuntime['trackView'];
  readonly trackClick: WebExperiencesRuntime['trackClick'];
  readonly trackHover: WebExperiencesRuntime['trackHover'];
  readonly trackFlagView: WebExperiencesRuntime['trackFlagView'];
}

/** Bind the current runtime; actions do not initialize pages or refresh content. */
export function useExperiencesActions(): UseExperiencesActionsResult {
  const sdk = useExperiences();

  return useMemo<UseExperiencesActionsResult>(
    () => ({
      setConsent: (...args) => sdk.consent(...args),
      flushEvents: (...args) => sdk.flush(...args),
      identifyUser: (...args) => sdk.identify(...args),
      trackPageView: (...args) => sdk.page(...args),
      resetUser: (...args) => sdk.reset(...args),
      trackEvent: (...args) => sdk.track(...args),
      setLocale: (...args) => sdk.setLocale(...args),
      trackView: (...args) => sdk.trackView(...args),
      trackClick: (...args) => sdk.trackClick(...args),
      trackHover: (...args) => sdk.trackHover(...args),
      trackFlagView: (...args) => sdk.trackFlagView(...args),
    }),
    [sdk]
  );
}
