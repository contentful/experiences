import { ANONYMOUS_ID_COOKIE, ANONYMOUS_ID_COOKIE_LEGACY } from '@contentful/experiences-runtime';

import { getCookie, removeCookie, setCookie, type CookieAttributes } from './lib/cookies.js';
import type LocalStore from './storage/local-store.js';

/** Days the identity cookie lasts unless configured otherwise. Matches the Optimization SDK. */
export const DEFAULT_COOKIE_EXPIRATION_DAYS = 365;

/** What the identity cookie is written with, and the scope it is deleted in. */
export type IdentityCookieOptions = CookieAttributes;

/** The id found in the browser's cookies and whether it disagrees with the profile held. */
export interface AdoptedIdentity {
  id: string;
  /** True when the profile held in memory has a different id (or there is none). */
  differsFromProfile: boolean;
}

/**
 * The identity cookie and the stored anonymous id behind it: the pair that lets a
 * server recognise a visitor the browser SDK has already identified.
 *
 * It follows the Optimization SDK's lifecycle so both SDKs read and write the same
 * cookie in the same scope. This class decides what the identity is and where it
 * is written; whether writing is permitted is the caller's decision, so it never
 * reads consent itself.
 *
 * @internal
 */
export class IdentityCookie {
  readonly #store: LocalStore;
  readonly #attributes: CookieAttributes;

  constructor(store: LocalStore, options: IdentityCookieOptions = {}) {
    this.#store = store;
    // Writing and deleting share these attributes, so a cookie is removed in the scope
    // it was set in.
    this.#attributes = { ...options, expires: options.expires ?? DEFAULT_COOKIE_EXPIRATION_DAYS };
  }

  /**
   * The identity to keep. A complete profile wins, then an identity adopted from a
   * handoff before any profile exists, then the id already stored. Falling back lets a
   * known visitor keep their continuity while the profile is momentarily absent.
   */
  resolve({
    profileId,
    handoffId,
  }: {
    profileId: string | undefined;
    handoffId: string | undefined;
  }): string | undefined {
    return profileId ?? handoffId ?? this.#store.anonymousId;
  }

  /** Writes the identity to the cookie and the stored id, or clears both when there is none. */
  persist(id: string | undefined): void {
    if (!id) {
      removeCookie(ANONYMOUS_ID_COOKIE, this.#attributes);
      this.#store.clearAnonymousId();
      return;
    }
    setCookie(ANONYMOUS_ID_COOKIE, id, this.#attributes);
    this.#store.anonymousId = id;
  }

  /** Removes both cookies and the stored id. */
  clear(): void {
    removeCookie(ANONYMOUS_ID_COOKIE, this.#attributes);
    removeCookie(ANONYMOUS_ID_COOKIE_LEGACY, this.#attributes);
    this.#store.clearAnonymousId();
  }

  /**
   * Adopts the identity the browser already holds, such as one a server wrote.
   *
   * The legacy cookie is read ahead of the current one, as in the Optimization SDK, and
   * is removed once read, which migrates it to the current cookie. Nothing is written
   * when the cookie already matches the stored id, so starting the SDK does not push the
   * cookie's expiry out. Returns nothing when no cookie is present.
   *
   * `differsFromProfile` is only set when the cookie is a different identity from the
   * stored one and from the profile held. That is the case where the profile in memory
   * belongs to someone else and should be reset.
   */
  adopt({
    currentProfileId,
  }: {
    currentProfileId: string | undefined;
  }): AdoptedIdentity | undefined {
    const legacy = getCookie(ANONYMOUS_ID_COOKIE_LEGACY);
    const id = legacy ?? getCookie(ANONYMOUS_ID_COOKIE);
    if (legacy) removeCookie(ANONYMOUS_ID_COOKIE_LEGACY, this.#attributes);
    if (!id) return undefined;

    const storedId = this.#store.anonymousId;
    const changed = id !== storedId;
    // A legacy cookie is migrated even when it matches, because the current cookie must exist.
    if (changed || legacy) this.persist(id);
    return { id, differsFromProfile: changed && id !== currentProfileId };
  }
}
