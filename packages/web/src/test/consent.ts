import {
  ANONYMOUS_ID_COOKIE,
  ANONYMOUS_ID_COOKIE_LEGACY,
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

/**
 * Removes the identity cookies. The Web SDK writes them for an identified visitor and
 * leaves them in place on destroy(), as it should, so a test that does not clear them
 * hands its visitor to the next test's constructor to adopt.
 */
export function clearIdentityCookies(): void {
  for (const name of [ANONYMOUS_ID_COOKIE, ANONYMOUS_ID_COOKIE_LEGACY]) {
    document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/`;
  }
}
