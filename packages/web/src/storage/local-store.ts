import {
  ANONYMOUS_ID_KEY,
  ANONYMOUS_ID_KEY_LEGACY,
  CONSENT_CACHE_KEY,
  type ConsentState,
  decodeConsentStorageValue,
  encodeConsentStorageValue,
  EventProfileSchema,
  PERSISTENCE_CONSENT_CACHE_KEY,
  PROFILE_CACHE_KEY,
  resolvePersistedPersistenceConsent,
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
    // the profile is withheld from storage when persistence is denied. It uses the
    // Optimization SDK's keys and encoding, so both SDKs read each other's choice.
    this.#consent = this.#readConsent();
    // The profile is not loaded here. Configured defaults can override the stored decision,
    // so the effective consent is resolved first and `applyConsentDefaults` then loads or
    // removes the profile once, as the Optimization SDK does.
  }

  /**
   * The anonymous id kept for client-server continuity, shared with the Optimization SDK.
   *
   * Reading has a side effect, as in that SDK: a value under the legacy key is returned
   * ahead of the current key and removed, which migrates it on first read. Read it once
   * and hold on to the result.
   */
  get anonymousId(): string | undefined {
    const legacy = this.#readRaw(ANONYMOUS_ID_KEY_LEGACY);
    if (legacy) this.setCache(ANONYMOUS_ID_KEY_LEGACY, undefined);
    return legacy ?? this.#readRaw(ANONYMOUS_ID_KEY) ?? undefined;
  }

  set anonymousId(id: string | undefined) {
    this.setCache(ANONYMOUS_ID_KEY, id);
  }

  /**
   * Removes the stored anonymous id under both the current and the legacy key, as the
   * Optimization SDK's `clearProfileContinuity()` does. Clearing only the current key
   * would let a legacy value be read back, and written as the identity, after a later grant.
   */
  clearAnonymousId(): void {
    this.setCache(ANONYMOUS_ID_KEY, undefined);
    this.setCache(ANONYMOUS_ID_KEY_LEGACY, undefined);
  }

  /** Current consent decisions. */
  get consent(): ConsentState {
    return this.#consent;
  }

  /**
   * Resolve startup consent, then bring storage in line with it, as the Optimization
   * SDK does. Configured values take precedence over stored ones, and
   * `defaults.events` is also the default for persistence when no persistence default
   * is given. Unset axes keep their stored value.
   *
   * The effective decisions are written to the shared consent keys, so they are what
   * a later load, with or without the default, starts from. When persistence is
   * denied the stored profile is removed; when it is granted the profile is restored.
   * Nothing is read from storage before this runs.
   * A visitor who has not decided, with no defaults, writes nothing.
   */
  applyConsentDefaults(defaults: ConsentState): void {
    const events = defaults.events ?? this.#consent.events;
    const persistence = defaults.persistence ?? defaults.events ?? this.#consent.persistence;
    const next: ConsentState = {};
    if (events !== undefined) next.events = events;
    if (persistence !== undefined) next.persistence = persistence;
    this.#consent = next;
    this.#writeConsent();

    // Only an explicit denial removes the stored copy; an undecided visitor keeps it, so a
    // later grant can still restore it.
    if (persistence === true) {
      this.#profile = this.getCache(PROFILE_CACHE_KEY, EventProfileSchema);
      return;
    }
    this.#profile = undefined;
    if (persistence === false) this.setCache(PROFILE_CACHE_KEY, undefined);
  }

  /** Merge consent decisions, persist them, and drop the stored profile if persistence is denied. */
  updateConsent(next: ConsentState): void {
    this.#consent = { ...this.#consent, ...next };
    this.#writeConsent();
    // The in-memory profile is kept; only its persisted copy follows the decision.
    this.#persistProfile();
  }

  /** Reset local state and persisted caches used by the Web SDK. */
  reset(): void {
    this.profile = undefined;
  }

  /**
   * Makes responses that are still in flight stale without changing the profile or
   * its stored copy, so a late response cannot replace the live profile.
   */
  invalidateInFlight(): void {
    this.#profileRevision += 1;
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

  /** Reads both consent keys, treating anything unrecognized as undecided and leaving it untouched. */
  #readConsent(): ConsentState {
    const events = decodeConsentStorageValue(this.#readRaw(CONSENT_CACHE_KEY));
    const persistence = resolvePersistedPersistenceConsent(
      decodeConsentStorageValue(this.#readRaw(PERSISTENCE_CONSENT_CACHE_KEY)),
      events
    );
    const state: ConsentState = {};
    if (events !== undefined) state.events = events;
    if (persistence !== undefined) state.persistence = persistence;
    return state;
  }

  #writeConsent(): void {
    this.setCache(CONSENT_CACHE_KEY, encodeConsentStorageValue(this.#consent.events));
    this.setCache(
      PERSISTENCE_CONSENT_CACHE_KEY,
      encodeConsentStorageValue(this.#consent.persistence)
    );
  }

  /** Reads a stored string as-is. Consent values are plain strings, not JSON. */
  #readRaw(key: string): string | null {
    try {
      if (typeof window === 'undefined') return null;
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
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
