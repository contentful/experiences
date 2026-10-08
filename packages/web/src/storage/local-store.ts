import {
  CONSENT_CACHE_KEY,
  type ConsentState,
  EventProfileSchema,
  parseConsentState,
  PROFILE_CACHE_KEY,
  type EventProfile,
} from '@contentful/experiences-runtime';

type SafeParser<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

/**
 * Instance-scoped profile state with best-effort browser persistence.
 *
 * @internal
 */
export default class LocalStore {
  #profile: EventProfile | undefined;
  #profileRevision = 0;
  #consent: ConsentState;

  constructor() {
    // Consent is always persisted so the visitor's choice survives reloads; only
    // the profile is withheld from storage when persistence is denied.
    this.#consent =
      this.getCache(CONSENT_CACHE_KEY, {
        safeParse: (v) => ({ success: true, data: parseConsentState(v) ?? {} }),
      }) ?? {};
    // Undecided persistence neither restores nor clears the stored profile, so a
    // later grant (a consent default or the visitor's choice) can still restore it.
    // Only an explicit denial removes it.
    if (this.#consent.persistence === true) {
      this.#profile = this.getCache(PROFILE_CACHE_KEY, EventProfileSchema);
    }
    if (this.#consent.persistence === false) this.setCache(PROFILE_CACHE_KEY, undefined);
  }

  /** Current consent decisions. */
  get consent(): ConsentState {
    return this.#consent;
  }

  /**
   * Seed startup consent for axes the visitor has not already decided. A stored
   * decision always wins, so a returning visitor's choice is never overwritten.
   * Defaults are not a visitor decision, so they are not written to storage.
   */
  applyConsentDefaults(defaults: ConsentState): void {
    const seed: ConsentState = {};
    if (this.#consent.events === undefined && defaults.events !== undefined) {
      seed.events = defaults.events;
    }
    if (this.#consent.persistence === undefined && defaults.persistence !== undefined) {
      seed.persistence = defaults.persistence;
    }
    if (Object.keys(seed).length === 0) return;

    this.#consent = { ...this.#consent, ...seed };
    if (seed.persistence === true && this.#profile === undefined) {
      this.#profile = this.getCache(PROFILE_CACHE_KEY, EventProfileSchema);
    }
  }

  /** Merge consent decisions, persist them, and drop the stored profile if persistence is denied. */
  updateConsent(next: ConsentState): void {
    this.#consent = { ...this.#consent, ...next };
    this.setCache(CONSENT_CACHE_KEY, this.#consent);
    // The in-memory profile is kept; only its persisted copy follows the decision.
    this.#persistProfile();
  }

  /** Reset local state and persisted caches used by the Web SDK. */
  reset(): void {
    this.profile = undefined;
  }

  /** Revision used to reject profile responses that cross a profile boundary. */
  get profileRevision(): number {
    return this.#profileRevision;
  }

  /** Current profile for this Web runtime. */
  get profile(): EventProfile | undefined {
    return this.#profile;
  }

  /** Update the current profile and its persisted representation. */
  set profile(profile: EventProfile | undefined) {
    this.#profile = profile;
    this.#persistProfile();
    this.#profileRevision += 1;
  }

  /** Writes the profile to storage only with persistence consent; otherwise removes any stored copy. */
  #persistProfile(): void {
    if (this.#consent.persistence === true) {
      this.setCache(PROFILE_CACHE_KEY, this.#profile);
      return;
    }
    this.setCache(PROFILE_CACHE_KEY, undefined);
  }

  /** Update the profile from an id when no newer profile boundary has occurred. */
  updateProfileFromId(profileId: string | undefined, expectedRevision: number): void {
    if (
      profileId === undefined ||
      this.#profileRevision !== expectedRevision ||
      this.#profile?.id === profileId
    ) {
      return;
    }

    this.profile = { id: profileId };
  }

  /** Safely read and parse typed data from LocalStorage. */
  getCache<T>(key: string, parser: SafeParser<T>): T | undefined {
    try {
      if (typeof window === 'undefined') return undefined;
      const cacheString = window.localStorage.getItem(key);
      if (!cacheString) return undefined;

      const parsedCache = parser.safeParse(JSON.parse(cacheString));
      if (parsedCache.success) return parsedCache.data;
    } catch {
      // Invalid and inaccessible cache values are cleared below.
    }

    this.setCache(key, undefined);
    return undefined;
  }

  /** Write data to LocalStorage or remove the key when `undefined`. */
  setCache(key: string, data: unknown): void {
    try {
      if (typeof window === 'undefined') return;
      if (data === undefined) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data));
      }
    } catch {
      // Persistence is best-effort in restricted browser environments.
    }
  }
}
