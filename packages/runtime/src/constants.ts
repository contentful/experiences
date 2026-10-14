/**
 * Cookie name used to carry an anonymous/profile id between browser and server
 * runtimes. The value matches the Contentful Optimization SDK.
 *
 * @public
 */
export const ANONYMOUS_ID_COOKIE = 'ctfl-opt-aid';

/** @internal LocalStorage key for the persisted profile. */
export const PROFILE_CACHE_KEY = '__ctfl_opt_profile__';

/**
 * Legacy cookie name that older SDKs used for the anonymous id. It is read and
 * migrated to {@link ANONYMOUS_ID_COOKIE}, never written. The value matches the
 * Contentful Optimization SDK.
 *
 * @public
 */
export const ANONYMOUS_ID_COOKIE_LEGACY = 'ntaid';

/** @internal LocalStorage key for the persisted anonymous id. Shared with the Optimization SDK. */
export const ANONYMOUS_ID_KEY = '__ctfl_opt_anonymous_id__';

/**
 * @internal Legacy LocalStorage key for the anonymous id. It is read ahead of the
 * current key and removed when read, as in the Optimization SDK.
 */
export const ANONYMOUS_ID_KEY_LEGACY = '__nt_anonymous_id__';
