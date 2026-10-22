import {
  ANONYMOUS_ID_KEY,
  ANONYMOUS_ID_KEY_LEGACY,
  CONSENT_CACHE_KEY,
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

/** Read a stored string without requiring an accessible browser storage API. */
function readRaw(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Best-effort browser persistence shared with the Optimization SDK. @internal */
const LocalStore = {
  /** Reset persisted profile continuity while keeping consent decisions. */
  reset(): void {
    LocalStore.clearProfileContinuity();
  },

  /** Remove the profile and both anonymous id keys. */
  clearProfileContinuity(): void {
    LocalStore.setCache(PROFILE_CACHE_KEY, undefined);
    LocalStore.setCache(ANONYMOUS_ID_KEY, undefined);
    LocalStore.setCache(ANONYMOUS_ID_KEY_LEGACY, undefined);
  },

  /**
   * The anonymous id shared with the Optimization SDK. Reading returns a legacy
   * value ahead of the current key and removes it, so callers should read once.
   */
  get anonymousId(): string | undefined {
    const legacy = readRaw(ANONYMOUS_ID_KEY_LEGACY);
    if (legacy) LocalStore.setCache(ANONYMOUS_ID_KEY_LEGACY, undefined);
    return legacy ?? readRaw(ANONYMOUS_ID_KEY) ?? undefined;
  },

  set anonymousId(id: string | undefined) {
    LocalStore.setCache(ANONYMOUS_ID_KEY, id);
  },

  get consent(): boolean | undefined {
    return decodeConsentStorageValue(readRaw(CONSENT_CACHE_KEY));
  },

  set consent(consent: boolean | undefined) {
    LocalStore.setCache(CONSENT_CACHE_KEY, encodeConsentStorageValue(consent));
  },

  get persistenceConsent(): boolean | undefined {
    return resolvePersistedPersistenceConsent(
      decodeConsentStorageValue(readRaw(PERSISTENCE_CONSENT_CACHE_KEY)),
      LocalStore.consent
    );
  },

  set persistenceConsent(consent: boolean | undefined) {
    LocalStore.setCache(PERSISTENCE_CONSENT_CACHE_KEY, encodeConsentStorageValue(consent));
  },

  /** Read the stored profile; the owner resolves consent before accessing it. */
  get profile(): EventProfile | undefined {
    return LocalStore.getCache(PROFILE_CACHE_KEY, EventProfileSchema);
  },

  set profile(profile: EventProfile | undefined) {
    LocalStore.setCache(PROFILE_CACHE_KEY, profile);
  },

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

    LocalStore.setCache(key, undefined);
    return undefined;
  },

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
  },
};

export default LocalStore;
