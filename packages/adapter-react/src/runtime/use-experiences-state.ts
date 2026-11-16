'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { States, Observable } from '@contentful/experiences-web';
import { useExperiences } from './experiences-context.js';

export function useObservableState<T>(observable: Observable<T> | undefined): T | undefined {
  // Keep each store's cache separate: an abandoned replacement render must not
  // mutate the snapshot read by the committed subscription.
  const store = useMemo(() => {
    const serverSnapshot = observable?.current;
    let snapshot = serverSnapshot;

    return {
      getSnapshot: () => snapshot,
      getServerSnapshot: () => serverSnapshot,
      subscribe: (onStoreChange: () => void) => {
        let active = true;
        const subscription = observable?.subscribe((value) => {
          if (!active) return;
          snapshot = value;
          onStoreChange();
        });

        return () => {
          active = false;
          subscription?.unsubscribe();
        };
      },
    };
  }, [observable]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

/** Observe SDK state without changing runtime policy or provider readiness. */
export function useExperiencesState<K extends Exclude<keyof States, 'flag'>>(
  key: K
): States[K]['current'] {
  const sdk = useExperiences();
  return useObservableState<States[K]['current']>(sdk.states[key]);
}

export function useProfileState(): States['profile']['current'] {
  return useExperiencesState('profile');
}

export function useLocaleState(): States['locale']['current'] {
  return useExperiencesState('locale');
}

export function useConsentState(): States['consent']['current'] {
  return useExperiencesState('consent');
}

export function usePersistenceConsentState(): States['persistenceConsent']['current'] {
  return useExperiencesState('persistenceConsent');
}

export function usePersonalizationRequestState(): States['personalizationRequestState']['current'] {
  return useExperiencesState('personalizationRequestState');
}

/** Read the last attempt as state; this does not publish a new event attempt. */
export function useEventStreamState(): States['eventStream']['current'] {
  return useExperiencesState('eventStream');
}

export function useBlockedEventStreamState(): States['blockedEventStream']['current'] {
  return useExperiencesState('blockedEventStream');
}

/** Undefined can mean disabled or initializing; preview does not gate readiness. */
export function usePreviewState(): States['preview']['current'] {
  return useExperiencesState('preview');
}
