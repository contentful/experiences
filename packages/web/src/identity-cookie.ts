import { ANONYMOUS_ID_COOKIE, ANONYMOUS_ID_COOKIE_LEGACY } from '@contentful/experiences-runtime';

import { getCookie, removeCookie, setCookie, type CookieAttributes } from './lib/cookies.js';
import type LocalStore from './storage/local-store.js';

/** Days the identity cookie lasts unless configured otherwise. Matches the Optimization SDK. */
export const DEFAULT_COOKIE_EXPIRATION_DAYS = 365;

/** What the identity cookie is written with, and the scope it is deleted in. */
export type IdentityCookieOptions = CookieAttributes;

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
   * Adopts the identity the browser already holds, such as one a server wrote, in the
   * Optimization SDK's order: compare, reset if needed, then persist once.
   *
   * The legacy cookie is read ahead of the current one and removed once read, which
   * migrates it. A cookie that differs from the stored id replaces it; if it is also a
   * different visitor than the profile held, `reset` runs first, because that profile is
   * not theirs. Persisting comes after the reset, so the identity is never written only to
   * be cleared and written again. A legacy cookie that matches the stored id is still
   * written, because the current cookie must exist. Nothing is written when the cookie
   * already matches, so starting the SDK does not push its expiry out.
   *
   * Returns the adopted id, or nothing when no cookie is present.
   */
  adopt({
    currentProfileId,
    reset,
  }: {
    currentProfileId: string | undefined;
    reset: () => void;
  }): string | undefined {
    const legacy = getCookie(ANONYMOUS_ID_COOKIE_LEGACY);
    const id = legacy ?? getCookie(ANONYMOUS_ID_COOKIE);
    if (legacy) removeCookie(ANONYMOUS_ID_COOKIE_LEGACY, this.#attributes);
    if (!id) return undefined;

    if (id !== this.#store.anonymousId) {
      if (id !== currentProfileId) reset();
      this.persist(id);
    } else if (legacy) {
      this.persist(id);
    }
    return id;
  }
}
