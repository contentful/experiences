import { CONSENT_CACHE_KEY, type ConsentState } from '@contentful/experiences-runtime';

/** Seeds the visitor's stored consent as a returning visitor would have it. */
export function seedConsent(consent: ConsentState): void {
  window.localStorage.setItem(CONSENT_CACHE_KEY, JSON.stringify(consent));
}
