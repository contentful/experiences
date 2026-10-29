'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { CoreStates, Observable } from '@contentful/experiences-web';
import { useExperiences } from '../context/experiences-context.js';

function useObservableState<T>(observable: Observable<T>): T {
  // Keep each store's cache separate: an abandoned replacement render must not
  // mutate the snapshot read by the committed subscription.
  const store = useMemo(() => {
    const serverSnapshot = observable.current;
    let snapshot = serverSnapshot;

    return {
      getSnapshot: () => snapshot,
      getServerSnapshot: () => serverSnapshot,
      subscribe: (onStoreChange: () => void) => {
        let active = true;
        const subscription = observable.subscribe((value) => {
          if (!active) return;
          snapshot = value;
          onStoreChange();
        });

        return () => {
          active = false;
          subscription.unsubscribe();
        };
      },
    };
  }, [observable]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

/** Observe SDK state without changing runtime policy or provider readiness. */
export function useExperiencesState<K extends keyof CoreStates>(key: K): CoreStates[K]['current'] {
  const sdk = useExperiences();
  return useObservableState<CoreStates[K]['current']>(sdk.states[key]);
}

export function useProfileState(): CoreStates['profile']['current'] {
  return useExperiencesState('profile');
}

export function useLocaleState(): CoreStates['locale']['current'] {
  return useExperiencesState('locale');
}

export function useConsentState(): CoreStates['consent']['current'] {
  return useExperiencesState('consent');
}

export function usePersistenceConsentState(): CoreStates['persistenceConsent']['current'] {
  return useExperiencesState('persistenceConsent');
}

export function useExperienceRequestState(): CoreStates['experienceRequestState']['current'] {
  return useExperiencesState('experienceRequestState');
}

/** Read the last attempt as state; this does not publish a new event attempt. */
export function useEventStreamState(): CoreStates['eventStream']['current'] {
  return useExperiencesState('eventStream');
}

export function useBlockedEventStreamState(): CoreStates['blockedEventStream']['current'] {
  return useExperiencesState('blockedEventStream');
}

/** Undefined can mean disabled or initializing; preview does not gate readiness. */
export function usePreviewState(): CoreStates['preview']['current'] {
  return useExperiencesState('preview');
}
