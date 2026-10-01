import {
  EventProfileSchema,
  PROFILE_CACHE_KEY,
  type EventProfile,
} from '@contentful/experiences-client';

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

  constructor() {
    this.#profile = this.getCache(PROFILE_CACHE_KEY, EventProfileSchema);
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
    this.setCache(PROFILE_CACHE_KEY, profile);
    this.#profileRevision += 1;
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
