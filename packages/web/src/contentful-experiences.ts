import {
  ContentfulExperiences as ClientContentfulExperiences,
  type ContentfulExperiencesConfig,
  type EventBuilderConfig,
  type EventProfile,
  type RuntimeEventMethods,
} from '@contentful/experiences-client';

import { getPageProperties, getUserAgent } from './browser-event-context.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

/** Optional browser context providers, useful for application-specific redaction. */
export type BrowserEventContextProviders = Pick<
  EventBuilderConfig,
  'getPageProperties' | 'getUserAgent' | 'getConsent'
>;

/**
 * Long-lived, browser-oriented SDK configuration.
 */
export type ExperiencesWebConfig = Omit<ContentfulExperiencesConfig, 'eventBuilder' | 'locale'> & {
  locale?: string;
  app?: EventBuilderConfig['app'];
  browserContext?: BrowserEventContextProviders;
  /** Volatile event profile. The Web SDK does not persist it. */
  profile?: EventProfile;
};

type WebEventMethods = Pick<
  RuntimeEventMethods,
  'identify' | 'page' | 'track' | 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView'
>;

/** Browser runtime with mutable application locale and live event context. */
export class ContentfulExperiences extends ClientContentfulExperiences {
  #locale: string | undefined;
  #profile: EventProfile | undefined;
  #profileRevision = 0;
  readonly #eventMethods: RuntimeEventMethods;
  readonly identify: WebEventMethods['identify'] = (...args) =>
    this.#eventMethods.identify(...args);
  readonly page: WebEventMethods['page'] = (...args) => this.#eventMethods.page(...args);
  readonly track: WebEventMethods['track'] = (...args) => this.#eventMethods.track(...args);
  readonly trackView: WebEventMethods['trackView'] = (...args) =>
    this.#eventMethods.trackView(...args);
  readonly trackClick: WebEventMethods['trackClick'] = (...args) =>
    this.#eventMethods.trackClick(...args);
  readonly trackHover: WebEventMethods['trackHover'] = (...args) =>
    this.#eventMethods.trackHover(...args);
  readonly trackFlagView: WebEventMethods['trackFlagView'] = (...args) =>
    this.#eventMethods.trackFlagView(...args);

  constructor(config: ExperiencesWebConfig) {
    const { app, browserContext, profile, ...clientConfig } = config;
    super({
      ...clientConfig,
      eventBuilder: {
        app,
        channel: 'web',
        library: DEFAULT_EVENT_CONTEXT_LIBRARY,
        getPageProperties: browserContext?.getPageProperties ?? getPageProperties,
        getUserAgent: browserContext?.getUserAgent ?? getUserAgent,
        getConsent: browserContext?.getConsent,
      },
    });
    this.#locale = clientConfig.locale;
    this.#profile = profile;
    this.#eventMethods = this.createEventMethods({
      getProfile: () => this.#profile,
      setProfile: (nextProfile) => {
        this.#profile = nextProfile;
      },
      getProfileRevision: () => this.#profileRevision,
    });
  }

  override get locale(): string | undefined {
    return this.#locale;
  }

  get profile(): EventProfile | undefined {
    return this.#profile;
  }

  /** Changes the default locale used by subsequent events and fetches. */
  setLocale(locale: string | undefined): void {
    this.#locale = locale;
  }

  /** Clears volatile event state when the active browser profile changes. */
  reset(): void {
    this.#profile = undefined;
    this.#profileRevision += 1;
  }
}
