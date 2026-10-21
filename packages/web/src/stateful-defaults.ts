import type { EventProfile } from '@contentful/experiences-runtime';

/**
 * Stateful defaults accepted by the Web SDK runtime.
 *
 * @public
 */
export interface StatefulDefaults {
  /** Event consent default. */
  consent?: boolean;
  /** Profile-continuity persistence consent default. */
  persistenceConsent?: boolean;
  /** Default active profile used for personalization and analytics. */
  profile?: EventProfile;
}

export type PersistedDefaultLoader<T> = () => T | undefined;
export type PersistedDefaultValue<T> = T | PersistedDefaultLoader<T> | undefined;

/**
 * Persisted values supplied by a platform store.
 *
 * @public
 */
export interface PersistedStatefulDefaults {
  /** Persisted event consent. */
  consent?: boolean;
  /** Persisted profile-continuity persistence consent. */
  persistenceConsent?: boolean;
  /** Persisted active profile, read only when persistence consent permits it. */
  profile?: PersistedDefaultValue<EventProfile>;
}

/**
 * Resolved stateful defaults and the profile-continuity loading decision used
 * to produce them.
 *
 * @public
 */
export interface ResolvedStatefulDefaults {
  /** Defaults to pass to the stateful Web runtime. */
  defaults: StatefulDefaults;
  /** Whether platform storage may load profile-continuity values. */
  canLoadPersistedContinuity: boolean;
}

const resolveContinuityDefault = <T extends object>(
  configuredValue: T | undefined,
  persistedValue: PersistedDefaultValue<T>,
  canLoadPersistedContinuity: boolean
): T | undefined => {
  if (configuredValue !== undefined || !canLoadPersistedContinuity) return configuredValue;
  if (typeof persistedValue === 'function') return persistedValue();

  return persistedValue;
};

/**
 * Resolve stateful defaults from explicit configuration plus platform-persisted values.
 *
 * @param configured - Caller-provided defaults from SDK configuration.
 * @param persisted - Values already loaded or lazily readable from platform storage.
 * @returns The defaults Web should receive and whether durable continuity may be loaded.
 *
 * @public
 */
export function resolveStatefulDefaults(
  configured?: StatefulDefaults,
  persisted: PersistedStatefulDefaults = {}
): ResolvedStatefulDefaults {
  const defaults = configured ?? {};
  const consent = defaults.consent ?? persisted.consent;
  const persistenceConsent =
    defaults.persistenceConsent ?? defaults.consent ?? persisted.persistenceConsent;
  const canLoadPersistedContinuity = persistenceConsent === true;

  return {
    canLoadPersistedContinuity,
    defaults: {
      consent,
      persistenceConsent,
      profile: resolveContinuityDefault(
        defaults.profile,
        persisted.profile,
        canLoadPersistedContinuity
      ),
    },
  };
}
