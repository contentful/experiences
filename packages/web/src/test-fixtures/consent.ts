import {
  CONSENT_CACHE_KEY,
  encodeConsentStorageValue,
  PERSISTENCE_CONSENT_CACHE_KEY,
  type ConsentState,
} from '@contentful/experiences-runtime';

/**
 * Seeds the visitor's stored consent as a returning visitor would have it,
 * written in the encoding the Optimization SDK shares. Pass an empty object to
 * leave both axes undecided.
 */
export function seedConsent(consent: ConsentState): void {
  const events = encodeConsentStorageValue(consent.events);
  const persistence = encodeConsentStorageValue(consent.persistence);
  if (events !== undefined) window.localStorage.setItem(CONSENT_CACHE_KEY, events);
  if (persistence !== undefined) {
    window.localStorage.setItem(PERSISTENCE_CONSENT_CACHE_KEY, persistence);
  }
}
