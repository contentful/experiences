import type {
  AllowedEventType,
  BlockedEvent,
  Config as BaseConfig,
  EventBuilderConfig,
  PageViewBuilderArgs,
  QueuePolicy,
} from '@contentful/experiences-runtime';
import type {
  AutoTrackEntryInteractionOptions,
  EntryInteractionApi,
} from '../tracking/interaction-tracking.js';
import type { StatefulDefaults } from '../browser/stateful-defaults.js';
import type { IdentityCookieOptions } from '../browser/identity-cookie.js';

/** Optional browser context providers, useful for application-specific redaction. */
export type EventContextProviders = Pick<EventBuilderConfig, 'getPageProperties' | 'getUserAgent'>;

/** Initial values for the stateful Web runtime. */
export type ConfigDefaults = StatefulDefaults;

/**
 * Long-lived, browser-oriented SDK configuration.
 */
export type Config = Omit<BaseConfig, 'eventBuilder' | 'locale'> & {
  /** Automatic interaction defaults; each omitted flag defaults to true. */
  autoTrackEntryInteraction?: AutoTrackEntryInteractionOptions;
  locale?: string;
  app?: EventBuilderConfig['app'];
  browserContext?: EventContextProviders;
  /** Event types emitted while event consent is not granted. Defaults to identify and page. */
  allowedEventTypes?: readonly AllowedEventType[];
  /** Called when consent drops an event. Blocked events are never replayed. */
  onEventBlocked?: (event: BlockedEvent) => void;
  /** Anonymous identity provider; takes precedence over the active profile id. */
  getAnonymousId?: () => string | undefined;
  /**
   * Queue policy: `flush` sets retry, backoff and circuit behavior for both queues, and
   * `offlineMaxEvents` caps the offline Personalization queue (default 100).
   */
  queuePolicy?: QueuePolicy;
  /**
   * Consent applied at startup. Configured values take precedence over a stored
   * decision, and `consent` is also the default for `persistenceConsent`.
   */
  defaults?: ConfigDefaults;
  /**
   * How the identity cookie is written and deleted: domain, path, SameSite, Secure and
   * expiry (365 days by default). It is the cookie a server reads to recognise the
   * visitor, so a deletion always uses the scope it was written with.
   */
  cookie?: IdentityCookieOptions;
};

export interface CurrentPageOptions {
  /** Application-owned pathname and search string. */
  readonly routeKey: string;
  readonly buildPayload: (metadata: {
    isInitialEmission: boolean;
  }) => PageViewBuilderArgs | undefined;
  /** Optional framework lifetime before event admission. */
  readonly isCurrent?: () => boolean;
}

export interface HydrateAndTrackCurrentPageOptions extends Omit<
  CurrentPageOptions,
  'buildPayload'
> {
  readonly buildPayload?: CurrentPageOptions['buildPayload'];
  /** Framework operation lifetime; SDK lifetime and accepted queue work remain SDK-owned. */
  readonly isCurrent?: () => boolean;
}

export type ExperiencesTrackingApi = EntryInteractionApi;
