'use client';

import { useEffect } from 'react';
import { useRuntimeContext } from '@contentful/experiences-nextjs/client';
import { consentCookies } from '../reference';

// These app cookies let the next server request see the browser's separate
// decisions. The SDK remains the consent and identity-persistence owner.
export function ConsentMirror() {
  const { sdk, isLive } = useRuntimeContext();
  useEffect(() => {
    if (!isLive) return;
    const mirror = (name: string, value: boolean | undefined) => {
      document.cookie = `${name}=${value === undefined ? '' : value ? 'granted' : 'denied'}; Path=/; SameSite=Lax; Max-Age=${value === undefined ? 0 : 31536000}${window.location.protocol === 'https:' ? '; Secure' : ''}`;
    };
    const events = sdk.states.consent.subscribe((value) => mirror(consentCookies.events, value));
    const persistence = sdk.states.persistenceConsent.subscribe((value) =>
      mirror(consentCookies.persistence, value)
    );
    return () => {
      events.unsubscribe();
      persistence.unsubscribe();
    };
  }, [sdk, isLive]);
  return null;
}
